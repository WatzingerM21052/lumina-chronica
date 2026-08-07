using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/publicProfileService.ts's PublicProfile --
// deliberately a narrower projection than Book/Project (Community Phase 1,
// issue #300): no owner-only fields, since GET /api/users/{username}/public
// is reachable while fully logged out.

public class PublicBook
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("coverUrl")]
    public string? CoverUrl { get; set; }

    [JsonPropertyName("genre")]
    public string? Genre { get; set; }

    [JsonPropertyName("language")]
    public string? Language { get; set; }

    [JsonPropertyName("averageRating")]
    public double? AverageRating { get; set; }

    [JsonPropertyName("ratingCount")]
    public int RatingCount { get; set; }

    [JsonPropertyName("myRating")]
    public int? MyRating { get; set; }
}

public class PublicProject
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = "WORLD";

    [JsonPropertyName("coverUrl")]
    public string? CoverUrl { get; set; }
}

public class PublicProfileResponse
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; set; }

    [JsonPropertyName("followerCount")]
    public int FollowerCount { get; set; }

    [JsonPropertyName("followingCount")]
    public int FollowingCount { get; set; }

    [JsonPropertyName("isFollowing")]
    public bool IsFollowing { get; set; }

    [JsonPropertyName("isOwnProfile")]
    public bool IsOwnProfile { get; set; }

    [JsonPropertyName("books")]
    public List<PublicBook> Books { get; set; } = [];

    [JsonPropertyName("projects")]
    public List<PublicProject> Projects { get; set; } = [];
}
