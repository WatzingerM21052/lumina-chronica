using Bunit;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class HomePageTests : BunitContext
{
    private const string EmptyDashboardJson =
        """{"success":true,"data":{"continueReading":[],"recommendations":[],"overview":{"totalBooks":0,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}""";

    private const string EmptyProjectsJson = """{"success":true,"data":[]}""";

    [Fact]
    public void Home_RendersWithoutThrowing_AndShowsWelcomeHeading()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Willkommen zurück", cut.Markup);
    }

    [Fact]
    public void Home_Hero_RendersAllThreeParallaxLayers()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        var layers = cut.FindAll("img.home-hero-layer");
        Assert.Equal(3, layers.Count);
        Assert.Contains("dashboard-hero-layer1-background.webp", layers[0].GetAttribute("src"));
        Assert.Contains("dashboard-hero-layer2-lights.webp", layers[1].GetAttribute("src"));
        Assert.Contains("dashboard-hero-layer3-foreground.webp", layers[2].GetAttribute("src"));
    }

    [Fact]
    public void Home_Hero_SentinelRendersBeforeHero()
    {
        // The compaction sentinel must precede .home-hero in document order —
        // it needs to leave the viewport while the (non-sticky) hero is
        // still on screen, or motion.js's initHeaderCompact toggles a class
        // on an element the user can no longer see. See Home.razor.css's
        // .home-hero-sentinel comment for why this differs from
        // MainLayout's header sentinel, which goes after its (sticky) header.
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        var sentinelIndex = cut.Markup.IndexOf("home-hero-sentinel", StringComparison.Ordinal);
        var heroIndex = cut.Markup.IndexOf("\"home-hero\"", StringComparison.Ordinal);
        Assert.True(sentinelIndex >= 0, "Sentinel element not found in markup.");
        Assert.True(heroIndex >= 0, "Hero element not found in markup.");
        Assert.True(sentinelIndex < heroIndex, "Sentinel must render before .home-hero in document order.");
    }

    [Fact]
    public void Home_ShowsEmptyStateForLibrary_WhenLibraryIsEmpty()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Deine Bibliothek ist noch leer", cut.Markup);
    }

    // Same direct link as Library's "Buch hinzufügen" (no chooser dialog).
    [Fact]
    public void Home_EmptyStateAddBookAction_LinksStraightToTheUploadPage()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Home>();
        Assert.Equal("library/upload", cut.Find(".empty-state a.btn-primary").GetAttribute("href"));
    }

    [Fact]
    public void Home_ShowsRecentBooks_WhenLibraryHasBooks()
    {
        // Regression coverage for the bug where Home always showed the
        // "library is empty" placeholder regardless of real data.
        const string booksJson = """
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null}
            ],"total":1,"page":1,"pageSize":6}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", booksJson)
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Dune", cut.Markup);
        Assert.DoesNotContain("Deine Bibliothek ist noch leer", cut.Markup);
    }

    [Fact]
    public void Home_ShowsOverviewCounts_FromDashboardEndpoint()
    {
        const string dashboardJson =
            """{"success":true,"data":{"continueReading":[],"overview":{"totalBooks":4,"totalShelves":2,"totalFavorites":1,"finishedBooks":3}}}""";
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));

        var cut = Render<Home>();

        // Issue #180: this used to assert the raw substring
        // dashboard-stat-value">4< against cut.Markup -- which can never
        // match, since Home.razor.css gives Home a scoped-CSS id that
        // Blazor inserts as its own attribute between class="..." and the
        // element's closing >, e.g. class="dashboard-stat-value" b-xxxxxxx>4.
        // Querying the actual elements (like the rest of this suite does
        // elsewhere) isn't sensitive to that attribute's presence, order, or
        // exact scope hash.
        var values = cut.FindAll(".dashboard-stat-value").Select(e => e.TextContent).ToList();
        Assert.Equal(["4", "2", "1", "3"], values);
    }

    [Fact]
    public void Home_ShowsContinueReadingSection_WhenReadingHistoryExists()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[
                {"book":{"id":7,"title":"Der Herr der Ringe","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":42.5,"lastOpened":"2026-08-01T10:00:00Z"}
            ],"overview":{"totalBooks":1,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Weiterlesen", cut.Markup);
        Assert.Contains("Der Herr der Ringe", cut.Markup);
        Assert.Contains("href=\"library/books/7/read\"", cut.Markup);
    }

    [Fact]
    public void Home_ContinueReading_FirstBookIsFeaturedSize_RestAreNormal()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[
                {"book":{"id":7,"title":"Der Herr der Ringe","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":42.5,"lastOpened":"2026-08-01T10:00:00Z"},
                {"book":{"id":8,"title":"Der Hobbit","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":10,"lastOpened":"2026-08-01T09:00:00Z"}
            ],"overview":{"totalBooks":2,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        var cards = cut.FindAll("a.book-card");
        Assert.Equal(2, cards.Count);
        Assert.Contains("book-card-large", cards[0].ClassList);
        Assert.Contains("book-card-normal", cards[1].ClassList);
    }

    [Fact]
    public void Home_ShowsBorrowedBadge_WithOwnerUsername_NotAsLiteralText()
    {
        // Regression: OwnerUsername="item.OwnerUsername" (no leading @) once
        // bound the BookCard parameter to that literal string instead of
        // evaluating the property -- same bug class as the missing-@ Razor
        // parameter binding bug documented in CHANGELOG.md's v1.0 Fixed
        // section. Assert the real username renders and the raw C# text
        // never leaks into the markup.
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[
                {"book":{"id":7,"title":"Geliehenes Buch","author":null,"description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"SHARED","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":10,"lastOpened":"2026-08-01T10:00:00Z","ownerUsername":"bob"}
            ],"overview":{"totalBooks":0,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Geliehen von bob", cut.Markup);
        Assert.DoesNotContain("item.OwnerUsername", cut.Markup);
        Assert.Empty(cut.FindAll("button.book-card-favorite"));
    }

    [Fact]
    public void Home_HidesContinueReadingSection_WhenNoReadingHistoryExists()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.DoesNotContain("Weiterlesen", cut.Markup);
    }

    [Fact]
    public void Home_ShowsRecommendationsSection_WhenUnstartedBooksExist()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[],"overview":{"totalBooks":1,"totalShelves":0,"totalFavorites":0,"finishedBooks":0},
             "recommendations":[
                {"id":9,"title":"Struwwelpeter","author":"Heinrich Hoffmann","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null}
             ]}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Empfehlungen", cut.Markup);
        Assert.Contains("Struwwelpeter", cut.Markup);
    }

    [Fact]
    public void Home_HidesRecommendationsSection_WhenNoneAvailable()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.DoesNotContain("Empfehlungen", cut.Markup);
    }

    [Fact]
    public void Home_ShowsEmptyStateForProjects_WhenNoProjectsExist()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Du hast noch keine Projekte erstellt", cut.Markup);
    }

    [Fact]
    public void Home_ShowsRealProjects_WhenProjectsExist()
    {
        // Regression coverage for the bug where "Aktuelle Projekte" always
        // showed the empty state regardless of real data (never wired to the
        // Projects API that's existed since v2.0 -- see Roadmap.md).
        const string projectsJson = """
            {"success":true,"data":[
                {"id":3,"title":"Mittelerde","description":null,"type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}
            ]}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", projectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Mittelerde", cut.Markup);
        Assert.DoesNotContain("Du hast noch keine Projekte erstellt", cut.Markup);
    }

    private void UseHandler(RoutedFakeHttpMessageHandler handler, string theme = "classic-library")
    {
        Services.AddSingleton<IThemeService>(new FakeThemeService(theme));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    private const string TwoBooksJson = """
        {"success":true,"data":{"items":[
            {"id":1,"title":"Dune","author":"Frank Herbert","coverUrl":null,"genre":"Science Fiction","visibility":"PRIVATE","createdAt":"2026-01-01","tags":[]},
            {"id":2,"title":"Emma","author":"Jane Austen","coverUrl":null,"genre":"Klassiker","visibility":"PRIVATE","createdAt":"2026-01-01","tags":[]}
        ],"total":2,"page":1,"pageSize":6}}
        """;

    private static RoutedFakeHttpMessageHandler BooksHandler() => new RoutedFakeHttpMessageHandler()
        .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
        .WhenPathEndsWith("/api/books", TwoBooksJson)
        .WhenPathEndsWith("/api/books/facets", """{"success":true,"data":{"tags":[],"genres":["Klassiker","Science Fiction"]}}""")
        .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
        .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson)
        .WhenPathEndsWith("/api/statistics", EmptyStatisticsJson);

    private const string EmptyStatisticsJson = """{"success":true,"data":{"goal":{"targetBooks":null,"booksFinishedThisYear":0},"readingCalendar":[]}}""";

    // The card dashboard (WorldDashboard): "Immersives Theme" switched off.
    private void UseCardDashboard() =>
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(false);

    [Fact]
    public void Home_Alexandria_ShowsLibraryAsScrollShelf_WhenNeverChosen()
    {
        UseHandler(BooksHandler(), "alexandria");
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
        UseCardDashboard();
        JSInterop.SetupModule("./js/libraryPreferences.js")
            .Setup<bool?>("getHomeScrollShelf", _ => true)
            .SetResult(null);

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".scroll-wall .book-scroll").Count));
        Assert.Empty(cut.FindAll(".book-card"));
    }

    [Fact]
    public void Home_Alexandria_ShowsCoverStrip_WhenScrollShelfSwitchedOff()
    {
        UseHandler(BooksHandler(), "alexandria");
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
        UseCardDashboard();
        JSInterop.SetupModule("./js/libraryPreferences.js")
            .Setup<bool?>("getHomeScrollShelf", _ => true)
            .SetResult(false);

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".world-library .book-card").Count));
        Assert.Empty(cut.FindAll(".scroll-shelf"));
    }

    [Fact]
    public void Home_OtherThemes_NeverShowTheScrollShelf()
    {
        UseHandler(BooksHandler(), "babylon");
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
        UseCardDashboard();

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".world-library .book-card").Count));
        Assert.Empty(cut.FindAll(".scroll-shelf"));
    }

    // Theme studio dashboard: the themed worlds get a card grid with the
    // goal and the reading calendar; the classic themes keep their sections.
    [Fact]
    public void Home_ThemedWorld_UsesTheStudioDashboard_WithGoalAndCalendar()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", TwoBooksJson)
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson)
            .WhenPathEndsWith("/api/statistics", """{"success":true,"data":{"goal":{"targetBooks":12,"booksFinishedThisYear":5},"readingCalendar":[]}}""");
        UseHandler(handler, "babylon");
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
        UseCardDashboard();

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".world-dashboard .world-goal .goal-ring")));
        Assert.Contains("5 von 12", cut.Find(".world-goal").TextContent);
        Assert.Contains("Noch 7 Bücher bis Silvester", cut.Find(".world-goal").TextContent);
        Assert.NotEmpty(cut.FindAll(".world-calendar .reading-calendar .calendar-cell[data-date]"));
    }

    [Fact]
    public void Home_ClassicTheme_KeepsThePlainSections()
    {
        UseHandler(BooksHandler());
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".library-grid--strip .book-card").Count));
        Assert.Empty(cut.FindAll(".world-dashboard"));
        Assert.Empty(cut.FindAll(".home-hero-cta"));
    }

    [Fact]
    public void Home_ThemedWorld_HeroOffersToContinueTheLastBook_WithPageAndPagesLeft()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[{"book":{"id":7,"title":"Dune","author":"Frank Herbert","visibility":"PRIVATE","createdAt":"2026-01-01","tags":[]},"percentage":50,"lastOpened":"2020-01-01 10:00:00"}],
             "recommendations":[],"overview":{"totalBooks":2,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", TwoBooksJson)
            .WhenPathEndsWith("/api/books/7", """{"success":true,"data":{"id":7,"title":"Dune","pages":400,"visibility":"PRIVATE","createdAt":"2026-01-01","tags":[]}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson)
            .WhenPathEndsWith("/api/statistics", EmptyStatisticsJson), "babylon");
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
        UseCardDashboard();

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.Equal("library/books/7/read", cut.Find("a.home-hero-cta").GetAttribute("href")));
        Assert.Contains("S. 200", cut.Find("a.home-hero-cta").TextContent);
        Assert.Contains("„Dune“", cut.Find(".home-hero-lead").TextContent);
        Assert.Contains("Noch 200 Seiten bis zum Ende.", cut.Find(".home-hero-lead").TextContent);
        Assert.Contains("200 von 400 Seiten", cut.Find(".world-continue").TextContent);
    }

    // Babylon/Alexandria: the immersive journey unless "Immersives Theme" is off.
    [Fact]
    public void Home_ThemedWorld_ShowsTheJourneyByDefault()
    {
        UseHandler(BooksHandler(), "babylon");
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".journey[data-world=babylon]")));
        Assert.Empty(cut.FindAll(".world-dashboard"));
        Assert.Contains("home-hero--journey", cut.Find(".home-hero").ClassName);
        Assert.Equal(2, cut.FindAll(".journey-tome").Count);
    }

    // Every other theme: the plain Home unless "Immersives Theme" is on.
    [Fact]
    public void Home_ClassicTheme_ShowsNoJourneyWhenNeverChosen()
    {
        UseHandler(BooksHandler());
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll(".library-grid--strip .book-card").Count));
        Assert.Empty(cut.FindAll(".journey"));
    }

    [Fact]
    public void Home_ClassicTheme_WithImmersiveOn_ShowsTheEngravingJourney()
    {
        UseHandler(BooksHandler());
        Services.AddSingleton<BlobUrlService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(true);

        var cut = Render<Home>();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".journey[data-world=engraving]")));
        Assert.Contains("home-hero--engraving", cut.Find(".home-hero").ClassName);
        // No Babylon or Alexandria pictures: the theme's own engravings instead.
        Assert.Empty(cut.FindAll(".journey img[src*='themes/babylon'], .journey img[src*='themes/alexandria']"));
        Assert.NotEmpty(cut.FindAll(".journey-engraving--reading, .journey-engraving--library"));
    }
}
