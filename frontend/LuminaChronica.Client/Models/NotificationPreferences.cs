using System.Text.Json.Serialization;

namespace LuminaChronica.Client.Models;

// Mirrors backend/src/services/notificationService.ts's listPreferences
// response shape (v3.3 Phase 3, issue #326; 6th type added in issue #315
// Phase 3) -- one flat object with every preference type always present.
// FOLLOW/COMMENT/RATING/SHARE default to enabled (opt-out); the two
// ACTIVITY_RATING* types default to disabled (opt-in) -- these defaults
// only matter here if a request for /api/notifications/preferences fails
// and Settings.razor falls back to `new NotificationPreferences()` instead
// of the server's own response (which is the actual source of truth, see
// notificationService.ts's PREFERENCE_DEFAULTS).
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
    // rather than a second parallel preferences table. Defaults to
    // disabled: this is the first activity type that reveals a specific
    // personal opinion rather than restating something already public.
    [JsonPropertyName("ACTIVITY_RATING")]
    public bool ActivityRating { get; set; } = false;

    // Whether a shown RATING_GIVEN entry includes the actual star count --
    // split out from ACTIVITY_RATING (issue #315 Phase 3, raised by the
    // user) because the specific value is the more sensitive part: it can
    // read as an opinion about someone else's work, not just "a rating
    // happened". Also defaults to disabled.
    [JsonPropertyName("ACTIVITY_RATING_STARS")]
    public bool ActivityRatingStars { get; set; } = false;
}
