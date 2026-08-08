using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/notificationService.ts's listPreferences
// response shape (v3.3 Phase 3, issue #326) -- one flat object with all 5
// preference types always present (missing rows default to enabled).
public class NotificationPreferences
{
    [JsonPropertyName("FOLLOW")]
    public bool Follow { get; set; } = true;

    [JsonPropertyName("COMMENT")]
    public bool Comment { get; set; } = true;

    [JsonPropertyName("RATING")]
    public bool Rating { get; set; } = true;

    [JsonPropertyName("SHARE")]
    public bool Share { get; set; } = true;

    // Gates profile_activities' RATING_GIVEN entries, not a notification --
    // added to this same per-type mechanism via AskUserQuestion (2026-08-08)
    // rather than a second parallel preferences table.
    [JsonPropertyName("ACTIVITY_RATING")]
    public bool ActivityRating { get; set; } = true;
}
