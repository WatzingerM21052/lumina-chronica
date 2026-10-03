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

    private const string ProjectWithoutMapJson = """{"success":true,"data":{"id":1,"title":"Aetherfall","description":null,"type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""";

    private RoutedFakeHttpMessageHandler UseDefaultRoutes(string locationJson) =>
        new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/locations/9", locationJson);

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        // A placed location asks for the project's map; these tests' project
        // has none (the mini map has its own test).
        handler.WhenPathEndsWith("/projects/1", ProjectWithoutMapJson);
        Services.AddSingleton<ElementMetricsService>();
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

    // A place on the project map shows that map, its pin in the middle:
    // the image is offset by the pin's position times the zoom.
    [Fact]
    public void LocationDetail_PlacedLocation_ShowsTheMapCentredOnItsPin()
    {
        UseHandler(UseDefaultRoutes(LocationJson)
            .WhenPathEndsWith("/projects/1", """{"success":true,"data":{"id":1,"title":"Aetherfall","description":null,"type":"WORLD","coverUrl":null,"mapUrl":"/api/projects/1/map","visibility":"PRIVATE","createdAt":"2026-01-01"}}""")
            .WhenPathEndsWith("/projects/1/map", "fake-map-bytes", "image/png"));
        JSInterop.SetupModule("./js/blobUrl.js")
            .Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-map");

        var cut = Render<LocationDetail>(DefaultParams);

        cut.WaitForAssertion(() => Assert.Equal("blob:fake-map", cut.Find(".location-minimap img").GetAttribute("src")), TimeSpan.FromSeconds(2));
        var style = cut.Find(".location-minimap").GetAttribute("style");
        // Zoom 3 in a 2:1 window, map aspect 1.5 until it has loaded: the
        // image is 300 % wide and 3 * 2 / 1.5 = 400 % high, so x 42.5 ->
        // 50 - 127.5 = -77.5 % and y 17.25 -> 50 - 69 = -19 %.
        Assert.Contains("--map-width: 300%", style);
        Assert.Contains("--map-height: 400%", style);
        Assert.Contains("--map-left: -77.5%", style);
        Assert.Contains("--map-top: -19%", style);
    }
}
