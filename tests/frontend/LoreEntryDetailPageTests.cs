using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LoreEntryDetailPageTests : BunitContext
{
    public LoreEntryDetailPageTests()
    {
        // The ConfirmDialog now renders on the Dialog primitive, which
        // imports ./js/dialog.js for scroll-lock in OnAfterRenderAsync --
        // none of these tests are about that interop itself.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private const string EntryJson = """
        {"success":true,"data":{
            "id":3,"projectId":1,"title":"The Silver Vale",
            "content":"# History\n\nA misty valley of **old magic**.",
            "createdAt":"2026-01-01"
        }}
        """;

    private RoutedFakeHttpMessageHandler UseDefaultRoutes()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/lore/3", EntryJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        return handler;
    }

    private static Action<ComponentParameterCollectionBuilder<LoreEntryDetail>> DefaultParams =>
        parameters => parameters.Add(p => p.ProjectId, 1).Add(p => p.Id, 3);

    [Fact]
    public void LoreEntryDetail_RendersTitleAndRenderedMarkdown()
    {
        UseDefaultRoutes();

        var cut = Render<LoreEntryDetail>(DefaultParams);

        Assert.Contains("The Silver Vale", cut.Markup);
        Assert.Contains("<h1", cut.Markup);
        Assert.Contains("<strong>old magic</strong>", cut.Markup);
    }

    [Fact]
    public void LoreEntryDetail_DisablesRawHtmlInContent()
    {
        var handlerWithHtml = new RoutedFakeHttpMessageHandler().WhenPathEndsWith(
            "/lore/3",
            """{"success":true,"data":{"id":3,"projectId":1,"title":"The Silver Vale","content":"<script>alert(1)</script>","createdAt":"2026-01-01"}}""");
        var httpClient = new HttpClient(handlerWithHtml) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();

        var cut = Render<LoreEntryDetail>(DefaultParams);

        Assert.DoesNotContain("<script>", cut.Markup);
    }

    [Fact]
    public void LoreEntryDetail_DeleteButton_OpensConfirmDialog()
    {
        UseDefaultRoutes();

        var cut = Render<LoreEntryDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Lore-Eintrag wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void LoreEntryDetail_ConfirmDialog_Confirm_DeletesTheEntry()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/projects/1/lore/3", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/lore/3", EntryJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();

        var cut = Render<LoreEntryDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
    }

    [Fact]
    public void LoreEntryDetail_EditButton_ShowsEditFormWithCurrentValues()
    {
        UseDefaultRoutes();

        var cut = Render<LoreEntryDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("The Silver Vale", cut.Find("#lore-edit-title").GetAttribute("value"));
    }

    [Fact]
    public void LoreEntryDetail_SaveEdit_SendsUpdatedTitle()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":3,"projectId":1,"title":"The Silver Vale Reborn","content":"# History\n\nA misty valley of **old magic**.","createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/lore/3", EntryJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();

        var cut = Render<LoreEntryDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#lore-edit-title").Change("The Silver Vale Reborn");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/projects/1/lore/3", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("The Silver Vale Reborn", cut.Markup);
        Assert.Empty(cut.FindAll("#lore-edit-form"));
    }

    // UI/UX plan A5: editing happens in a dialog that asks before
    // discarding typed input.
    [Fact]
    public void LoreEntryDetail_EditDialog_CancelWithoutChanges_ClosesImmediately()
    {
        UseDefaultRoutes();

        var cut = Render<LoreEntryDetail>(DefaultParams);
        cut.Find("#lore-edit-button").Click();
        Assert.Equal("Lore-Eintrag bearbeiten", cut.Find(".dialog-title").TextContent);
        cut.FindAll(".dialog button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();

        Assert.Empty(cut.FindAll("#lore-edit-form"));
    }

    [Fact]
    public void LoreEntryDetail_EditDialog_KeepEditing_LeavesTheDialogOpen()
    {
        UseDefaultRoutes();

        var cut = Render<LoreEntryDetail>(DefaultParams);
        cut.Find("#lore-edit-button").Click();
        cut.Find("#lore-edit-title").Change("The Silver Vale Reborn");
        cut.FindAll(".dialog button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();
        Assert.Contains("Ungespeicherte Änderungen verwerfen?", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Weiter bearbeiten").Click();

        Assert.DoesNotContain("Ungespeicherte Änderungen verwerfen?", cut.Markup);
        Assert.Equal("The Silver Vale Reborn", cut.Find("#lore-edit-title").GetAttribute("value"));
    }
}
