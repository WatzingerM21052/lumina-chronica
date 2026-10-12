namespace LuminaChronica.Client.Models;

// One bay of the rotunda: three shelf rows. A compartment that doesn't fit
// continues in the next bay (Continued = true).
public record RotundaBay(string? Label, ShelfSectionKind? Kind, List<List<Book>> Rows, IReadOnlyDictionary<int, double>? Progress, bool Continued);

// The rotunda shelf style (spec 2026-10-11 §6 D, polish 2026-10-12):
// compartments laid into bays standing in a ring -- or, with fewer than
// FullRing bays, in an arc of exactly as many bays as needed.
public static class RotundaLayout
{
    public const int RowsPerBay = 3;

    // From this many bays they close a full ring; below, an arc with bays
    // ArcStep degrees apart.
    public const int FullRing = 12;
    public const double ArcStep = 30;

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

        return bays;
    }

    // Degrees between two bays.
    public static double Step(int bayCount) => bayCount >= FullRing ? 360.0 / bayCount : ArcStep;

    // Radius at which bays BayWidth px wide stand edge to edge, Step apart.
    public static double Radius(int bayCount, double bayWidth) =>
        bayWidth / (2 * Math.Sin(Step(bayCount) * Math.PI / 360));
}
