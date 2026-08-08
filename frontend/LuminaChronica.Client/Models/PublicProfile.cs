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

    // "PUBLIC" (full read for any logged-in user) or "SHARED" (full read
    // only for people on the book's explicit share list, v3.2/issue #321).
    // PRIVATE books never appear here.
    [JsonPropertyName("visibility")]
    public string Visibility { get; set; } = "PUBLIC";

    // Computed server-side: can THIS viewer actually read the full book?
    // Share-list membership is invisible to the frontend, so the "Lesen"
    // button is keyed off this, not off Visibility directly.
    [JsonPropertyName("canRead")]
    public bool CanRead { get; set; }

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

// Mirrors backend/src/services/activityService.ts's ProfileActivity -- a log
// of the profile owner's own public actions (v3.3 Phase 1, issue #324). No
// aggregated home feed across followed users yet, own-profile log only.
public class ProfileActivity
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    // "BOOK_PUBLIC" | "PROJECT_PUBLIC" | "RATING_GIVEN"
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    // "BOOK" | "PROJECT"
    [JsonPropertyName("targetType")]
    public string TargetType { get; set; } = string.Empty;

    [JsonPropertyName("targetId")]
    public int TargetId { get; set; }

    [JsonPropertyName("targetTitle")]
    public string? TargetTitle { get; set; }

    // Snapshot at creation time, only set for RATING_GIVEN.
    [JsonPropertyName("rating")]
    public int? Rating { get; set; }

    // string, not DateTime -- D1's DATETIME columns serialize as
    // "yyyy-MM-dd HH:mm:ss" (SQLite's CURRENT_TIMESTAMP format, no 'T', no
    // offset), which System.Text.Json's default DateTime converter rejects
    // outright (strict ISO-8601 only). Same reason Book.CreatedAt/
    // Project.CreatedAt are string, not DateTime -- parse explicitly at the
    // point of use instead.
    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
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

    [JsonPropertyName("activities")]
    public List<ProfileActivity> Activities { get; set; } = [];
}
