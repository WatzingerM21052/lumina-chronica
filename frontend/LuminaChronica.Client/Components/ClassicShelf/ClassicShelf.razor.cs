using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class ClassicShelf
{
    // A brass bookend closes a line that doesn't reach the end of the
    // compartment (only once the width is known).
    private const int BookendWidth = 22;

    // Cover-forward books of "Zuletzt gelesen": smaller on a phone, so two
    // stand side by side.
    private int CoverWidth => Width is > 0 and < 520 ? ShelfLineLayout.CoverWidth * 3 / 4 : ShelfLineLayout.CoverWidth;

    private bool HasRoomForBookend(IReadOnlyList<Book> line, Func<Book, int> widthOf) =>
        Width > 0 && ShelfLineLayout.UsedWidth(line, Zoom, widthOf) + (ShelfLineLayout.Gap + BookendWidth) * Zoom <= Width;

    // The cover-forward compartment is only as tall as its covers.
    private string? BayStyle(ShelfSection bay) => bay.Kind == ShelfSectionKind.Recent
        ? string.Create(System.Globalization.CultureInfo.InvariantCulture, $"--classic-row-height: {CoverWidth * 1.44 * Zoom + 26:0.##}px")
        : null;

    // A book turning its cover out swings it to the left by about its
    // depth; near the left wall it slides right first, so the cover stays
    // inside the compartment.
    private double HoverShift(double left) => Math.Max(0, ClassicShelfBook.Depth * Zoom * 0.95 - left);
}
