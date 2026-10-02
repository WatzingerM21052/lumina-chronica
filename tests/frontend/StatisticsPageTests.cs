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
        Services.AddSingleton<II18nService, FakeI18nService>();
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
    public void Statistics_Hero_RendersAllThreeParallaxLayers()
    {
        UseApiResponse(EmptyStatisticsJson);

        var cut = Render<Statistics>();

        var layers = cut.FindAll("img.stats-hero-layer");
        Assert.Equal(3, layers.Count);
        Assert.Contains("statistics-hero-layer1-background.webp", layers[0].GetAttribute("src"));
        Assert.Contains("statistics-hero-layer2-moonlight.webp", layers[1].GetAttribute("src"));
        Assert.Contains("statistics-hero-layer3-armillary.webp", layers[2].GetAttribute("src"));
    }

    [Fact]
    public void Statistics_Hero_IsAFlatBannerWithoutScrollCompaction()
    {
        UseApiResponse(EmptyStatisticsJson);

        var cut = Render<Statistics>();

        // Plan C3: the ~100px hero no longer shrinks on scroll, so the
        // motion.js sentinel it needed is gone.
        Assert.Empty(cut.FindAll(".stats-hero-sentinel"));
        Assert.Single(cut.FindAll(".stats-hero"));
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
             "genreBreakdown":[{"genre":"Krimi","count":1},{"genre":"Fantasy","count":6},{"genre":"Sachbuch","count":3},
                {"genre":"Romance","count":2},{"genre":"Lyrik","count":1},{"genre":"Unbekannt","count":2}],
             "recentActivity":[]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        // Four biggest genres get their own slice (largest first); the two
        // smallest fold into one muted "Andere" slice -- 5 slices for 6 genres.
        var names = cut.FindAll(".genre-donut-name").Select(n => n.TextContent).ToList();
        Assert.Equal(["Fantasy", "Sachbuch", "Romance", "Unbekannt", "Andere"], names);
        Assert.Equal(5, cut.FindAll("circle.genre-donut-slice").Count);
        Assert.Single(cut.FindAll("circle.genre-donut-slice--0"));
        Assert.Equal("2", cut.FindAll(".genre-donut-count")[4].TextContent);
        Assert.Equal("15", cut.Find(".genre-donut-total").TextContent);
        // Ring coordinates are culture-invariant (no "33,3" in an SVG attribute).
        Assert.All(cut.FindAll("circle.genre-donut-slice"), c => Assert.DoesNotContain(",", c.GetAttribute("stroke-dasharray")));
    }

    [Fact]
    public void Statistics_GenreDonut_SingleGenre_FillsTheRingWithoutGap()
    {
        const string json = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":100,
             "genreBreakdown":[{"genre":"Fantasy","count":3}],"recentActivity":[]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Equal("100 0", cut.Find("circle.genre-donut-slice").GetAttribute("stroke-dasharray"));
        Assert.Empty(cut.FindAll("circle.genre-donut-slice--0"));
    }

    [Fact]
    public void Statistics_HidesGenreSection_WhenNoGenresExist()
    {
        const string json =
            """{"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],"recentActivity":[]}}""";
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.DoesNotContain("genre-donut", cut.Markup);
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

        var statValues = cut.FindAll(".dashboard-stat-value");
        Assert.Contains(statValues, v => v.TextContent.Trim() == "4" && v.QuerySelector("svg.icon") is not null);
        Assert.Contains(statValues, v => v.TextContent.Trim() == "9" && v.QuerySelector("svg.icon") is not null);
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
    public void Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel()
    {
        const string template = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":10,"genreBreakdown":[],
             "recentActivity":[],"readingCalendar":[{"date":"__DATE__","count":3}]}}
            """;
        var today = DateTime.UtcNow;
        var json = template.Replace("__DATE__", today.ToString("yyyy-MM-dd"));
        UseApiResponse(json);

        var cut = Render<Statistics>();

        var expectedLabel = $"{today:dd.MM.yyyy}: 3 Aktivität(en)";
        Assert.Contains($"role=\"img\" aria-label=\"{expectedLabel}\"", cut.Markup);
    }

    [Fact]
    public void Statistics_CalendarCell_ZeroActivityDay_HasNoRoleOrAriaLabel()
    {
        const string json = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":10,"genreBreakdown":[],
             "recentActivity":[],"readingCalendar":[]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Contains("calendar-heatmap", cut.Markup);
        Assert.Contains("calendar-cell--level-0", cut.Markup);
        Assert.DoesNotContain("role=\"img\"", cut.Markup);
    }

    [Fact]
    public void Statistics_SavingGoal_StepperStartsAtTwelve_PutsDraft_AndShowsUpdatedRing()
    {
        const string initialJson = """
            {"success":true,"data":{"booksRead":2,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],
             "recentActivity":[],"goal":{"targetBooks":null,"booksFinishedThisYear":2}}}
            """;
        const string savedGoalJson = """{"success":true,"data":{"targetBooks":5,"booksFinishedThisYear":2}}""";
        string? sentBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/api/statistics/goal"), r =>
            {
                sentBody = r.Content!.ReadAsStringAsync().Result;
                return RoutedFakeHttpMessageHandler.JsonResponse(savedGoalJson);
            })
            .WhenPathEndsWith("/api/statistics", initialJson);
        UseHandler(handler);

        var cut = Render<Statistics>();
        Assert.Contains("Setz dir ein Leseziel", cut.Markup);
        Assert.Empty(cut.FindAll("form.goal-form"));

        cut.Find("button.goal-set").Click();
        cut.Find("button.goal-stepper-minus").Click();
        cut.Find("form.goal-form").Submit();

        Assert.Equal("""{"targetBooks":11}""", sentBody);
        Assert.Contains("goal-ring", cut.Markup);
        Assert.Contains("von 5", cut.Markup);
        Assert.Empty(cut.FindAll("form.goal-form"));
    }

    [Fact]
    public void Statistics_GoalStepper_StartsAtCurrentTarget_StopsAtOne_AndCancels()
    {
        const string json = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":50,"genreBreakdown":[],
             "recentActivity":[],"goal":{"targetBooks":2,"booksFinishedThisYear":1}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();
        cut.Find("button.goal-edit").Click();

        Assert.StartsWith("2", cut.Find(".goal-stepper-value").TextContent.Trim());
        cut.Find("button.goal-stepper-minus").Click();
        Assert.StartsWith("1", cut.Find(".goal-stepper-value").TextContent.Trim());
        Assert.True(cut.Find("button.goal-stepper-minus").HasAttribute("disabled"));
        Assert.Single(cut.FindAll("button.goal-remove"));

        cut.Find("button.goal-cancel").Click();
        Assert.Empty(cut.FindAll("form.goal-form"));
        Assert.Contains("von 2", cut.Markup);
    }

    [Fact]
    public void Statistics_TrendChart_PlotsTwelveMonths_AndAllZeroYearHasNoNaN()
    {
        UseApiResponse(MonthlyJson(activeDaysInLastMonth: 0));

        var cut = Render<Statistics>();

        Assert.Equal(12, cut.FindAll(".line-chart-point").Count);
        Assert.Equal(12, cut.FindAll(".line-chart-xlabels span").Count);
        var path = cut.Find("path.line-chart-line").GetAttribute("d")!;
        Assert.DoesNotContain("NaN", path);
        Assert.Equal(12, path.Split('L').Length);
    }

    [Fact]
    public void Statistics_TrendChart_TogglesBetweenReadingDaysAndFinishedBooks()
    {
        UseApiResponse(MonthlyJson(activeDaysInLastMonth: 9));

        var cut = Render<Statistics>();

        Assert.Contains("9 Tage", cut.Find(".line-chart-point.is-last .line-chart-tip").TextContent);
        cut.FindAll(".trend-toggle-option")[1].Click();
        Assert.Contains("2 Bücher", cut.Find(".line-chart-point.is-last .line-chart-tip").TextContent);
        Assert.Equal("true", cut.FindAll(".trend-toggle-option")[1].GetAttribute("aria-pressed"));
    }

    private static string MonthlyJson(int activeDaysInLastMonth)
    {
        var months = Enumerable.Range(0, 12)
            .Select(i => new DateTime(2026, 1, 1).AddMonths(i - 2).ToString("yyyy-MM"))
            .Select((m, i) => i == 11
                ? $$"""{"month":"{{m}}","booksFinished":2,"pagesFinished":500,"activeDays":{{activeDaysInLastMonth}}}"""
                : $$"""{"month":"{{m}}","booksFinished":0,"pagesFinished":0,"activeDays":0}""");
        return $$$"""
            {"success":true,"data":{"booksRead":2,"booksInProgress":0,"pagesRead":500,"genreBreakdown":[],
             "recentActivity":[],"monthlyOverview":[{{{string.Join(",", months)}}}]}}
            """;
    }

    [Fact]
    public void Statistics_ReadingPace_ShowsApproximateValues()
    {
        const string json = """
            {"success":true,"data":{"booksRead":2,"booksInProgress":0,"pagesRead":500,"genreBreakdown":[],
             "recentActivity":[],"readingPace":{"pagesPerActiveDay":42,"activeDaysPerBook":6.5}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        var figures = cut.FindAll(".pace-figures dd").Select(d => d.TextContent).ToList();
        Assert.Equal(["≈ 42", "≈ 6,5"], figures);
    }

    [Fact]
    public void Statistics_ReadingPace_NullValues_ShowDash()
    {
        const string json = """
            {"success":true,"data":{"booksRead":0,"booksInProgress":1,"pagesRead":0,"genreBreakdown":[],
             "recentActivity":[],"readingPace":{"pagesPerActiveDay":null,"activeDaysPerBook":null}}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.All(cut.FindAll(".pace-figures dd"), d => Assert.Equal("–", d.TextContent));
    }

    [Fact]
    public void Statistics_CalendarYearPicker_HiddenUntilBackendListsSeveralYears()
    {
        const string json = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":10,"genreBreakdown":[],
             "recentActivity":[],"calendarYears":[2026]}}
            """;
        UseApiResponse(json);

        var cut = Render<Statistics>();

        Assert.Empty(cut.FindAll("select.calendar-year-select"));
    }

    [Fact]
    public void Statistics_CalendarYearPicker_LoadsThatYear_WithAllTwelveMonthLabels()
    {
        const string initialJson = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":10,"genreBreakdown":[],
             "recentActivity":[],"calendarYears":[2026,2025]}}
            """;
        const string yearJson = """{"success":true,"data":[{"date":"2025-03-01","count":2}]}""";
        string? requestedQuery = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/api/statistics/calendar"), r =>
            {
                requestedQuery = r.RequestUri!.Query;
                return RoutedFakeHttpMessageHandler.JsonResponse(yearJson);
            })
            .WhenPathEndsWith("/api/statistics", initialJson);
        UseHandler(handler);

        var cut = Render<Statistics>();
        cut.Find("select.calendar-year-select").Change("2025");

        Assert.Equal("?year=2025", requestedQuery);
        var months = cut.FindAll(".calendar-months span").Select(m => m.TextContent).ToList();
        Assert.Equal(["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"], months);
        Assert.Contains("aria-label=\"01.03.2025: 2 Aktivität(en)\"", cut.Markup);
    }

    private void UseHandler(HttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
    }
}
