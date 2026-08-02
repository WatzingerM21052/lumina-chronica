using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors wwwroot/js/offlineStorage.js's getStatus() return shape.
public class OfflineStatus
{
    [JsonPropertyName("saved")]
    public bool Saved { get; set; }

    [JsonPropertyName("sizeBytes")]
    public long SizeBytes { get; set; }
}

// Mirrors wwwroot/js/offlineStorage.js's getBookFile() return shape -- the
// minimal fields Reader.razor needs to render a book it can no longer reach
// via the API.
public class OfflineBookFile
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("format")]
    public string Format { get; set; } = string.Empty;

    [JsonPropertyName("fileBytes")]
    public byte[] FileBytes { get; set; } = [];

    [JsonPropertyName("fileContentType")]
    public string FileContentType { get; set; } = string.Empty;
}

// Mirrors wwwroot/js/offlineStorage.js's listBooks() item shape.
public class OfflineBookSummary
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("format")]
    public string Format { get; set; } = string.Empty;

    [JsonPropertyName("sizeBytes")]
    public long SizeBytes { get; set; }

    [JsonPropertyName("savedAt")]
    public string SavedAt { get; set; } = string.Empty;
}
