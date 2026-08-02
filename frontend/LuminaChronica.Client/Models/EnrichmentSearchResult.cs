using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors one entry of the array returned by wwwroot/js/metadataEnrichment.js's
// searchByQuery -- a merged, deduped list from OpenLibrary and (if
// configured) Google Books. `Source` decides which lookup function
// SelectSearchResultAsync calls when this result is chosen.
public class EnrichmentSearchResult
{
    [JsonPropertyName("source")]
    public string Source { get; set; } = "openlibrary";

    [JsonPropertyName("key")]
    public string? Key { get; set; }

    [JsonPropertyName("googleBooksId")]
    public string? GoogleBooksId { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("year")]
    public int? Year { get; set; }

    [JsonPropertyName("coverId")]
    public int? CoverId { get; set; }

    // Always populated (for either source) so the search-result list can
    // render a thumbnail uniformly without knowing which source it came from.
    [JsonPropertyName("coverUrl")]
    public string? CoverUrl { get; set; }

    [JsonPropertyName("isbn")]
    public string? Isbn { get; set; }
}
