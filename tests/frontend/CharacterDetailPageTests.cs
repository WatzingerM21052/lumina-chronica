using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class CharacterDetailPageTests : BunitContext
{
    private const string CharacterJson = """
        {"success":true,"data":{
            "id":5,"projectId":1,"name":"Elarion","description":"A wandering mage",
            "imageUrl":null,"age":"over 900 years","origin":"The Silver Vale",
            "personality":"Curious, guarded","biography":"Once a court wizard.",
            "createdAt":"2026-01-01"
        }}
        """;

    private RoutedFakeHttpMessageHandler UseDefaultRoutes()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/characters/5", CharacterJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        return handler;
    }

    private static Action<ComponentParameterCollectionBuilder<CharacterDetail>> DefaultParams =>
        parameters => parameters.Add(p => p.ProjectId, 1).Add(p => p.Id, 5);

    [Fact]
    public void CharacterDetail_RendersNameOriginAgeAndBiography()
    {
        UseDefaultRoutes();

        var cut = Render<CharacterDetail>(DefaultParams);

        Assert.Contains("Elarion", cut.Markup);
        Assert.Contains("The Silver Vale", cut.Markup);
        Assert.Contains("over 900 years", cut.Markup);
        Assert.Contains("Once a court wizard.", cut.Markup);
    }

    [Fact]
    public void CharacterDetail_DeleteButton_OpensConfirmDialog()
    {
        UseDefaultRoutes();

        var cut = Render<CharacterDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Charakter wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void CharacterDetail_ConfirmDialog_Confirm_DeletesTheCharacter()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/projects/1/characters/5", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/characters/5", CharacterJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<CharacterDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
    }

    [Fact]
    public void CharacterDetail_EditButton_ShowsEditFormWithCurrentValues()
    {
        UseDefaultRoutes();

        var cut = Render<CharacterDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("Elarion", cut.Find("#character-edit-name").GetAttribute("value"));
        Assert.Equal("The Silver Vale", cut.Find("#character-edit-origin").GetAttribute("value"));
    }

    [Fact]
    public void CharacterDetail_SaveEdit_SendsUpdatedName()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":5,"projectId":1,"name":"Elarion the Wise","description":"A wandering mage","imageUrl":null,"age":"over 900 years","origin":"The Silver Vale","personality":"Curious, guarded","biography":"Once a court wizard.","createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/characters/5", CharacterJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<CharacterDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#character-edit-name").Change("Elarion the Wise");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/projects/1/characters/5", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("Elarion the Wise", cut.Markup);
    }
}
