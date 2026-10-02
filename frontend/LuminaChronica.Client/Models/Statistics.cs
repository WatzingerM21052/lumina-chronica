using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/statisticsService.ts's Statistics/GenreCount/RecentActivityItem.
public class GenreCount
{
    [JsonPropertyName("genre")]
    public string Genre { get; set; } = string.Empty;

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public class RecentActivityItem
{
    [JsonPropertyName("book")]
    public Book Book { get; set; } = null!;

    [JsonPropertyName("percentage")]
    public double Percentage { get; set; }

    [JsonPropertyName("lastOpened")]
    public string LastOpened { get; set; } = string.Empty;
}

// v1.5 (§101 "Erweiterte Statistik") additions.
public class YearlyOverviewItem
{
    [JsonPropertyName("year")]
    public string Year { get; set; } = string.Empty;

    [JsonPropertyName("booksFinished")]
    public int BooksFinished { get; set; }

    [JsonPropertyName("activeDays")]
    public int ActiveDays { get; set; }

    [JsonPropertyName("pagesRead")]
    public int PagesRead { get; set; }
}

public class CalendarDay
{
    [JsonPropertyName("date")]
    public string Date { get; set; } = string.Empty;

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public class Streaks
{
    [JsonPropertyName("currentStreak")]
    public int CurrentStreak { get; set; }

    [JsonPropertyName("longestStreak")]
    public int LongestStreak { get; set; }
}

public class ReadingGoal
{
    [JsonPropertyName("targetBooks")]
    public int? TargetBooks { get; set; }

    [JsonPropertyName("booksFinishedThisYear")]
    public int BooksFinishedThisYear { get; set; }
}

// Plan C3 (#531): last 12 months, zero-filled; "finished" counts are dated
// by last_opened, active days come from the reading activity log.
public class MonthlyOverviewItem
{
    [JsonPropertyName("month")]
    public string Month { get; set; } = string.Empty; // YYYY-MM

    [JsonPropertyName("booksFinished")]
    public int BooksFinished { get; set; }

    [JsonPropertyName("pagesFinished")]
    public int PagesFinished { get; set; }

    [JsonPropertyName("activeDays")]
    public int ActiveDays { get; set; }
}

// Estimates from the activity log (no real reading time is tracked), so
// the UI prefixes them with "≈"; null when there isn't enough data.
public class ReadingPace
{
    [JsonPropertyName("pagesPerActiveDay")]
    public int? PagesPerActiveDay { get; set; }

    [JsonPropertyName("activeDaysPerBook")]
    public double? ActiveDaysPerBook { get; set; }
}

public class SetReadingGoalRequest
{
    [JsonPropertyName("targetBooks")]
    public int? TargetBooks { get; set; }
}

public class StatisticsResponse
{
    [JsonPropertyName("booksRead")]
    public int BooksRead { get; set; }

    [JsonPropertyName("booksInProgress")]
    public int BooksInProgress { get; set; }

    [JsonPropertyName("pagesRead")]
    public int PagesRead { get; set; }

    [JsonPropertyName("genreBreakdown")]
    public List<GenreCount> GenreBreakdown { get; set; } = [];

    [JsonPropertyName("recentActivity")]
    public List<RecentActivityItem> RecentActivity { get; set; } = [];

    [JsonPropertyName("yearlyOverview")]
    public List<YearlyOverviewItem> YearlyOverview { get; set; } = [];

    [JsonPropertyName("readingCalendar")]
    public List<CalendarDay> ReadingCalendar { get; set; } = [];

    [JsonPropertyName("streaks")]
    public Streaks Streaks { get; set; } = new();

    [JsonPropertyName("goal")]
    public ReadingGoal Goal { get; set; } = new();

    [JsonPropertyName("monthlyOverview")]
    public List<MonthlyOverviewItem> MonthlyOverview { get; set; } = [];

    [JsonPropertyName("readingPace")]
    public ReadingPace ReadingPace { get; set; } = new();

    // Years with reading activity, newest first. Only sent by backends that
    // support GET /api/statistics/calendar?year=; the year picker stays
    // hidden until it lists more than one year.
    [JsonPropertyName("calendarYears")]
    public List<int> CalendarYears { get; set; } = [];
}
