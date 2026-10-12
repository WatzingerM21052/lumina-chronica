using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfRoomTests : BunitContext
{
    private static readonly List<ShelfSection> Sections =
    [
        new("Zuletzt gelesen", ShelfSectionKind.Recent, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }], new Dictionary<int, double> { [1] = 80 }),
        new("Fantasy", ShelfSectionKind.Genre, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }, new Book { Id = 2, Title = "Krabat" }]),
    ];

    public ShelfRoomTests()
    {
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
    }

    [Fact]
    public void WithoutWebGl_TheClassicShelfStandsIn()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule("./js/shelfRoom.js").Setup<bool>("supported").SetResult(false);

        var cut = Render<ShelfRoom>(p => p.Add(x => x.Sections, Sections));

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".classic-shelf")));
        Assert.Contains("klassische Regal", cut.Find(".shelf-room-fallback").TextContent);
        Assert.Empty(cut.FindAll(".shelf-room"));
    }

    [Fact]
    public void WithWebGl_EveryBookIsInTheIndex_AndPickingShowsTheCard()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var module = JSInterop.SetupModule("./js/shelfRoom.js");
        module.Setup<bool>("supported").SetResult(true);
        var pick = module.SetupVoid("pickBook", _ => true);

        var cut = Render<ShelfRoom>(p => p.Add(x => x.Sections, Sections));

        var links = cut.FindAll(".shelf-room-index a");
        Assert.Equal(3, links.Count);
        Assert.Equal("library/books/2", links[2].GetAttribute("href"));
        Assert.Equal("Krabat", links[2].TextContent);

        links[0].Click();
        Assert.Equal(1, Assert.Single(pick.Invocations).Arguments[1]);

        cut.InvokeAsync(() => cut.Instance.OnPicked(1));
        Assert.Equal("Momo", cut.Find("#shelf-room-card-title").TextContent);
        Assert.Contains("80 % gelesen", cut.Find(".shelf-room-card").TextContent);
        Assert.Equal("library/books/1/read", cut.Find(".shelf-room-card-actions a").GetAttribute("href"));

        cut.InvokeAsync(() => cut.Instance.OnReleased());
        Assert.Empty(cut.FindAll(".shelf-room-card"));
    }
}
