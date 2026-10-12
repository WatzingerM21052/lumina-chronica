namespace LuminaChronica.Client.Models;

// The library shelf view's styles (spec 2026-10-11). Stored per browser in
// libraryPreferences.js; Available grows as each style ships.
public static class ShelfStyles
{
    public const string Classic = "classic";
    public const string Leather = "leather";
    public const string Library = "library";
    public const string Legacy = "legacy";
    public const string Default = Classic;

    public static readonly string[] Available = [Classic, Leather, Library, Legacy];

    // "room" and "rotunda" were styles until the 3D library replaced them.
    public static string Normalize(string? stored) => stored switch
    {
        "room" or "rotunda" => Library,
        not null when Available.Contains(stored) => stored,
        _ => Default,
    };
}
