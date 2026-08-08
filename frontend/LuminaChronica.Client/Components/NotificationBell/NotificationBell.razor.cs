using System.Globalization;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Bell icon + unread badge + dropdown list, v3.3 Phase 3 (issue #326).
// Lives in MainLayout's <Authorized> block (see MainLayout.razor) --
// logged-out visitors never render this component at all, so it doesn't
// need its own auth check.
public partial class NotificationBell : ComponentBase
{
    [Inject]
    private ApiClient ApiClient { get; set; } = null!;

    private static readonly (string? Value, string Label)[] Filters =
    [
        (null, "Alle"),
        ("FOLLOW", "Follower"),
        ("COMMENT", "Kommentare"),
        ("RATING", "Bewertungen"),
        ("SHARE", "Freigaben"),
    ];

    private bool _isOpen;
    private string? _activeFilter;
    private List<NotificationItem>? _notifications;

    private int UnreadCount => _notifications?.Count(n => n.ReadAt is null) ?? 0;

    private List<NotificationItem> FilteredNotifications =>
        _notifications is null ? [] : (_activeFilter is null ? _notifications : _notifications.Where(n => n.Type == _activeFilter).ToList());

    protected override Task OnInitializedAsync() => LoadNotificationsAsync();

    private async Task LoadNotificationsAsync()
    {
        var response = await ApiClient.GetAsync<NotificationListResponse>("/api/notifications");
        _notifications = response is { Success: true, Data: not null } ? response.Data.Notifications : [];
    }

    private async Task ToggleOpenAsync()
    {
        _isOpen = !_isOpen;
        if (_isOpen) await LoadNotificationsAsync();
    }

    private void SetFilter(string? value) => _activeFilter = value;

    private async Task OnNotificationClickAsync(NotificationItem n)
    {
        if (n.ReadAt is not null) return;
        // Optimistic: flip local state immediately so the badge count and
        // unread styling update without waiting on the round-trip, same
        // "best-effort, don't block the UI on a supplementary write" spirit
        // as BookDetail.razor's comment actions.
        n.ReadAt = DateTime.UtcNow.ToString("O");
        await ApiClient.PostAsync($"/api/notifications/{n.Id}/read");
    }

    private async Task MarkAllReadAsync()
    {
        if (_notifications is null) return;
        foreach (var n in _notifications) n.ReadAt ??= DateTime.UtcNow.ToString("O");
        await ApiClient.PostAsync("/api/notifications/read-all");
    }

    // No leading slash -- Blazor's <base href> handles the GitHub Pages
    // "/lumina-chronica/" subpath prefix for relative links only. A leading
    // slash resolves from the domain root and 404s (same bug class as the
    // v3.1 hotfix, PR #302). See BookCard.razor/Discover.razor for the same
    // pattern used everywhere else.
    private static string BuildLink(NotificationItem n) => n.Type switch
    {
        "FOLLOW" => $"u/{n.ActorUsername}",
        "COMMENT" when n.TargetType == "PROJECT" => $"projects/{n.TargetId}",
        _ when n.TargetType == "BOOK" => $"library/books/{n.TargetId}",
        _ => $"u/{n.ActorUsername}",
    };

    private static string NotificationText(NotificationItem n) => n.Type switch
    {
        "FOLLOW" => $"{n.ActorUsername} folgt dir jetzt",
        "COMMENT" => $"{n.ActorUsername} hat kommentiert",
        "RATING" => $"{n.ActorUsername} hat dein Buch bewertet",
        "SHARE" => $"{n.ActorUsername} hat ein Buch mit dir geteilt",
        _ => $"{n.ActorUsername}",
    };

    private static string FormatNotificationDate(string createdAt)
    {
        if (!DateTime.TryParse(createdAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
        {
            return createdAt;
        }
        return parsed.ToLocalTime().ToString("dd.MM.yyyy HH:mm", CultureInfo.InvariantCulture);
    }
}
