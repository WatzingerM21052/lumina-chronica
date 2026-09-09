using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfRowTests : BunitContext
{
    public ShelfRowTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    private static List<Book> MakeBooks(int count) =>
        Enumerable.Range(1, count).Select(i => new Book { Id = i, Title = $"Book {i}" }).ToList();

    [Fact]
    public void ShelfRow_RendersOneShelfBookPerBook()
    {
        var cut = Render<ShelfRow>(parameters => parameters.Add(p => p.Books, MakeBooks(3)));

        Assert.Equal(3, cut.FindAll("a.shelf-book").Count);
    }

    [Fact]
    public void ShelfRow_WithLabel_RendersPlaque()
    {
        var cut = Render<ShelfRow>(parameters => parameters
            .Add(p => p.Books, MakeBooks(1))
            .Add(p => p.Label, "Fantasy"));

        Assert.Contains("Fantasy", cut.Find(".shelf-plaque").TextContent);
    }

    [Fact]
    public void ShelfRow_WithoutLabel_RendersNoPlaque()
    {
        var cut = Render<ShelfRow>(parameters => parameters.Add(p => p.Books, MakeBooks(1)));

        Assert.Empty(cut.FindAll(".shelf-plaque"));
    }

    [Fact]
    public void ShelfRow_EachBookWrappedInPreserve3dSlot()
    {
        var cut = Render<ShelfRow>(parameters => parameters.Add(p => p.Books, MakeBooks(2)));

        Assert.Equal(2, cut.FindAll(".shelf-book-slot").Count);
    }
}
