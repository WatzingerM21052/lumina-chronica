using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/bookmarkService.ts's Bookmark. Reuses
// ReadingProgress's chapter/position/percentage shape -- see
// documentation/Database.md for why.
public class Bookmark
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("bookId")]
    public int BookId { get; set; }

    [JsonPropertyName("chapter")]
    public int? Chapter { get; set; }

    [JsonPropertyName("position")]
    public string? Position { get; set; }

    [JsonPropertyName("percentage")]
    public double Percentage { get; set; }

    [JsonPropertyName("note")]
    public string? Note { get; set; }

    [JsonPropertyName("createdAt")]
    public string? CreatedAt { get; set; }
}

public class CreateBookmarkRequest
{
    [JsonPropertyName("bookId")]
    public int BookId { get; set; }

    [JsonPropertyName("chapter")]
    public int? Chapter { get; set; }

    [JsonPropertyName("position")]
    public string? Position { get; set; }

    [JsonPropertyName("percentage")]
    public double Percentage { get; set; }

    [JsonPropertyName("note")]
    public string? Note { get; set; }
}

public class UpdateBookmarkNoteRequest
{
    [JsonPropertyName("note")]
    public string? Note { get; set; }
}
