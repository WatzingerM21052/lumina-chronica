using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/dashboardService.ts's Dashboard/ContinueReadingItem/DashboardOverview.
public class ContinueReadingItem
{
    [JsonPropertyName("book")]
    public Book Book { get; set; } = null!;

    [JsonPropertyName("percentage")]
    public double Percentage { get; set; }

    [JsonPropertyName("lastOpened")]
    public string LastOpened { get; set; } = string.Empty;

    // null for the caller's own books; set to the owner's username for a
    // SHARED book being read via "borrowed reading".
    [JsonPropertyName("ownerUsername")]
    public string? OwnerUsername { get; set; }
}

public class DashboardOverview
{
    [JsonPropertyName("totalBooks")]
    public int TotalBooks { get; set; }

    [JsonPropertyName("totalShelves")]
    public int TotalShelves { get; set; }

    [JsonPropertyName("totalFavorites")]
    public int TotalFavorites { get; set; }

    [JsonPropertyName("finishedBooks")]
    public int FinishedBooks { get; set; }
}

public class DashboardResponse
{
    [JsonPropertyName("continueReading")]
    public List<ContinueReadingItem> ContinueReading { get; set; } = [];

    [JsonPropertyName("overview")]
    public DashboardOverview Overview { get; set; } = new();

    [JsonPropertyName("recommendations")]
    public List<Book> Recommendations { get; set; } = [];
}
