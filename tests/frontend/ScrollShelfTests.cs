using System.Globalization;
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ScrollShelfTests : BunitContext
{
    public ScrollShelfTests()
    {
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    private static Book MakeBook(int id, string title, string? genre, string? author = "A. Author") =>
        new() { Id = id, Title = title, Author = author, Genre = genre };

    [Fact]
    public void ScrollShelf_RendersOneLinkedScrollPerBook_WithTitleAuthorAndGenreInLabel()
    {
        var cut = Render<ScrollShelf>(p => p
            .Add(x => x.Books, [MakeBook(7, "Dune", "Science Fiction", "Frank Herbert"), MakeBook(8, "Emma", null)]));

        var scrolls = cut.FindAll("a.book-scroll");
        Assert.Equal(2, scrolls.Count);
        Assert.Equal("library/books/7", scrolls[0].GetAttribute("href"));
        Assert.Equal("Dune – Frank Herbert, Science Fiction", scrolls[0].GetAttribute("aria-label"));
        Assert.Contains("Dune", scrolls[0].QuerySelector(".scroll-tag b")!.TextContent);
    }

    // Seals follow the genre's place in the library's facet list, so two
    // genres never share a colour until the palette runs out.
    [Fact]
    public void ScrollShelf_SealColour_FollowsFacetOrder_AndIgnoresCase()
    {
        var cut = Render<ScrollShelf>(p => p
            .Add(x => x.Books, [MakeBook(1, "A", " science fiction "), MakeBook(2, "B", "Klassiker"), MakeBook(3, "C", null)])
            .Add(x => x.Genres, ["Klassiker", "Science Fiction"]));

        var tags = cut.FindAll(".scroll-tag");
        Assert.Contains($"--seal: {ScrollShelf.SealPalette[1]}", tags[0].GetAttribute("style"));
        Assert.Contains($"--seal: {ScrollShelf.SealPalette[0]}", tags[1].GetAttribute("style"));
        Assert.Contains($"--seal: {ScrollShelf.NoGenreSeal}", tags[2].GetAttribute("style"));
    }

    [Fact]
    public void ScrollShelf_Legend_ListsEachGenreOnce_InFacetOrder()
    {
        var cut = Render<ScrollShelf>(p => p
            .Add(x => x.Books, [MakeBook(1, "A", "Science Fiction"), MakeBook(2, "B", "Klassiker"), MakeBook(3, "C", "science fiction"), MakeBook(4, "D", null)])
            .Add(x => x.Genres, ["Klassiker", "Science Fiction"]));

        var items = cut.FindAll(".scroll-legend li").Select(li => li.TextContent).ToList();
        Assert.Equal(["Klassiker", "Science Fiction"], items);
    }

    [Fact]
    public void ScrollShelf_NoGenres_RendersNoLegend()
    {
        var cut = Render<ScrollShelf>(p => p.Add(x => x.Books, [MakeBook(1, "A", null)]));

        Assert.Empty(cut.FindAll(".scroll-legend"));
    }

    // Same trap as #554: the per-book variation goes into inline CSS, so it
    // must never print a decimal comma.
    [Fact]
    public void ScrollShelf_InlineStyles_HaveNoDecimalComma_UnderGermanCulture()
    {
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = new CultureInfo("de-AT");
        try
        {
            var books = Enumerable.Range(1, 12).Select(i => MakeBook(i, $"Book {i}", "Genre")).ToList();
            var cut = Render<ScrollShelf>(p => p.Add(x => x.Books, books));

            foreach (var element in cut.FindAll(".scroll-cylinder, .scroll-tag"))
            {
                Assert.DoesNotMatch(@"\d,\d", element.GetAttribute("style")!);
            }
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }
}
