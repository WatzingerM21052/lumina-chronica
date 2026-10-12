namespace LuminaChronica.Client.Models;

// One bay of the rotunda: three shelf rows. A compartment that doesn't fit
// continues in the next bay (Continued = true); bays without books only
// carry decor and close the ring.
public record RotundaBay(string? Label, ShelfSectionKind? Kind, List<List<Book>> Rows, IReadOnlyDictionary<int, double>? Progress, bool Continued);

// The rotunda shelf style (spec 2026-10-11 §6 D): compartments laid into
// bays standing in a ring.
public static class RotundaLayout
{
    public const int RowsPerBay = 3;
    public const int MinBays = 10;

    // Inner width of one bay row in px; spines are narrower than the
    // classic books so a bay holds a good handful per row.
    public const int RowWidth = 228;
    public const int Gap = 2;

    public static ShelfBookSize SpineSize(Book book)
    {
        var size = ShelfLineLayout.SizeFor(book);
        return new ShelfBookSize(16 + (size.Width - 26) * 14 / 18, 100 + (size.Height - 176) * 38 / 46);
    }

    public static List<RotundaBay> Bays(IReadOnlyList<ShelfSection> sections)
    {
        var bays = new List<RotundaBay>();
        foreach (var section in sections)
        {
            var lines = ShelfLineLayout.Lines(section.Books, RowWidth, 1, b => SpineSize(b).Width + Gap - ShelfLineLayout.Gap);
            for (var i = 0; i < lines.Count; i += RowsPerBay)
            {
                bays.Add(new RotundaBay(section.Label, section.Kind, lines.Skip(i).Take(RowsPerBay).ToList(), section.Progress, i > 0));
            }
        }

        while (bays.Count < MinBays)
        {
            bays.Add(new RotundaBay(null, null, [], null, false));
        }
        return bays;
    }

    // Ring radius so the bays (BayWidth px wide) stand edge to edge.
    public static double Radius(int bayCount, double bayWidth) => bayCount * bayWidth / (2 * Math.PI);
}
