using System.Globalization;

namespace LuminaChronica.Client.Services;

// D1 timestamps arrive as "yyyy-MM-dd HH:mm:ss" in UTC with no offset
// (the reason the models keep them as strings). Shown raw, a comment
// written at 16:53 in Vienna read "2026-10-11 14:53:00".
public static class DisplayDate
{
    public static string DateTime(string? stored) =>
        TryParseUtc(stored, out var utc) ? utc.ToLocalTime().ToString("dd.MM.yyyy, HH:mm", CultureInfo.InvariantCulture) : stored ?? string.Empty;

    private static bool TryParseUtc(string? stored, out System.DateTime utc) =>
        System.DateTime.TryParse(stored, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out utc);
}
