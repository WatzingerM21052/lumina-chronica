using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class StatisticsPageTests : BunitContext
{
    private const string EmptyStatisticsJson =
        """{"success":true,"data":{"booksRead":0,"booksInProgress":0,"pagesRead":0,"genreBreakdown":[],"recentActivity":[]}}""";

    private void UseApiResponse(string responseJson)
    {
        var handler = new FakeHttpMessageHandler(responseJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    [Fact]
    public void Statistics_ShowsEmptyState_WhenNoReadingHistoryExists()
    {
        UseApiResponse(EmptyStatisticsJson);

        var cut = Render<Statistics>();

        Assert.Contains("Sobald du anfängst zu lesen, erscheinen hier deine Statistiken.", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsOverviewCounts_FromStatisticsEndpoint()
    {
        const string json =
            """{"success":true,"data":{"booksRead":3,"booksInProgress":2,"pagesRead":845,"genreBreakdown":[],"recentActivity":[]}}""";
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("dashboard-stat-value\">3<", cut.Markup);
        Assert.Contains("dashboard-stat-value\">2<", cut.Markup);
        Assert.Contains("dashboard-stat-value\">845<", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsGenreBreakdown_WhenGenresExist()
    {
        const string json = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":1,"pagesRead":100,
             "genreBreakdown":[{"genre":"Fantasy","count":2},{"genre":"Unbekannt","count":1}],
             "recentActivity":[]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("Fantasy", cut.Markup);
        Assert.Contains("Unbekannt", cut.Markup);
    }

    [Fact]
    public void Statistics_HidesGenreSection_WhenNoGenresExist()
    {
        const string json =
            """{"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],"recentActivity":[]}}""";
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.DoesNotContain("statistics-genre-list", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsRecentActivity_WhenActivityExists()
    {
        const string json = """
            {"success":true,"data":{"booksRead":0,"booksInProgress":1,"pagesRead":42,"genreBreakdown":[],
             "recentActivity":[
                {"book":{"id":7,"title":"Der Herr der Ringe","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":42.5,"lastOpened":"2026-08-01T10:00:00Z"}
             ]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("Zuletzt gelesen", cut.Markup);
        Assert.Contains("Der Herr der Ringe", cut.Markup);
        Assert.Contains("href=\"library/books/7/read\"", cut.Markup);
    }
}
