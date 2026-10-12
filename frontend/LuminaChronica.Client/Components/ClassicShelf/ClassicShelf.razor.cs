using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class ClassicShelf
{
    private const string Style = "classic";

    // Gap between two compartments on one board (room for the plaque).
    private const int GroupGap = 44;


    // Cover-forward books of "Zuletzt gelesen": smaller on a phone, so two
    // stand side by side.
    private int CoverWidth => Width is > 0 and < 520 ? ShelfLineLayout.CoverWidth * 3 / 4 : ShelfLineLayout.CoverWidth;

    private Func<Book, int> WidthOf(ShelfSection section) =>
        section.Kind == ShelfSectionKind.Recent ? _ => CoverWidth : b => ShelfLineLayout.SizeFor(b).Width;

    private List<List<ShelfSegment>> Rows => ShelfLineLayout.Pack(Sections, Width, Zoom, WidthOf, GroupGap, PlaqueWidth);

    // About how wide a plaque is (Cinzel caps, letter-spaced, plus rivets).
    private static double PlaqueWidth(ShelfSection section) => Math.Min(320, 40 + section.Label.Length * 9.5);


    // Keeps a compartment as wide as its plaque, so plaques never touch.
    private static string? GroupStyle(ShelfSegment segment) => segment.First
        ? string.Create(System.Globalization.CultureInfo.InvariantCulture, $"min-width: {PlaqueWidth(segment.Section):0}px")
        : null;

    // The cover-forward board is only as tall as its covers.
    private string? BayStyle(bool recent) => recent
        ? string.Create(System.Globalization.CultureInfo.InvariantCulture, $"--classic-row-height: {CoverWidth * 1.44 * Zoom + 26:0.##}px")
        : null;
}
