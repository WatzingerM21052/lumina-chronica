using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors the object returned by wwwroot/js/metadataEnrichment.js's
// lookupByIsbn. Cover bytes are fetched separately via
// getCoverBytes()/getCoverContentType() -- same convention as ExtractedMetadata.
public class EnrichedMetadata
{
    [JsonPropertyName("found")]
    public bool Found { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("genre")]
    public string? Genre { get; set; }

    [JsonPropertyName("publisher")]
    public string? Publisher { get; set; }

    [JsonPropertyName("pages")]
    public int? Pages { get; set; }

    [JsonPropertyName("releaseDate")]
    public string? ReleaseDate { get; set; }

    [JsonPropertyName("hasCover")]
    public bool HasCover { get; set; }
}
