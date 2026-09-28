using System.Text.RegularExpressions;

namespace LuminaChronica.Client.Services;

// Client-side mirror of backend/src/utils/identity.ts, so the forms can show
// a translated message before the request instead of the backend's English
// one. The backend stays the authority; keep both in sync.
public static partial class AccountRules
{
    public const int MinPasswordLength = 6;

    // No "@" (a username must never look like someone's email), URL-safe,
    // 3-32 characters. Only checked for NEW usernames -- legacy ones stay.
    [GeneratedRegex("^[A-Za-z0-9_.-]{3,32}$")]
    private static partial Regex UsernamePattern();

    public static bool IsValidUsername(string username) => UsernamePattern().IsMatch(username);
}
