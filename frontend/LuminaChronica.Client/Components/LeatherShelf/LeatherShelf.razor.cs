using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class LeatherShelf
{
    private const string Style = "leather";

    // Gap between two compartments on one board (room for the plaque).
    private const int GroupGap = 44;

    // Space an object needs at the end of a board.
    private const int ObjectRoom = 170;

    // Leather volumes are a little wider than the classic books.
    internal static int WidthOf(Book book) => ShelfLineLayout.SizeFor(book).Width + 4;

    private static Func<Book, int> WidthOfSection(ShelfSection _) => WidthOf;

    private List<List<ShelfSegment>> Rows => ShelfLineLayout.Pack(Sections, Width, Zoom, WidthOfSection, GroupGap, PlaqueWidth);

    // About how wide a plaque is (Cinzel caps, letter-spaced, plus rivets).
    private static double PlaqueWidth(ShelfSection section) => Math.Min(320, 40 + section.Label.Length * 9.5);

    private static string? GroupStyle(ShelfSegment segment) => segment.First
        ? string.Create(System.Globalization.CultureInfo.InvariantCulture, $"min-width: {PlaqueWidth(segment.Section):0}px")
        : null;

    private bool ObjectFits(List<ShelfSegment> row)
    {
        if (Width <= 0) return false;
        var used = row.Sum(s => Math.Max(ShelfLineLayout.UsedWidth(s.Books, Zoom, WidthOf), s.First ? PlaqueWidth(s.Section) : 0)) + GroupGap * Zoom * (row.Count - 1);
        return used + ObjectRoom * Zoom <= Width;
    }
}
