using System.Security.Claims;
using Bunit;
using Bunit.TestDoubles;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProjectDetailPageTests : BunitContext
{
    // Comments (v3.3, issue #325) injects AuthenticationStateProvider to read
    // the current user's id via ClaimTypes.NameIdentifier (same claim
    // LuminaAuthStateProvider populates from the real JWT's `sub`).
    // SetClaims (not SetAuthorized, which only sets a Name claim) is what
    // lets a test control _currentUserId.
    private void UseAuthenticatedUser(int userId = 1) => AddAuthorization().SetClaims(new Claim(ClaimTypes.NameIdentifier, userId.ToString()));

    // The Bücher tab's search debounce timer is created through the
    // injected TimeProvider, so tests advance this clock explicitly instead
    // of waiting out a real 400ms timer -- which, under a loaded full-suite
    // run, could fire late enough to blow a WaitForAssertion timeout.
    private readonly FakeTimeProvider _timeProvider = new();

    public ProjectDetailPageTests()
    {
        // Loose mode: only the map-with-content test actually exercises the
        // blobUrl.js interop (a real mapUrl); every other test's mapUrl is
        // null so LoadMapAsync short-circuits before touching JS.
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<TimeProvider>(_timeProvider);
    }

    private const string ProjectJson = """{"success":true,"data":{"id":1,"title":"Aetherfall","description":"Ein sky-shattered Kontinent","type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""";
    private const string EmptyCharactersJson = """{"success":true,"data":[]}""";
    private const string EmptyLocationsJson = """{"success":true,"data":[]}""";
    private const string EmptyTimelineJson = """{"success":true,"data":[]}""";
    private const string EmptyLoreJson = """{"success":true,"data":[]}""";
    private const string EmptyBooksJson = """{"success":true,"data":[]}""";
    private const string EmptyFilesJson = """{"success":true,"data":[]}""";
    private const string EmptyCommentsJson = """{"success":true,"data":[]}""";

    private RoutedFakeHttpMessageHandler UseDefaultRoutes()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();
        return handler;
    }

    [Fact]
    public void ProjectDetail_RendersTitleTypeAndDescription()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Aetherfall", cut.Markup);
        Assert.Contains("Welt", cut.Markup);
        Assert.Contains("Ein sky-shattered Kontinent", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_Tabs_AreATablist_WithTheActiveTabSelected()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        var tabs = cut.FindAll(".project-tabs[role=tablist] [role=tab]");

        Assert.Equal(7, tabs.Count);
        Assert.Equal("true", tabs[0].GetAttribute("aria-selected"));
        Assert.All(tabs.Skip(1), t => Assert.Equal("false", t.GetAttribute("aria-selected")));

        tabs[1].Click(); // "Charaktere"

        var updated = cut.FindAll(".project-tabs [role=tab]");
        Assert.Equal("false", updated[0].GetAttribute("aria-selected"));
        Assert.Equal("true", updated[1].GetAttribute("aria-selected"));
    }

    [Fact]
    public void ProjectDetail_Overview_PutsTheCoverBesideTheInfoColumn()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));

        // Same header shape as BookDetail: cover and title in one .book-detail row.
        var header = cut.Find(".book-detail.project-overview");
        Assert.NotNull(header.QuerySelector(".book-detail-cover"));
        Assert.Contains("Aetherfall", header.QuerySelector(".book-detail-info h1")!.TextContent);
    }

    [Fact]
    public void ProjectDetail_DeleteButton_OpensConfirmDialog()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Projekt wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_ConfirmDialog_Confirm_DeletesTheProject()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/projects/1", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
    }

    [Fact]
    public void ProjectDetail_EditButton_ShowsEditFormWithCurrentValues()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("Aetherfall", cut.Find("#project-edit-title").GetAttribute("value"));
    }

    [Fact]
    public void ProjectDetail_EditForm_VisibilitySelector_ShowsCurrentValue()
    {
        // Community Phase 1 (issue #300) -- visibility has existed in the DB
        // and this model since v2.0 but was never actually settable until now.
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("PRIVATE", cut.Find("#project-edit-visibility").GetAttribute("value"));
    }

    [Fact]
    public void ProjectDetail_SaveEdit_SendsUpdatedTitleAndType()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"title":"Aetherfall Reborn","description":"Ein sky-shattered Kontinent","type":"RPG","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#project-edit-title").Change("Aetherfall Reborn");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/projects/1", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("Aetherfall Reborn", cut.Find("h1").TextContent);
        Assert.Empty(cut.FindAll("#project-edit-form"));
    }

    // UI/UX plan A3: editing happens in a dialog; the header stays visible.
    [Fact]
    public void ProjectDetail_Edit_OpensADialog_AndKeepsTheHeaderVisible()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#project-edit-button").Click();

        Assert.Equal("Projekt bearbeiten", cut.Find(".dialog-title").TextContent);
        Assert.Contains("Aetherfall", cut.Find("h1").TextContent);
    }

    [Fact]
    public void ProjectDetail_EditDialog_CancelWithoutChanges_ClosesImmediately()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#project-edit-button").Click();
        cut.FindAll(".dialog button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();

        Assert.Empty(cut.FindAll("#project-edit-form"));
    }

    [Fact]
    public void ProjectDetail_EditDialog_EscapeWithChanges_AsksBeforeDiscarding()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#project-edit-button").Click();
        cut.Find("#project-edit-title").Change("Aetherfall II");
        cut.Find(".dialog").KeyDown(new Microsoft.AspNetCore.Components.Web.KeyboardEventArgs { Key = "Escape" });

        Assert.NotEmpty(cut.FindAll("#project-edit-form"));
        Assert.Contains("Ungespeicherte Änderungen verwerfen?", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Verwerfen").Click();
        Assert.Empty(cut.FindAll("#project-edit-form"));
        Assert.Contains("Aetherfall", cut.Find("h1").TextContent);
    }

    [Fact]
    public void ProjectDetail_CharactersTab_ShowsEmptyMessage_WhenNoCharactersExist()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charaktere").Click();

        Assert.Contains("Dieses Projekt hat noch keine Charaktere", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_CharactersTab_RendersCharacterCardsFromApiResponse()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/characters",
                """{"success":true,"data":[{"id":5,"projectId":1,"name":"Elarion","description":null,"imageUrl":null,"age":null,"origin":"The Silver Vale","personality":null,"biography":null,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charaktere").Click();

        Assert.Contains("Elarion", cut.Markup);
        Assert.Contains("The Silver Vale", cut.Markup);
        Assert.Single(cut.FindAll("a.project-card"));
    }

    [Fact]
    public void ProjectDetail_CreateCharacterForm_SubmitsNameAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                createRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":5,"projectId":1,"name":"Elarion","description":null,"imageUrl":null,"age":null,"origin":null,"personality":null,"biography":null,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charaktere").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charakter hinzufügen").Click();
        cut.Find("#character-name").Change("Elarion");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects/1/characters", createRequest?.RequestUri?.AbsolutePath);
        Assert.Empty(cut.FindAll("#create-character-form"));
    }

    // UI/UX plan A5: the tab forms are dialogs that open fresh and ask
    // before discarding typed input.
    [Fact]
    public void ProjectDetail_CreateCharacterDialog_AsksBeforeDiscarding_AndReopensEmpty()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charaktere").Click();
        cut.Find("#add-character-button").Click();
        Assert.Equal("Charakter hinzufügen", cut.Find(".dialog-title").TextContent);

        cut.Find("#character-name").Change("Elarion");
        cut.FindAll(".dialog button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();
        Assert.Contains("Ungespeicherte Änderungen verwerfen?", cut.Markup);
        Assert.NotEmpty(cut.FindAll("#create-character-form"));

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Verwerfen").Click();
        Assert.Empty(cut.FindAll("#create-character-form"));

        cut.Find("#add-character-button").Click();
        Assert.Equal("", cut.Find("#character-name").GetAttribute("value"));
    }

    [Fact]
    public void ProjectDetail_CreateCharacterDialog_UsesADropzoneForTheImage()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charaktere").Click();
        cut.Find("#add-character-button").Click();

        Assert.NotNull(cut.Find(".dialog .dropzone #character-image"));
        Assert.Contains("Bild hierher ziehen", cut.Find(".dialog .dropzone-label").TextContent);
    }

    [Fact]
    public void ProjectDetail_MapTab_ShowsUploadDropzone_WhenNoMapSet()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Karte").Click();

        Assert.Contains("Kartenbild hochladen", cut.Markup);
        Assert.Contains("Dieses Projekt hat noch keine Orte", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_MapTab_RendersLocationCardsFromApiResponse()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/locations",
                """{"success":true,"data":[{"id":9,"projectId":1,"name":"Ashen Hollow","description":null,"imageUrl":null,"x":42.5,"y":17.25,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Karte").Click();

        Assert.Contains("Ashen Hollow", cut.Markup);
        Assert.Single(cut.FindAll("a.project-card"));
    }

    [Fact]
    public void ProjectDetail_CreateLocationForm_SubmitsNameAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                createRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":9,"projectId":1,"name":"Ashen Hollow","description":null,"imageUrl":null,"x":null,"y":null,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Karte").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ort hinzufügen").Click();
        cut.Find("#location-name").Change("Ashen Hollow");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects/1/locations", createRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ProjectDetail_MapTab_RendersPinForPlacedLocation_WhenMapIsSet()
    {
        var projectWithMap = """{"success":true,"data":{"id":1,"title":"Aetherfall","description":"Ein sky-shattered Kontinent","type":"WORLD","coverUrl":null,"mapUrl":"/api/projects/1/map","visibility":"PRIVATE","createdAt":"2026-01-01"}}""";
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/locations",
                """{"success":true,"data":[{"id":9,"projectId":1,"name":"Ashen Hollow","description":null,"imageUrl":null,"x":42.5,"y":17.25,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/map", "fake map bytes", "image/jpeg")
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", projectWithMap);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();
        JSInterop.SetupModule("./js/blobUrl.js").Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-map-url");

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Karte").Click();

        var pin = cut.Find("a.map-pin");
        Assert.Contains("left:42.5%", pin.GetAttribute("style"));
        Assert.Contains("top:17.25%", pin.GetAttribute("style"));
    }

    [Fact]
    public void ProjectDetail_TimelineTab_ShowsEmptyMessage_WhenNoEventsExist()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();

        Assert.Contains("Dieses Projekt hat noch keine Ereignisse auf der Zeitleiste", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_TimelineEvent_Delete_AsksFirst_AndSingleEventHasNoMoveButtons()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Delete, r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":null}""");
            })
            .WhenPathEndsWith(
                "/timeline",
                """{"success":true,"data":[{"id":5,"projectId":1,"title":"The Sundering","description":null,"date":null,"order":0,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();

        Assert.Empty(cut.FindAll(".timeline-move-button")); // nothing to reorder
        cut.Find(".timeline-event-controls .btn-icon-danger").Click();
        Assert.Contains("Dieses Ereignis wirklich löschen?", cut.Markup);
        Assert.Null(deleteRequest);

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.Equal("/api/projects/1/timeline/5", deleteRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ProjectDetail_TimelineTab_RendersEventsInOrder()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/timeline",
                """
                {"success":true,"data":[
                    {"id":1,"projectId":1,"title":"The Sundering","description":"The continent splits","date":"Jahr 1247","order":0,"createdAt":"2026-01-01"},
                    {"id":2,"projectId":1,"title":"The Reckoning","description":null,"date":"Jahr 1300","order":1,"createdAt":"2026-01-02"}
                ]}
                """)
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();

        var titles = cut.FindAll(".timeline-event-title").Select(e => e.TextContent).ToList();
        Assert.Equal(["The Sundering", "The Reckoning"], titles);
        Assert.Contains("Jahr 1247", cut.Markup);

        var moveButtons = cut.FindAll(".timeline-move-button");
        Assert.True(moveButtons[0].HasAttribute("disabled")); // first event can't move up
        Assert.False(moveButtons[1].HasAttribute("disabled")); // first event can move down
    }

    [Fact]
    public void ProjectDetail_CreateEventForm_SubmitsTitleAndReloadsTimeline()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath == "/api/projects/1/timeline", r =>
            {
                createRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"projectId":1,"title":"The Sundering","description":null,"date":null,"order":0,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ereignis hinzufügen").Click();
        cut.Find("#event-title").Change("The Sundering");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects/1/timeline", createRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ProjectDetail_TimelineEvent_EditsInADialog()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"projectId":1,"title":"The Great Sundering","description":null,"date":"Jahr 1247","order":0,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith(
                "/timeline",
                """{"success":true,"data":[{"id":1,"projectId":1,"title":"The Sundering","description":null,"date":"Jahr 1247","order":0,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();
        cut.Find(".timeline-event-controls").QuerySelectorAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        Assert.Equal("Ereignis bearbeiten", cut.Find(".dialog-title").TextContent);
        Assert.Equal("The Sundering", cut.Find("#event-edit-title").GetAttribute("value"));
        // The list keeps showing the card; it isn't swapped for a form.
        Assert.Single(cut.FindAll(".timeline-event-card"));

        cut.Find("#event-edit-title").Change("The Great Sundering");
        cut.Find("#edit-event-form").Submit();

        Assert.Equal("/api/projects/1/timeline/1", putRequest?.RequestUri?.AbsolutePath);
        Assert.Empty(cut.FindAll("#edit-event-form"));
    }

    [Fact]
    public void ProjectDetail_TimelineEvent_MoveUpButton_CallsMoveEndpoint()
    {
        HttpRequestMessage? moveRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Put && r.RequestUri!.AbsolutePath == "/api/projects/1/timeline/2/move", r =>
            {
                moveRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """
                    {"success":true,"data":[
                        {"id":2,"projectId":1,"title":"The Reckoning","description":null,"date":null,"order":0,"createdAt":"2026-01-02"},
                        {"id":1,"projectId":1,"title":"The Sundering","description":null,"date":null,"order":1,"createdAt":"2026-01-01"}
                    ]}
                    """);
            })
            .WhenPathEndsWith(
                "/timeline",
                """
                {"success":true,"data":[
                    {"id":1,"projectId":1,"title":"The Sundering","description":null,"date":null,"order":0,"createdAt":"2026-01-01"},
                    {"id":2,"projectId":1,"title":"The Reckoning","description":null,"date":null,"order":1,"createdAt":"2026-01-02"}
                ]}
                """)
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();
        cut.FindAll(".timeline-move-button")[2].Click(); // second event's "up" button

        Assert.Equal(HttpMethod.Put, moveRequest?.Method);
        var titlesAfterMove = cut.FindAll(".timeline-event-title").Select(e => e.TextContent).ToList();
        Assert.Equal(["The Reckoning", "The Sundering"], titlesAfterMove);
    }

    [Fact]
    public void ProjectDetail_LoreTab_ShowsEmptyMessage_WhenNoEntriesExist()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lore").Click();

        Assert.Contains("Dieses Projekt hat noch keine Lore-Einträge", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_LoreTab_RendersEntryCardsFromApiResponse()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/lore",
                """{"success":true,"data":[{"id":3,"projectId":1,"title":"The Silver Vale","content":"Old magic.","createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lore").Click();

        Assert.Contains("The Silver Vale", cut.Markup);
        Assert.Single(cut.FindAll("a.project-card"));
    }

    [Fact]
    public void ProjectDetail_CreateLoreForm_SubmitsTitleAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath == "/api/projects/1/lore", r =>
            {
                createRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":3,"projectId":1,"title":"The Silver Vale","content":null,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lore").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lore-Eintrag hinzufügen").Click();
        cut.Find("#lore-title").Change("The Silver Vale");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects/1/lore", createRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ProjectDetail_FilesTab_ShowsEmptyMessage_WhenNoFilesExist()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();

        Assert.Contains("Dieses Projekt hat noch keine Dateien", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_FilesTab_RendersFileCardsFromApiResponse()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/files",
                """{"success":true,"data":[{"id":7,"projectId":1,"name":"concept-art.jpg","category":"IMAGE","size":204800,"url":"/api/projects/1/files/7/content","createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/files/7/content", "fake image bytes", "image/jpeg")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();

        // Images are a square grid of thumbnails (name as title/alt), no size row.
        var tile = cut.Find(".file-image-grid .file-image-open");
        Assert.Equal("concept-art.jpg", tile.GetAttribute("title"));
        Assert.Empty(cut.FindAll(".file-document-row"));
    }

    private RoutedFakeHttpMessageHandler FileRoutes(string filesJson, params (string Suffix, string Content, string ContentType)[] contents)
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson);
        foreach (var (suffix, content, contentType) in contents)
        {
            handler = handler.WhenPathEndsWith(suffix, content, contentType);
        }
        return handler
            .WhenPathEndsWith("/files", filesJson)
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
    }

    private void UseFileHandler(RoutedFakeHttpMessageHandler handler)
    {
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();
    }

    [Fact]
    public void ProjectDetail_ImageClick_OpensLightbox_AndArrowsFlipThroughImages()
    {
        var blobs = JSInterop.SetupModule("./js/blobUrl.js");
        blobs.Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-image");
        const string filesJson = """
            {"success":true,"data":[
              {"id":7,"projectId":1,"name":"north.jpg","category":"IMAGE","size":2048,"url":"/api/projects/1/files/7/content","createdAt":"2026-01-01"},
              {"id":8,"projectId":1,"name":"south.jpg","category":"IMAGE","size":2048,"url":"/api/projects/1/files/8/content","createdAt":"2026-01-01"}
            ]}
            """;
        UseFileHandler(FileRoutes(filesJson, ("/files/7/content", "a", "image/jpeg"), ("/files/8/content", "b", "image/jpeg")));

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".file-image-open img").Count));

        cut.FindAll(".file-image-open")[1].Click();
        Assert.Equal("south.jpg", cut.Find(".dialog--lightbox .lightbox-stage img").GetAttribute("alt"));
        Assert.Equal("2 / 2", cut.Find(".lightbox-counter").TextContent);

        // Wraps around from the last image to the first.
        cut.Find(".lightbox-arrow--next").Click();
        Assert.Equal("north.jpg", cut.Find(".lightbox-stage img").GetAttribute("alt"));
        cut.Find(".lightbox-stage").KeyDown(new Microsoft.AspNetCore.Components.Web.KeyboardEventArgs { Key = "ArrowLeft" });
        Assert.Equal("south.jpg", cut.Find(".lightbox-stage img").GetAttribute("alt"));
    }

    [Fact]
    public void ProjectDetail_MarkdownDocument_OpensInTheViewer_WithHtmlShownAsText()
    {
        const string filesJson = """
            {"success":true,"data":[{"id":9,"projectId":1,"name":"magic.md","category":"DOCUMENT","size":64,"url":"/api/projects/1/files/9/content","createdAt":"2026-01-01"}]}
            """;
        UseFileHandler(FileRoutes(filesJson, ("/files/9/content", "# Magie\n\nDas **Siegel** <script>alert(1)</script>", "text/markdown")));

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        Assert.Contains("MD · 64 B", cut.Find(".file-document-meta").TextContent);

        cut.Find(".file-document-open").Click();

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find(".dialog--viewer .file-viewer-markdown")));
        var article = cut.Find(".file-viewer-markdown");
        Assert.Equal("Magie", article.QuerySelector("h1")!.TextContent);
        Assert.Equal("Siegel", article.QuerySelector("strong")!.TextContent);
        Assert.Null(article.QuerySelector("script"));
    }

    [Fact]
    public void ProjectDetail_WordDocument_ClickDownloadsInsteadOfOpeningTheViewer()
    {
        var blobs = JSInterop.SetupModule("./js/blobUrl.js");
        blobs.Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-docx");
        var download = blobs.SetupVoid("triggerDownload", _ => true);
        download.SetVoidResult();
        const string filesJson = """
            {"success":true,"data":[{"id":10,"projectId":1,"name":"plot.docx","category":"DOCUMENT","size":4096,"url":"/api/projects/1/files/10/content","createdAt":"2026-01-01"}]}
            """;
        UseFileHandler(FileRoutes(filesJson, ("/files/10/content", "docx-bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")));

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        cut.Find(".file-document-open").Click();

        cut.WaitForAssertion(() => Assert.Single(download.Invocations));
        Assert.Empty(cut.FindAll(".dialog--viewer"));
    }

    [Fact]
    public void ProjectDetail_DeleteFileButton_CallsDeleteEndpoint()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Delete, r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("{}");
            })
            .WhenPathEndsWith(
                "/files",
                """{"success":true,"data":[{"id":7,"projectId":1,"name":"notes.txt","category":"DOCUMENT","size":1024,"url":"/api/projects/1/files/7/content","createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        cut.Find(".file-document-row .btn-icon-danger").Click();

        // Asks first; nothing is deleted until confirmed.
        Assert.Contains("Diese Datei wirklich löschen?", cut.Markup);
        Assert.Null(deleteRequest);
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.Equal(HttpMethod.Delete, deleteRequest?.Method);
        Assert.Equal("/api/projects/1/files/7", deleteRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ProjectDetail_BooksTab_ShowsEmptyMessage_WhenNoBooksLinked()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bücher").Click();

        Assert.Contains("Diesem Projekt sind noch keine Bücher zugeordnet", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_BooksTab_RendersLinkedBookCardsFromApiResponse()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .WhenPathEndsWith(
                "/books",
                """{"success":true,"data":[{"id":5,"title":"The Silver Vale","author":"J.R.R. Tolkien","coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bücher").Click();

        Assert.Contains("The Silver Vale", cut.Markup);
        Assert.Single(cut.FindAll("a.book-card"));
    }

    [Fact]
    public void ProjectDetail_BooksTab_RemoveButton_CallsRemoveEndpoint()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/projects/1/books/5", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("{}");
            })
            .WhenPathEndsWith(
                "/books",
                """{"success":true,"data":[{"id":5,"title":"The Silver Vale","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bücher").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Vom Projekt entfernen").Click();

        Assert.NotNull(deleteRequest);
    }

    [Fact]
    public void ProjectDetail_BooksTab_SearchInput_AfterDebounce_ShowsSuggestionAndAddButtonCallsAddEndpoint()
    {
        HttpRequestMessage? addRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/comments", EmptyCommentsJson)
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath == "/api/projects/1/books/9", r =>
            {
                addRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("{}");
            })
            .When(r => r.RequestUri!.AbsolutePath == "/api/books" && r.RequestUri.Query.Contains("pageSize=8"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"items":[{"id":9,"title":"Killimooin","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}],"total":1,"page":1,"pageSize":8}}"""))
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bücher").Click();
        cut.Find("input[type=search]").Input("Killi");

        _timeProvider.Advance(TimeSpan.FromMilliseconds(399));
        Assert.DoesNotContain("Killimooin", cut.Markup);

        _timeProvider.Advance(TimeSpan.FromMilliseconds(1));
        cut.WaitForAssertion(() => Assert.Contains("Killimooin", cut.Markup), TimeSpan.FromSeconds(2));
        cut.Find(".library-search-suggestions button").Click();

        cut.WaitForAssertion(() => Assert.NotNull(addRequest), TimeSpan.FromSeconds(2));
    }

    // Comments (v3.3, issue #325). GET /api/projects/:id is strictly
    // owner-only, so in practice this page (and thus these comments) is
    // only ever reached by the project's own owner -- see the code comment
    // on ProjectDetail.razor's _comments field for why non-owner PUBLIC
    // project commenting has no frontend surface yet.
    private const string ProjectCommentsJson =
        """{"success":true,"data":[{"id":5,"userId":1,"username":"alice","content":"Planning notes","createdAt":"2026-01-04"}]}""";

    [Fact]
    public void ProjectDetail_RendersComments_WithUsernameAndContent()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/comments", ProjectCommentsJson)
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser(userId: 1);

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));

        var items = cut.FindAll("li.book-comment-item");
        Assert.Single(items);
        Assert.Contains("alice", items[0].TextContent);
        Assert.Contains("Planning notes", items[0].TextContent);
        // Own comment (userId 1 == current user) -- delete button present.
        Assert.Single(items[0].QuerySelectorAll("button"));
    }

    [Fact]
    public void ProjectDetail_SubmittingCommentForm_SendsPostWithContent()
    {
        HttpRequestMessage? postRequest = null;
        string? postBody = null;
        // POST-specific route registered before the generic
        // WhenPathEndsWith("/comments", ...) stub -- see BookDetailPageTests'
        // identical comment for why insertion order matters here.
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath.EndsWith("/comments"), r =>
            {
                postRequest = r;
                postBody = r.Content?.ReadAsStringAsync().Result;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/comments", """{"success":true,"data":[]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/books", EmptyBooksJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
        UseAuthenticatedUser();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find(".comment-form textarea").Input("Love this world!");
        cut.Find("form.comment-form").Submit();

        Assert.Equal(HttpMethod.Post, postRequest?.Method);
        Assert.Equal("/api/projects/1/comments", postRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("\"content\":\"Love this world!\"", postBody);
    }

    // Design audit F3: the overview counts what the project holds, and each
    // tile opens its tab; the other tabs keep the project name on screen.
    [Fact]
    public void ProjectDetail_OverviewStats_OpenTheirTab_AndOtherTabsShowTheProjectName()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        var tiles = cut.FindAll(".project-stats .project-stat");
        Assert.Equal(6, tiles.Count);
        Assert.Equal("0", tiles[0].QuerySelector(".project-stat-value")!.TextContent);
        Assert.Empty(cut.FindAll(".project-compact-title"));

        cut.FindAll(".project-stat").Single(t => t.TextContent.Contains("Orte")).Click();

        Assert.Equal("true", cut.FindAll(".project-tabs [role=tab]")[2].GetAttribute("aria-selected"));
        Assert.Equal("Aetherfall", cut.Find("h1.project-compact-title").TextContent);
    }

    // User request: up to ten files in one go, the kind taken from each
    // file's extension, and anything the backend would refuse named with
    // its reason before upload.
    [Fact]
    public void ProjectDetail_FileUpload_TakesSeveralFiles_SortsOutTheWrongOnes_AndUploadsTheRest()
    {
        var posted = new List<string>();
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post && r.RequestUri!.AbsolutePath.EndsWith("/files"), r =>
            {
                posted.Add(r.Content!.ReadAsStringAsync().Result);
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"id":9,"projectId":1,"name":"x","category":"IMAGE","size":1,"url":"/api/projects/1/files/9/content","createdAt":"2026-01-01"}}""");
            });
        foreach (var (suffix, json) in new[] { ("/comments", EmptyCommentsJson), ("/files", EmptyFilesJson), ("/characters", EmptyCharactersJson), ("/locations", EmptyLocationsJson),
                     ("/timeline", EmptyTimelineJson), ("/lore", EmptyLoreJson), ("/books", EmptyBooksJson), ("/projects/1", ProjectJson) })
        {
            handler = handler.WhenPathEndsWith(suffix, json);
        }
        UseFileHandler(handler);

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        cut.Find("#add-file-button").Click();

        Assert.Contains("JPG, PNG, WebP", cut.Find(".dropzone-hint").TextContent);
        var input = cut.FindComponents<Microsoft.AspNetCore.Components.Forms.InputFile>()
            .Single(c => c.Instance.AdditionalAttributes?.TryGetValue("id", out var id) == true && (string)id == "file-upload");
        input.UploadFiles(
            InputFileContent.CreateFromText("map", "map.png", contentType: "image/png"),
            InputFileContent.CreateFromText("# Notes", "notes.md", contentType: "text/markdown"),
            InputFileContent.CreateFromText("MZ", "tool.exe", contentType: "application/octet-stream"));

        var rows = cut.FindAll(".file-upload-item");
        Assert.Equal(3, rows.Count);
        Assert.Contains("Format nicht erlaubt", cut.Find(".file-upload-item--rejected").TextContent);
        Assert.Contains("2 hochladen", cut.Find("button[form='create-file-form']").TextContent);

        cut.Find("#create-file-form").Submit();

        cut.WaitForAssertion(() => Assert.Equal(2, posted.Count), TimeSpan.FromSeconds(2));
        Assert.Contains(posted, body => body.Contains("IMAGE") && body.Contains("map.png"));
        Assert.Contains(posted, body => body.Contains("DOCUMENT") && body.Contains("notes.md"));
        // The rejected one keeps the dialog open so it stays visible.
        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".file-upload-item--done").Count), TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void ProjectDetail_FileUpload_MoreThanTen_TakesTheFirstTenAndSaysSo()
    {
        UseDefaultRoutes();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        cut.Find("#add-file-button").Click();
        var input = cut.FindComponents<Microsoft.AspNetCore.Components.Forms.InputFile>()
            .Single(c => c.Instance.AdditionalAttributes?.TryGetValue("id", out var id) == true && (string)id == "file-upload");
        input.UploadFiles(Enumerable.Range(1, 12).Select(i => InputFileContent.CreateFromText("x", $"note{i}.txt", contentType: "text/plain")).ToArray());

        Assert.Equal(10, cut.FindAll(".file-upload-item").Count);
        Assert.Contains("Höchstens 10 Dateien", cut.Find("#create-file-form .form-error").TextContent);
    }
}
