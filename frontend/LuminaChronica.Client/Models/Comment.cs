using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/commentService.ts's Comment (v3.3 Phase 2,
// issue #325). Used for both books (canRead-based access) and projects
// (owner-or-PUBLIC access) -- the same shape either way.
public class Comment
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("userId")]
    public int UserId { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;

    // string, not DateTime -- D1's DATETIME columns serialize as
    // "yyyy-MM-dd HH:mm:ss", which System.Text.Json's default DateTime
    // converter rejects. Same reasoning as Book.CreatedAt/ProfileActivity.CreatedAt.
    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}
