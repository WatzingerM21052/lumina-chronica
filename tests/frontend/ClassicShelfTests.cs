using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ClassicShelfTests : BunitContext
{
    public ClassicShelfTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
    }

    private static Book B(int id, string title, string? author = null) => new() { Id = id, Title = title, Author = author };

    [Fact]
    public void RendersOnePlaquePerSection_AndEveryBookAsALink()
    {
        var sections = new List<ShelfSection>
        {
            new("Zuletzt gelesen", ShelfSectionKind.Recent, [B(1, "Momo", "Michael Ende")], new Dictionary<int, double> { [1] = 80 }),
            new("Fantasy", ShelfSectionKind.Genre, [B(2, "Krabat"), B(3, "Eragon")]),
        };

        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, sections).Add(x => x.Zoom, 1).Add(x => x.ShowCoverText, true));

        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".classic-shelf-plaque").Select(e => e.TextContent));
        var links = cut.FindAll("a.classic-shelf-slot");
        Assert.Equal(3, links.Count);
        Assert.Equal("library/books/1", links[0].GetAttribute("href"));
        Assert.Equal("Momo, Michael Ende", links[0].GetAttribute("aria-label"));
        Assert.Equal("Krabat", links[1].GetAttribute("aria-label"));
        Assert.Single(cut.FindAll(".classic-shelf-progress"));
        Assert.Contains("width: 80%", cut.Find(".classic-shelf-progress span").GetAttribute("style"));
    }

    [Fact]
    public void BreaksASectionIntoSeveralPlanks_OnceTheWidthIsKnown()
    {
        var books = Enumerable.Range(1, 40).Select(i => B(i, $"Buch {i}")).ToList();
        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, [new ShelfSection("Fantasy", ShelfSectionKind.Genre, books)]).Add(x => x.Zoom, 1));

        Assert.Single(cut.FindAll(".classic-shelf-plank"));
        cut.InvokeAsync(() => cut.Instance.OnShelfWidth(400));

        Assert.True(cut.FindAll(".classic-shelf-plank").Count > 1);
        Assert.Single(cut.FindAll(".classic-shelf-plaque"));
        Assert.Equal(40, cut.FindAll("a.classic-shelf-slot").Count);
    }

    [Fact]
    public void BookSize_FollowsTheZoom_WithInvariantNumbers()
    {
        var book = B(5, "Faust");
        var size = ShelfLineLayout.SizeFor(book);
        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, [new ShelfSection("Klassiker", ShelfSectionKind.Genre, [book])]).Add(x => x.Zoom, 1.5));

        var style = cut.Find("a.classic-shelf-slot").GetAttribute("style")!;
        Assert.Contains($"--w: {(size.Width * 1.5).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture)}px", style);
        Assert.Contains("--zoom: 1.5", cut.Find(".classic-shelf").GetAttribute("style"));
    }

    [Fact]
    public void SmallCompartmentsShareABoard_AndAnObjectFillsTheFreeEnd()
    {
        var sections = new List<ShelfSection>
        {
            new("Fantasy", ShelfSectionKind.Genre, [B(1, "Momo"), B(2, "Krabat")]),
            new("Roman", ShelfSectionKind.Genre, [B(3, "Faust")]),
        };
        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, sections));
        cut.InvokeAsync(() => cut.Instance.OnShelfWidth(900));

        var bay = Assert.Single(cut.FindAll(".classic-shelf-bay"));
        Assert.Equal(["Fantasy", "Roman"], bay.QuerySelectorAll(".classic-shelf-plaque").Select(p => p.TextContent));
        Assert.Single(bay.QuerySelectorAll(".shelf-object"));
    }

    [Fact]
    public void ClickingABook_AsksToOpenIt_FromItsPlaceOnTheShelf()
    {
        BookOpenRequest? request = null;
        var section = new ShelfSection("Fantasy", ShelfSectionKind.Genre, [B(7, "Momo")]);
        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, [section]).Add(x => x.OnOpen, (BookOpenRequest r) => request = r));

        var slot = cut.Find("a.classic-shelf-slot");
        slot.Click();

        Assert.NotNull(request);
        Assert.Equal(7, request!.Book.Id);
        Assert.Equal(slot.GetAttribute("data-spread-key"), request.Source.Key);
    }
}
