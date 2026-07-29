using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/readingService.ts's ReadingProgress. `Position`
// is format-specific: EPUB CFI string, PDF page number, TXT/MD scroll
// fraction -- see documentation/Architecture.md.
public class ReadingProgress
{
    [JsonPropertyName("chapter")]
    public int? Chapter { get; set; }

    [JsonPropertyName("position")]
    public string? Position { get; set; }

    [JsonPropertyName("percentage")]
    public double Percentage { get; set; }

    [JsonPropertyName("lastOpened")]
    public string? LastOpened { get; set; }
}

public class SaveProgressRequest
{
    [JsonPropertyName("bookId")]
    public int BookId { get; set; }

    [JsonPropertyName("chapter")]
    public int? Chapter { get; set; }

    [JsonPropertyName("position")]
    public string? Position { get; set; }

    [JsonPropertyName("percentage")]
    public double Percentage { get; set; }
}
