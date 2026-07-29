using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/bookService.ts's BookFile shape.
public class BookFile
{
    [JsonPropertyName("format")]
    public string Format { get; set; } = string.Empty;

    [JsonPropertyName("size")]
    public long Size { get; set; }
}

// Mirrors backend/src/services/bookService.ts's BookSummary + BookDetail (the
// detail fields are simply null/empty when the summary alone was requested).
public class Book
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("coverUrl")]
    public string? CoverUrl { get; set; }

    [JsonPropertyName("genre")]
    public string? Genre { get; set; }

    [JsonPropertyName("language")]
    public string? Language { get; set; }

    [JsonPropertyName("visibility")]
    public string Visibility { get; set; } = "PRIVATE";

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("isbn")]
    public string? Isbn { get; set; }

    [JsonPropertyName("publisher")]
    public string? Publisher { get; set; }

    [JsonPropertyName("releaseDate")]
    public string? ReleaseDate { get; set; }

    [JsonPropertyName("pages")]
    public int? Pages { get; set; }

    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    [JsonPropertyName("file")]
    public BookFile? File { get; set; }
}

public class BookListResponse
{
    [JsonPropertyName("items")]
    public List<Book> Items { get; set; } = [];

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("pageSize")]
    public int PageSize { get; set; }
}

// Mirrors backend/src/services/bookService.ts's UpdateBookInput -- all
// fields optional so a PUT only touches what the caller actually sent.
public class UpdateBookRequest
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("genre")]
    public string? Genre { get; set; }

    [JsonPropertyName("language")]
    public string? Language { get; set; }

    [JsonPropertyName("isbn")]
    public string? Isbn { get; set; }

    [JsonPropertyName("publisher")]
    public string? Publisher { get; set; }

    [JsonPropertyName("releaseDate")]
    public string? ReleaseDate { get; set; }

    [JsonPropertyName("pages")]
    public int? Pages { get; set; }

    [JsonPropertyName("tags")]
    public List<string>? Tags { get; set; }
}
