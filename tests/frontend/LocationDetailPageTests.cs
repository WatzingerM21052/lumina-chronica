using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LocationDetailPageTests : BunitContext
{
    public LocationDetailPageTests()
    {
        // The ConfirmDialog now renders on the Dialog primitive, which
        // imports ./js/dialog.js for scroll-lock in OnAfterRenderAsync --
        // none of these tests are about that interop itself.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private const string LocationJson = """
        {"success":true,"data":{
            "id":9,"projectId":1,"name":"Ashen Hollow","description":"A misty valley",
            "imageUrl":null,"x":42.5,"y":17.25,"createdAt":"2026-01-01"
        }}
        """;

    private const string UnplacedLocationJson = """
        {"success":true,"data":{
            "id":9,"projectId":1,"name":"Ashen Hollow","description":"A misty valley",
            "imageUrl":null,"x":null,"y":null,"createdAt":"2026-01-01"
        }}
        """;

    private RoutedFakeHttpMessageHandler UseDefaultRoutes(string locationJson) =>
        new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/locations/9", locationJson);

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
    }

    private static Action<ComponentParameterCollectionBuilder<LocationDetail>> DefaultParams =>
        parameters => parameters.Add(p => p.ProjectId, 1).Add(p => p.Id, 9);

    [Fact]
    public void LocationDetail_RendersNameDescriptionAndPlacementStatus()
    {
        UseHandler(UseDefaultRoutes(LocationJson));

        var cut = Render<LocationDetail>(DefaultParams);

        Assert.Contains("Ashen Hollow", cut.Markup);
        Assert.Contains("A misty valley", cut.Markup);
        Assert.Contains("Auf der Karte platziert", cut.Markup);
    }

    [Fact]
    public void LocationDetail_ShowsNotPlaced_WhenXIsNull()
    {
        UseHandler(UseDefaultRoutes(UnplacedLocationJson));

        var cut = Render<LocationDetail>(DefaultParams);

        Assert.Contains("Nicht auf der Karte platziert", cut.Markup);
        Assert.DoesNotContain("Von der Karte entfernen", cut.Markup);
    }

    [Fact]
    public void LocationDetail_DeleteButton_OpensConfirmDialog()
    {
        UseHandler(UseDefaultRoutes(LocationJson));

        var cut = Render<LocationDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Ort wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void LocationDetail_ConfirmDialog_Confirm_DeletesTheLocation()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/projects/1/locations/9", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/locations/9", LocationJson);
        UseHandler(handler);

        var cut = Render<LocationDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
    }

    [Fact]
    public void LocationDetail_RemoveFromMapButton_SendsNullPosition()
    {
        HttpRequestMessage? putRequest = null;
        string? putBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                putBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse(UnplacedLocationJson);
            })
            .WhenPathEndsWith("/locations/9", LocationJson);
        UseHandler(handler);

        var cut = Render<LocationDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Von der Karte entfernen").Click();

        Assert.Equal("/api/projects/1/locations/9/position", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("\"x\":null", putBody);
        Assert.Contains("\"y\":null", putBody);
    }

    [Fact]
    public void LocationDetail_EditButton_ShowsEditFormWithCurrentValues()
    {
        UseHandler(UseDefaultRoutes(LocationJson));

        var cut = Render<LocationDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("Ashen Hollow", cut.Find("#location-edit-name").GetAttribute("value"));
    }

    [Fact]
    public void LocationDetail_SaveEdit_SendsUpdatedName()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":9,"projectId":1,"name":"Ashen Hollow Reborn","description":"A misty valley","imageUrl":null,"x":42.5,"y":17.25,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/locations/9", LocationJson);
        UseHandler(handler);

        var cut = Render<LocationDetail>(DefaultParams);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#location-edit-name").Change("Ashen Hollow Reborn");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/projects/1/locations/9", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("Ashen Hollow Reborn", cut.Markup);
        Assert.Empty(cut.FindAll("#location-edit-form"));
    }

    // UI/UX plan A5: editing happens in a dialog that asks before
    // discarding typed input.
    [Fact]
    public void LocationDetail_EditDialog_CancelWithoutChanges_ClosesImmediately()
    {
        UseHandler(UseDefaultRoutes(LocationJson));

        var cut = Render<LocationDetail>(DefaultParams);
        cut.Find("#location-edit-button").Click();
        Assert.Equal("Ort bearbeiten", cut.Find(".dialog-title").TextContent);
        cut.FindAll(".dialog button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();

        Assert.Empty(cut.FindAll("#location-edit-form"));
    }

    [Fact]
    public void LocationDetail_EditDialog_CancelWithChanges_AsksBeforeDiscarding()
    {
        UseHandler(UseDefaultRoutes(LocationJson));

        var cut = Render<LocationDetail>(DefaultParams);
        cut.Find("#location-edit-button").Click();
        cut.Find("#location-edit-name").Change("Ashen Hollow Reborn");
        cut.FindAll(".dialog button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();

        Assert.Contains("Ungespeicherte Änderungen verwerfen?", cut.Markup);
        Assert.NotEmpty(cut.FindAll("#location-edit-form"));

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Verwerfen").Click();
        Assert.Empty(cut.FindAll("#location-edit-form"));
        Assert.Equal("Ashen Hollow", cut.Find("h1").TextContent);
    }

    [Fact]
    public void LocationDetail_EditDialog_UsesADropzoneForTheImage()
    {
        UseHandler(UseDefaultRoutes(LocationJson));

        var cut = Render<LocationDetail>(DefaultParams);
        cut.Find("#location-edit-button").Click();

        Assert.NotNull(cut.Find(".dialog .dropzone #location-edit-image"));
    }
}
