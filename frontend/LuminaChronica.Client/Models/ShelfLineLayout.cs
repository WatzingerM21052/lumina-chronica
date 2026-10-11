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

    public static List<List<Book>> Lines(IReadOnlyList<Book> books, double availableWidth, double zoom)
    {
        var lines = new List<List<Book>>();
        if (books.Count == 0) return lines;
        if (availableWidth <= 0) return [books.ToList()];

        var line = new List<Book>();
        double used = 0;
        foreach (var book in books)
        {
            var width = SizeFor(book).Width * zoom;
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
}
