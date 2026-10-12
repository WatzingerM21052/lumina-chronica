using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class RotundaShelfTests : BunitContext
{
    public RotundaShelfTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    private static readonly List<ShelfSection> Sections =
    [
        new("Zuletzt gelesen", ShelfSectionKind.Recent, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }], new Dictionary<int, double> { [1] = 80 }),
        new("Fantasy", ShelfSectionKind.Genre, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }, new Book { Id = 2, Title = "Krabat" }]),
    ];

    [Fact]
    public void AFewCompartments_StandInAnArc_WithTitledSpinesAndABayList()
    {
        var cut = Render<RotundaShelf>(p => p.Add(x => x.Sections, Sections));

        Assert.Equal(2, cut.FindAll(".rotunda-bay").Count);
        Assert.Contains("is-arc", cut.Find(".rotunda").ClassList);
        var spines = cut.FindAll("a.rotunda-spine");
        Assert.Equal(3, spines.Count);
        Assert.Equal("library/books/1", spines[0].GetAttribute("href"));
        Assert.Equal("Momo, Michael Ende", spines[0].GetAttribute("aria-label"));
        Assert.Equal("Krabat", spines[2].QuerySelector(".rotunda-spine-title")!.TextContent);
        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".rotunda-nav-item").Select(b => b.TextContent));
        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".rotunda-plaque").Select(p => p.TextContent));
    }

    [Fact]
    public void ClickingASpine_AsksToOpenTheBook_WithItsProgress()
    {
        BookOpenRequest? request = null;
        var cut = Render<RotundaShelf>(p => p.Add(x => x.Sections, Sections).Add(x => x.OnOpen, (BookOpenRequest r) => request = r));

        var spine = cut.FindAll("a.rotunda-spine")[0];
        spine.Click();

        Assert.Equal(1, request!.Book.Id);
        Assert.Equal(80, request.Progress);
        Assert.Equal(spine.GetAttribute("data-spread-key"), request.Source.Key);
    }
}
