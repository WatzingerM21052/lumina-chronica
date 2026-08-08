using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/notificationService.ts's Notification (v3.3
// Phase 3, issue #326). Named NotificationItem, not Notification -- avoids
// colliding with System's own notification-shaped types some Blazor/JS
// interop namespaces bring in.
public class NotificationItem
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("actorUserId")]
    public int ActorUserId { get; set; }

    [JsonPropertyName("actorUsername")]
    public string ActorUsername { get; set; } = string.Empty;

    [JsonPropertyName("targetType")]
    public string? TargetType { get; set; }

    [JsonPropertyName("targetId")]
    public int? TargetId { get; set; }

    // string, not DateTime -- same D1 DATETIME reasoning as
    // Comment.CreatedAt/ProfileActivity.CreatedAt: D1's "yyyy-MM-dd
    // HH:mm:ss" format crashes System.Text.Json's default DateTime converter.
    [JsonPropertyName("readAt")]
    public string? ReadAt { get; set; }

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

public class NotificationListResponse
{
    [JsonPropertyName("notifications")]
    public List<NotificationItem> Notifications { get; set; } = [];

    [JsonPropertyName("unreadCount")]
    public int UnreadCount { get; set; }
}
