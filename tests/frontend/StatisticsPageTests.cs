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

    [Fact]
    public void Statistics_ShowsStreaks_FromStatisticsEndpoint()
    {
        const string json = """
            {"success":true,"data":{"booksRead":3,"booksInProgress":1,"pagesRead":500,"genreBreakdown":[],
             "recentActivity":[],"streaks":{"currentStreak":4,"longestStreak":9},
             "goal":{"targetBooks":null,"booksFinishedThisYear":3}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("🔥 4", cut.Markup);
        Assert.Contains("🏆 9", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsGoalPrompt_WhenNoTargetSet()
    {
        const string json = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],
             "recentActivity":[],"goal":{"targetBooks":null,"booksFinishedThisYear":1}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("Setz dir ein Leseziel", cut.Markup);
        Assert.DoesNotContain("goal-ring", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsGoalRing_WhenTargetSet()
    {
        const string json = """
            {"success":true,"data":{"booksRead":4,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],
             "recentActivity":[],"goal":{"targetBooks":10,"booksFinishedThisYear":4}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("goal-ring", cut.Markup);
        Assert.Contains("--goal-pct: 40", cut.Markup);
        Assert.Contains("von 10", cut.Markup);
        Assert.Contains("Noch 6 Bücher bis zum Ziel.", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsGoalReachedMessage_WhenTargetMet()
    {
        const string json = """
            {"success":true,"data":{"booksRead":10,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],
             "recentActivity":[],"goal":{"targetBooks":10,"booksFinishedThisYear":10}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("Ziel erreicht", cut.Markup);
    }

    [Fact]
    public void Statistics_ShowsYearlyOverview_WhenPresent()
    {
        const string json = """
            {"success":true,"data":{"booksRead":2,"booksInProgress":0,"pagesRead":300,"genreBreakdown":[],
             "recentActivity":[],
             "yearlyOverview":[{"year":"2026","booksFinished":2,"activeDays":15,"pagesRead":300}]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("Jahresübersicht", cut.Markup);
        Assert.Contains("2026", cut.Markup);
        Assert.Contains("2 Bücher · 300 Seiten · 15 aktive Tage", cut.Markup);
    }

    [Fact]
    public void Statistics_RendersCalendarHeatmap_WithTodayAsAFullIntensityCell()
    {
        const string template = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":10,"genreBreakdown":[],
             "recentActivity":[],"readingCalendar":[{"date":"__DATE__","count":3}]}}
            """;
        var json = template.Replace("__DATE__", DateTime.UtcNow.ToString("yyyy-MM-dd"));
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("calendar-heatmap", cut.Markup);
        Assert.Contains("calendar-cell--level-4", cut.Markup);
    }

    [Fact]
    public void Statistics_SavingGoal_PutsToGoalEndpoint_AndShowsUpdatedRing()
    {
        const string initialJson = """
            {"success":true,"data":{"booksRead":2,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],
             "recentActivity":[],"goal":{"targetBooks":null,"booksFinishedThisYear":2}}}
            """;
        const string savedGoalJson = """{"success":true,"data":{"targetBooks":5,"booksFinishedThisYear":2}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/statistics/goal", savedGoalJson)
            .WhenPathEndsWith("/api/statistics", initialJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Statistics>();
        Assert.Contains("Setz dir ein Leseziel", cut.Markup);

        cut.Find("input[type=number]").Input("5");
        cut.Find("form.goal-form").Submit();

        Assert.Contains("goal-ring", cut.Markup);
        Assert.Contains("von 5", cut.Markup);
    }
}
