using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LeatherShelfTests : BunitContext
{
    public LeatherShelfTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
    }

    private static Book B(int id, string title, string? author = null, string? genre = null) => new() { Id = id, Title = title, Author = author, Genre = genre };

    [Fact]
    public void EveryBookIsALink_WithAPlaquePerSection_AndProgressOnTheCard()
    {
        var sections = new List<ShelfSection>
        {
            new("Zuletzt gelesen", ShelfSectionKind.Recent, [B(1, "Momo", "Michael Ende")], new Dictionary<int, double> { [1] = 42.4 }),
            new("Fantasy", ShelfSectionKind.Genre, [B(2, "Krabat", genre: "Fantasy"), B(3, "Eragon")]),
        };

        var cut = Render<LeatherShelf>(p => p.Add(x => x.Sections, sections));

        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".leather-shelf-plaque").Select(e => e.TextContent));
        var links = cut.FindAll("a.leather-shelf-book");
        Assert.Equal(["library/books/1", "library/books/2", "library/books/3"], links.Select(l => l.GetAttribute("href")));
        Assert.Equal("Momo, Michael Ende", links[0].GetAttribute("aria-label"));
        Assert.Equal("42 % gelesen", cut.Find(".leather-shelf-card-meta span").TextContent);
        Assert.Equal("Fantasy", links[1].QuerySelector(".leather-shelf-card-meta")!.TextContent);
    }

    [Fact]
    public void CardsOpenTowardsTheMiddle_OnceTheWidthIsKnown()
    {
        var books = Enumerable.Range(1, 12).Select(i => B(i, $"Buch {i}")).ToList();
        var cut = Render<LeatherShelf>(p => p.Add(x => x.Sections, [new ShelfSection("Fantasy", ShelfSectionKind.Genre, books)]));

        Assert.Empty(cut.FindAll(".leather-shelf-card.is-left"));
        cut.InvokeAsync(() => cut.Instance.OnShelfWidth(600));

        var cards = cut.FindAll(".leather-shelf-card");
        Assert.False(cards[0].ClassList.Contains("is-left"));
        Assert.True(cards[^1].ClassList.Contains("is-left"));
    }
}
