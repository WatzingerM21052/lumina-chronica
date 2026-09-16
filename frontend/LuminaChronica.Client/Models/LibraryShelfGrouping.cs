using System.Globalization;

namespace LuminaChronica.Client.Models;

public record BookGroup(string? Label, List<Book> Books);

public static class LibraryShelfGrouping
{
    public static List<BookGroup> Group(
        IReadOnlyList<Book> books,
        string sortKey,
        IReadOnlyList<string> genreFilters,
        IReadOnlyList<string> tagFilters)
    {
        if (books.Count == 0)
        {
            return [];
        }

        if (genreFilters.Count == 1)
        {
            return [new BookGroup(genreFilters[0], books.ToList())];
        }

        // Unlike the single-genre-filter shortcut above, a single active TAG
        // filter does NOT imply every shown book shares one genre -- a tag
        // like "Lieblingsbücher" can span many genres. Collapsing to one
        // "tag" group would silently defeat an explicit sort=genre choice
        // (the entire point of that sort), so this shortcut only applies
        // when the user hasn't asked to group by genre.
        if (tagFilters.Count == 1 && sortKey != "genre")
        {
            return [new BookGroup(tagFilters[0], books.ToList())];
        }

        return sortKey switch
        {
            "title" or "author" => GroupAlphabetically(books, sortKey),
            "genre" => GroupByGenre(books),
            _ => GroupByRecency(books),
        };
    }

    private static List<BookGroup> GroupByGenre(IReadOnlyList<Book> books)
    {
        return books
            .GroupBy(b => string.IsNullOrWhiteSpace(b.Genre) ? "Ohne Genre" : b.Genre)
            .Select(g => new BookGroup(g.Key, g.ToList()))
            .OrderBy(g => g.Label == "Ohne Genre" ? 1 : 0)
            .ThenBy(g => g.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static List<BookGroup> GroupAlphabetically(IReadOnlyList<Book> books, string sortKey)
    {
        return books
            .GroupBy(b => FirstLetter(sortKey == "title" ? b.Title : b.Author ?? b.Title))
            .Select(g => new BookGroup(g.Key, g.ToList()))
            .ToList();
    }

    private static string FirstLetter(string value)
    {
        var trimmed = value.TrimStart();
        return trimmed.Length == 0 ? "#" : char.ToUpperInvariant(trimmed[0]).ToString();
    }

    private static List<BookGroup> GroupByRecency(IReadOnlyList<Book> books)
    {
        var today = DateTime.UtcNow.Date;
        var buckets = new (string Label, List<Book> Books)[]
        {
            ("Diese Woche", []),
            ("Diesen Monat", []),
            ("Dieses Jahr", []),
            ("Älter", []),
        };

        foreach (var book in books)
        {
            if (!DateTime.TryParse(book.CreatedAt, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var createdAt))
            {
                buckets[^1].Books.Add(book);
                continue;
            }

            var ageDays = (today - createdAt.Date).TotalDays;
            var bucketIndex = ageDays switch
            {
                <= 7 => 0,
                <= 31 => 1,
                <= 365 => 2,
                _ => 3,
            };
            buckets[bucketIndex].Books.Add(book);
        }

        return buckets
            .Where(b => b.Books.Count > 0)
            .Select(b => new BookGroup(b.Label, b.Books))
            .ToList();
    }
}
