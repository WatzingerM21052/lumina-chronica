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

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
    }
}
