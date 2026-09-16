using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryShelfGroupingTests
{
    private static Book MakeBook(int id, string title, string? author = null, string createdAt = "2026-01-01T00:00:00Z", string? genre = null) =>
        new() { Id = id, Title = title, Author = author, CreatedAt = createdAt, Genre = genre };

    [Fact]
    public void Group_EmptyList_ReturnsEmpty()
    {
        var result = LibraryShelfGrouping.Group([], "createdAt", [], []);

        Assert.Empty(result);
    }

    [Fact]
    public void Group_SingleGenreFilterActive_ReturnsOneGroupLabeledWithGenre()
    {
        var books = new List<Book> { MakeBook(1, "A"), MakeBook(2, "B") };

        var result = LibraryShelfGrouping.Group(books, "createdAt", ["Fantasy"], []);

        var group = Assert.Single(result);
        Assert.Equal("Fantasy", group.Label);
        Assert.Equal(2, group.Books.Count);
    }

    [Fact]
    public void Group_SingleTagFilterActive_ReturnsOneGroupLabeledWithTag()
    {
        var books = new List<Book> { MakeBook(1, "A") };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], ["Lieblingsbücher"]);

        var group = Assert.Single(result);
        Assert.Equal("Lieblingsbücher", group.Label);
    }

    [Fact]
    public void Group_SortedByTitle_GroupsAlphabeticallyByFirstLetter()
    {
        var books = new List<Book> { MakeBook(1, "Apple"), MakeBook(2, "Banana"), MakeBook(3, "Avocado") };

        var result = LibraryShelfGrouping.Group(books, "title", [], []);

        Assert.Equal(2, result.Count);
        Assert.Equal("A", result[0].Label);
        Assert.Equal(2, result[0].Books.Count);
        Assert.Equal("B", result[1].Label);
        Assert.Single(result[1].Books);
    }

    [Fact]
    public void Group_SortedByAuthor_FallsBackToTitleWhenAuthorMissing()
    {
        var books = new List<Book> { MakeBook(1, "Zebra", author: null) };

        var result = LibraryShelfGrouping.Group(books, "author", [], []);

        var group = Assert.Single(result);
        Assert.Equal("Z", group.Label);
    }

    [Fact]
    public void Group_SortedByCreatedAt_BucketsIntoRecencyGroups()
    {
        var today = DateTime.UtcNow;
        var books = new List<Book>
        {
            MakeBook(1, "Recent", createdAt: today.ToString("O")),
            MakeBook(2, "Old", createdAt: today.AddYears(-2).ToString("O")),
        };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], []);

        Assert.Contains(result, g => g.Label == "Diese Woche" && g.Books.Count == 1);
        Assert.Contains(result, g => g.Label == "Älter" && g.Books.Count == 1);
    }

    [Fact]
    public void Group_UnparsableCreatedAt_FallsBackToOlderBucket()
    {
        var books = new List<Book> { MakeBook(1, "Broken", createdAt: "not-a-date") };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], []);

        var group = Assert.Single(result);
        Assert.Equal("Älter", group.Label);
    }

    [Fact]
    public void Group_EmptyBucketsAreOmitted()
    {
        var books = new List<Book> { MakeBook(1, "Recent", createdAt: DateTime.UtcNow.ToString("O")) };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], []);

        Assert.DoesNotContain(result, g => g.Books.Count == 0);
    }

    [Fact]
    public void Group_SortedByGenre_GroupsByGenreLabel()
    {
        var books = new List<Book>
        {
            MakeBook(1, "A", genre: "Fantasy"),
            MakeBook(2, "B", genre: "Fantasy"),
            MakeBook(3, "C", genre: "Krimi"),
        };

        var result = LibraryShelfGrouping.Group(books, "genre", [], []);

        Assert.Equal(2, result.Count);
        var fantasy = Assert.Single(result, g => g.Label == "Fantasy");
        Assert.Equal(2, fantasy.Books.Count);
        var krimi = Assert.Single(result, g => g.Label == "Krimi");
        Assert.Single(krimi.Books);
    }

    [Fact]
    public void Group_SortedByGenre_MissingGenreGetsFallbackLabel()
    {
        var books = new List<Book> { MakeBook(1, "NoGenre", genre: null) };

        var result = LibraryShelfGrouping.Group(books, "genre", [], []);

        var group = Assert.Single(result);
        Assert.Equal("Ohne Genre", group.Label);
    }

    [Fact]
    public void Group_SingleGenreFilterActive_TakesPrecedenceOverGenreSort()
    {
        // A single active genre filter already narrows the whole result set
        // to one genre -- grouping by genre on top of that would just be
        // one group again, so the existing single-genre-filter short
        // circuit (tested above) must still win regardless of _sort.
        var books = new List<Book> { MakeBook(1, "A", genre: "Fantasy"), MakeBook(2, "B", genre: "Fantasy") };

        var result = LibraryShelfGrouping.Group(books, "genre", ["Fantasy"], []);

        var group = Assert.Single(result);
        Assert.Equal("Fantasy", group.Label);
    }

    [Fact]
    public void Group_SingleTagFilterActive_DoesNotOverrideGenreSort()
    {
        // Unlike a single genre filter, a single tag filter can span many
        // genres -- so it must NOT collapse an explicit sort=genre into one
        // tag-labeled group. This is the fix for the precedence bug found
        // in review: sortKey == "genre" must win over the tag shortcut.
        var books = new List<Book>
        {
            MakeBook(1, "A", genre: "Fantasy"),
            MakeBook(2, "B", genre: "Krimi"),
        };

        var result = LibraryShelfGrouping.Group(books, "genre", [], ["Lieblingsbücher"]);

        Assert.Equal(2, result.Count);
        Assert.Contains(result, g => g.Label == "Fantasy");
        Assert.Contains(result, g => g.Label == "Krimi");
    }
}
