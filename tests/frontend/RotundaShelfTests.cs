using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class RotundaShelfTests : BunitContext
{
    public RotundaShelfTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
    }

    private static readonly List<ShelfSection> Sections =
    [
        new("Zuletzt gelesen", ShelfSectionKind.Recent, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende", Genre = "Fantasy", Description = "Die Zeitdiebe." }], new Dictionary<int, double> { [1] = 80 }),
        new("Fantasy", ShelfSectionKind.Genre, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende", Genre = "Fantasy" }, new Book { Id = 2, Title = "Krabat" }]),
    ];

    [Fact]
    public void RingHasAtLeastTenBays_WithEveryBookAsALink()
    {
        var cut = Render<RotundaShelf>(p => p.Add(x => x.Sections, Sections));

        Assert.Equal(RotundaLayout.MinBays, cut.FindAll(".rotunda-bay").Count);
        Assert.Equal("Zuletzt gelesen", cut.Find(".rotunda-bay").GetAttribute("data-label"));
        var spines = cut.FindAll("a.rotunda-spine");
        Assert.Equal(3, spines.Count);
        Assert.Equal("library/books/1", spines[0].GetAttribute("href"));
        Assert.Equal("Momo, Michael Ende", spines[0].GetAttribute("aria-label"));
        Assert.Equal(8, cut.FindAll(".rotunda-bay.is-empty").Count);
    }

    [Fact]
    public void ClickingASpine_OpensTheBook_AndEscapeClosesIt()
    {
        var cut = Render<RotundaShelf>(p => p.Add(x => x.Sections, Sections));

        cut.FindAll("a.rotunda-spine")[0].Click();

        var dialog = cut.Find(".rotunda-open[role=dialog]");
        Assert.Equal("Momo", cut.Find("#rotunda-tome-title").TextContent);
        Assert.Contains("Die Zeitdiebe.", dialog.TextContent);
        Assert.Contains("80 % gelesen", dialog.TextContent);
        var actions = cut.FindAll(".rotunda-action");
        Assert.Equal("library/books/1/read", actions[0].GetAttribute("href"));
        Assert.Equal("Weiterlesen", actions[0].TextContent);
        Assert.Equal("library/books/1", actions[1].GetAttribute("href"));
        Assert.True(cut.Find(".rotunda-stage").HasAttribute("inert"));

        dialog.KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.Empty(cut.FindAll(".rotunda-open"));
        Assert.False(cut.Find(".rotunda-stage").HasAttribute("inert"));
    }

    [Fact]
    public void ABookWithoutProgress_OffersToRead()
    {
        var cut = Render<RotundaShelf>(p => p.Add(x => x.Sections, Sections));

        cut.FindAll("a.rotunda-spine")[2].Click();

        Assert.Equal("Lesen", cut.FindAll(".rotunda-action")[0].TextContent);
        cut.Find(".rotunda-close").Click();
        Assert.Empty(cut.FindAll(".rotunda-open"));
    }
}
