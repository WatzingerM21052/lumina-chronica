using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProjectDetailPageTests : BunitContext
{
    public ProjectDetailPageTests()
    {
        // Loose mode: only the map-with-content test actually exercises the
        // blobUrl.js interop (a real mapUrl); every other test's mapUrl is
        // null so LoadMapAsync short-circuits before touching JS.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private const string ProjectJson = """{"success":true,"data":{"id":1,"title":"Aetherfall","description":"Ein sky-shattered Kontinent","type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}}""";
    private const string EmptyCharactersJson = """{"success":true,"data":[]}""";
    private const string EmptyLocationsJson = """{"success":true,"data":[]}""";
    private const string EmptyTimelineJson = """{"success":true,"data":[]}""";
    private const string EmptyLoreJson = """{"success":true,"data":[]}""";
    private const string EmptyFilesJson = """{"success":true,"data":[]}""";

    private RoutedFakeHttpMessageHandler UseDefaultRoutes()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
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
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

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
    public void ProjectDetail_SaveEdit_SendsUpdatedTitleAndType()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#project-edit-title").Change("Aetherfall Reborn");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/projects/1", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("Aetherfall Reborn", cut.Markup);
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
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith(
                "/characters",
                """{"success":true,"data":[{"id":5,"projectId":1,"name":"Elarion","description":null,"imageUrl":null,"age":null,"origin":"The Silver Vale","personality":null,"biography":null,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

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
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charaktere").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Charakter hinzufügen").Click();
        cut.Find("#character-name").Change("Elarion");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects/1/characters", createRequest?.RequestUri?.AbsolutePath);
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
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith(
                "/locations",
                """{"success":true,"data":[{"id":9,"projectId":1,"name":"Ashen Hollow","description":null,"imageUrl":null,"x":42.5,"y":17.25,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Karte").Click();

        Assert.Contains("Ashen Hollow", cut.Markup);
        Assert.Single(cut.FindAll("a.project-card"));
    }

    [Fact]
    public void ProjectDetail_CreateLocationForm_SubmitsNameAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

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
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith(
                "/locations",
                """{"success":true,"data":[{"id":9,"projectId":1,"name":"Ashen Hollow","description":null,"imageUrl":null,"x":42.5,"y":17.25,"createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/map", "fake map bytes", "image/jpeg")
            .WhenPathEndsWith("/projects/1", projectWithMap);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();
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
    public void ProjectDetail_TimelineTab_RendersEventsInOrder()
    {
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();

        var titles = cut.FindAll(".timeline-event-title").Select(e => e.TextContent).ToList();
        Assert.Equal(["The Sundering", "The Reckoning"], titles);
        Assert.Contains("Jahr 1247", cut.Markup);

        var moveButtons = cut.FindAll(".timeline-move-buttons button");
        Assert.True(moveButtons[0].HasAttribute("disabled")); // first event can't move up
        Assert.False(moveButtons[1].HasAttribute("disabled")); // first event can move down
    }

    [Fact]
    public void ProjectDetail_CreateEventForm_SubmitsTitleAndReloadsTimeline()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ereignis hinzufügen").Click();
        cut.Find("#event-title").Change("The Sundering");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/projects/1/timeline", createRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ProjectDetail_TimelineEvent_MoveUpButton_CallsMoveEndpoint()
    {
        HttpRequestMessage? moveRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Zeitleiste").Click();
        cut.FindAll(".timeline-move-buttons button")[2].Click(); // second event's "up" button

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
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith(
                "/lore",
                """{"success":true,"data":[{"id":3,"projectId":1,"title":"The Silver Vale","content":"Old magic.","createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/files", EmptyFilesJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lore").Click();

        Assert.Contains("The Silver Vale", cut.Markup);
        Assert.Single(cut.FindAll("a.project-card"));
    }

    [Fact]
    public void ProjectDetail_CreateLoreForm_SubmitsTitleAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

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
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith(
                "/files",
                """{"success":true,"data":[{"id":7,"projectId":1,"name":"concept-art.jpg","category":"IMAGE","size":204800,"url":"/api/projects/1/files/7/content","createdAt":"2026-01-01"}]}""")
            .WhenPathEndsWith("/files/7/content", "fake image bytes", "image/jpeg")
            .WhenPathEndsWith("/characters", EmptyCharactersJson)
            .WhenPathEndsWith("/locations", EmptyLocationsJson)
            .WhenPathEndsWith("/timeline", EmptyTimelineJson)
            .WhenPathEndsWith("/lore", EmptyLoreJson)
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();

        Assert.Contains("concept-art.jpg", cut.Markup);
        Assert.Contains("200 KB", cut.Markup);
    }

    [Fact]
    public void ProjectDetail_DeleteFileButton_CallsDeleteEndpoint()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
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
            .WhenPathEndsWith("/projects/1", ProjectJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ElementMetricsService>();

        var cut = Render<ProjectDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dateien").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Equal(HttpMethod.Delete, deleteRequest?.Method);
        Assert.Equal("/api/projects/1/files/7", deleteRequest?.RequestUri?.AbsolutePath);
    }
}
