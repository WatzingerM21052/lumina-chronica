namespace LuminaChronica.Client.Models;

// The library shelf view's styles (spec 2026-10-11). Stored per browser in
// libraryPreferences.js; Available grows as each style ships.
public static class ShelfStyles
{
    public const string Classic = "classic";
    public const string Leather = "leather";
    public const string Room = "room";
    public const string Rotunda = "rotunda";
    public const string Legacy = "legacy";
    public const string Default = Classic;

    public static readonly string[] Available = [Classic, Leather, Room, Rotunda, Legacy];

    public static string Normalize(string? stored) =>
        stored is not null && Available.Contains(stored) ? stored : Default;
}
