using System.Globalization;

namespace LuminaChronica.Client.Services;

// "1 Bücher", "1 aktive Tage": a count text needs its singular. German and
// English both use it for exactly 1, so a key "x" with a sibling "xOne" is
// enough -- no plural rules engine.
public static class I18nCountExtensions
{
    public static string Count(this II18nService i18n, string key, long count) =>
        string.Format(CultureInfo.InvariantCulture, i18n.T(count == 1 ? key + "One" : key), count);
}
