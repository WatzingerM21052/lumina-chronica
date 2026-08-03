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
}
