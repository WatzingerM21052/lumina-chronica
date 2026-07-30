using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors one entry of the array returned by
// wwwroot/js/metadataEnrichment.js's searchByQuery.
public class EnrichmentSearchResult
{
    [JsonPropertyName("key")]
    public string? Key { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("year")]
    public int? Year { get; set; }

    [JsonPropertyName("coverId")]
    public int? CoverId { get; set; }

    [JsonPropertyName("isbn")]
    public string? Isbn { get; set; }
}
