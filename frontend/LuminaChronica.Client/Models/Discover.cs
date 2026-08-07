using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/discoverService.ts's DiscoverBookSummary --
// Discovery Phase 4 (issue #310).
public class DiscoverBook
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

    [JsonPropertyName("averageRating")]
    public double? AverageRating { get; set; }

    [JsonPropertyName("ratingCount")]
    public int RatingCount { get; set; }

    [JsonPropertyName("myRating")]
    public int? MyRating { get; set; }

    [JsonPropertyName("ownerUsername")]
    public string OwnerUsername { get; set; } = string.Empty;
}

public class DiscoverBookListResponse
{
    [JsonPropertyName("items")]
    public List<DiscoverBook> Items { get; set; } = [];

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("pageSize")]
    public int PageSize { get; set; }
}

public class DiscoverUser
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; set; }
}

public class DiscoverUserListResponse
{
    [JsonPropertyName("items")]
    public List<DiscoverUser> Items { get; set; } = [];

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("page")]
    public int Page { get; set; }

    [JsonPropertyName("pageSize")]
    public int PageSize { get; set; }
}
