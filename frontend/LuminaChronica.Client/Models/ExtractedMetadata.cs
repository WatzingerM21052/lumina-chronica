using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors the object returned by wwwroot/js/metadataExtractor.js's
// extractEpub/extractPdf. Cover bytes are fetched separately via
// getCoverBytes()/getCoverContentType() -- see metadataExtractor.js for why.
public class ExtractedMetadata
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("language")]
    public string? Language { get; set; }

    [JsonPropertyName("publisher")]
    public string? Publisher { get; set; }

    [JsonPropertyName("isbn")]
    public string? Isbn { get; set; }

    [JsonPropertyName("hasCover")]
    public bool HasCover { get; set; }
}
