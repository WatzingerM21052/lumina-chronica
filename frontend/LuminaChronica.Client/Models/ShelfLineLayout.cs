namespace LuminaChronica.Client.Models;

public readonly record struct ShelfBookSize(int Width, int Height);

// Book sizes and line breaks for the shelf styles. Sizes come from the id
// (stable across renders, nothing stored); the shelf's inner width comes
// from shelfLayout.js, so every line gets its own plank.
public static class ShelfLineLayout
{
    public const int Gap = 3;

    public static ShelfBookSize SizeFor(Book book)
    {
        var hash = unchecked((uint)book.Id * 2654435761u);
        return new ShelfBookSize(26 + (int)(hash % 19), 176 + (int)((hash >> 8) % 47));
    }

    // "Zuletzt gelesen" stands cover-forward: every book is a cover this wide.
    public const int CoverWidth = 136;

    public static List<List<Book>> Lines(IReadOnlyList<Book> books, double availableWidth, double zoom) =>
        Lines(books, availableWidth, zoom, book => SizeFor(book).Width);

    // Width of a line's books including the gaps between them.
    public static double UsedWidth(IReadOnlyList<Book> line, double zoom, Func<Book, int> widthOf) =>
        line.Sum(b => widthOf(b) * zoom) + Gap * Math.Max(0, line.Count - 1);

    public static List<List<Book>> Lines(IReadOnlyList<Book> books, double availableWidth, double zoom, Func<Book, int> widthOf)
    {
        var lines = new List<List<Book>>();
        if (books.Count == 0) return lines;
        if (availableWidth <= 0) return [books.ToList()];

        var line = new List<Book>();
        double used = 0;
        foreach (var book in books)
        {
            var width = widthOf(book) * zoom;
            var needed = line.Count == 0 ? width : used + Gap + width;
            if (line.Count > 0 && needed > availableWidth)
            {
                lines.Add(line);
                line = [];
                needed = width;
            }
            line.Add(book);
            used = needed;
        }
        lines.Add(line);
        return lines;
    }

    // Rows of a shelf whose small compartments share a board: a compartment
    // joins the current row when all its books fit there (after a gap); a
    // bigger one starts its own rows. "Zuletzt gelesen" always stands
    // alone. Without a known width every compartment is one row.
    public static List<List<ShelfSegment>> Pack(
        IReadOnlyList<ShelfSection> sections, double availableWidth, double zoom,
        Func<ShelfSection, Func<Book, int>> widthOf, double groupGap, Func<ShelfSection, double>? minWidth = null)
    {
        var rows = new List<List<ShelfSegment>>();
        double used = 0;
        var rowTakesMore = false;
        foreach (var section in sections)
        {
            var width = widthOf(section);
            var lines = Lines(section.Books, availableWidth, zoom, width);
            if (lines.Count == 0) continue;

            var alone = section.Kind == ShelfSectionKind.Recent;
            var first = lines[0];
            // A compartment is at least as wide as its plaque.
            var firstWidth = Math.Max(UsedWidth(first, zoom, width), minWidth?.Invoke(section) ?? 0);
            if (availableWidth > 0 && rowTakesMore && !alone && lines.Count == 1 && used + groupGap * zoom + firstWidth <= availableWidth)
            {
                rows[^1].Add(new ShelfSegment(section, first, true));
                used += groupGap * zoom + firstWidth;
            }
            else
            {
                rows.Add([new ShelfSegment(section, first, true)]);
                used = firstWidth;
            }

            for (var i = 1; i < lines.Count; i++)
            {
                rows.Add([new ShelfSegment(section, lines[i], false)]);
                used = UsedWidth(lines[i], zoom, width);
            }
            rowTakesMore = !alone;
        }
        return rows;
    }
}

// Part of a shelf row: one compartment's books on it; First marks where
// the compartment begins (it carries the plaque).
public record ShelfSegment(ShelfSection Section, List<Book> Books, bool First);
