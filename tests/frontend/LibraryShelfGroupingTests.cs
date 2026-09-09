using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryShelfGroupingTests
{
    private static Book MakeBook(int id, string title, string? author = null, string createdAt = "2026-01-01T00:00:00Z") =>
        new() { Id = id, Title = title, Author = author, CreatedAt = createdAt };

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
}
