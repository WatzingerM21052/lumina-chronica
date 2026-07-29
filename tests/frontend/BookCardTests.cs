using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class BookCardTests : BunitContext
{
    public BookCardTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    private static Book MakeBook() => new() { Id = 1, Title = "The Hobbit", Author = "J.R.R. Tolkien", CoverUrl = null };

    [Fact]
    public void BookCard_RendersTitleAndAuthor()
    {
        var cut = Render<BookCard>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Contains("The Hobbit", cut.Markup);
        Assert.Contains("J.R.R. Tolkien", cut.Markup);
    }

    [Theory]
    [InlineData(BookCardSize.Small, "book-card-small")]
    [InlineData(BookCardSize.Normal, "book-card-normal")]
    [InlineData(BookCardSize.Large, "book-card-large")]
    public void BookCard_AppliesSizeVariantCssClass(BookCardSize size, string expectedClass)
    {
        var cut = Render<BookCard>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.Size, size));

        Assert.Contains(expectedClass, cut.Find("a.book-card").ClassList);
    }

    [Fact]
    public void BookCard_LinksToBookDetailPage()
    {
        var cut = Render<BookCard>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("library/books/1", cut.Find("a.book-card").GetAttribute("href"));
    }
}
