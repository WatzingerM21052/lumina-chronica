using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class HomePageTests : BunitContext
{
    private const string EmptyDashboardJson =
        """{"success":true,"data":{"continueReading":[],"recommendations":[],"overview":{"totalBooks":0,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}""";

    [Fact]
    public void Home_RendersWithoutThrowing_AndShowsWelcomeHeading()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Willkommen zurück", cut.Markup);
    }

    [Fact]
    public void Home_ShowsEmptyStateForLibrary_WhenLibraryIsEmpty()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
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
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Weiterlesen", cut.Markup);
        Assert.Contains("Der Herr der Ringe", cut.Markup);
        Assert.Contains("href=\"library/books/7/read\"", cut.Markup);
    }

    [Fact]
    public void Home_HidesContinueReadingSection_WhenNoReadingHistoryExists()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
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
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.DoesNotContain("Empfehlungen", cut.Markup);
    }

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
    }
}
