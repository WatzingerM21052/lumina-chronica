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

    // Only meaningful when Visibility is SHARED -- whether someone NOT on
    // this book's share list still sees the cover+description teaser.
    [JsonPropertyName("sharedTeaserVisible")]
    public bool SharedTeaserVisible { get; set; } = true;

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;

    [JsonPropertyName("isFavorite")]
    public bool IsFavorite { get; set; }

    // Edit/delete/favorite are all owner-only server-side -- defaults to
    // false (deny by default) if a response somehow omits it, so a missing
    // field never accidentally exposes owner-only UI to a borrower.
    [JsonPropertyName("isOwner")]
    public bool IsOwner { get; set; }

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

// Books alone offer SHARED ("borrowed reading" -- see
// backend/src/services/bookService.ts's findAccessibleBookRow). v3.2
// (issue #321) swapped the PUBLIC/SHARED meanings after user feedback on
// v3.1: PUBLIC now grants full read access to any logged-in user; SHARED
// grants it only to people the owner explicitly picked (book_shares).
// Projects and Shelves still use the plain PRIVATE/PUBLIC VisibilityOption
// in Project.cs since SHARED has no meaning for them.
public static class BookVisibilityOption
{
    public static readonly IReadOnlyList<string> Options = ["PRIVATE", "SHARED", "PUBLIC"];

    public static string For(string visibility) => visibility switch
    {
        "PRIVATE" => "Privat",
        "SHARED" => "Geteilt (nur ausgewählte Personen)",
        "PUBLIC" => "Öffentlich (jeder angemeldete Nutzer)",
        _ => visibility,
    };
}

// Mirrors backend/src/services/bookService.ts's BookFacets -- powers the
// Library page's multi-select tag/genre filter dropdowns.
public class BookFacets
{
    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    [JsonPropertyName("genres")]
    public List<string> Genres { get; set; } = [];
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

    [JsonPropertyName("visibility")]
    public string? Visibility { get; set; }

    [JsonPropertyName("sharedTeaserVisible")]
    public bool? SharedTeaserVisible { get; set; }
}
