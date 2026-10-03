using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class WorldBannerTests : BunitContext
{
    public WorldBannerTests()
    {
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    // The theme files pick the picture by data-page; the banner carries the
    // page's one visible h1 in the themed worlds.
    [Fact]
    public void WorldBanner_RendersPageKey_TitleAndSubtitle()
    {
        var cut = Render<WorldBanner>(p => p
            .Add(x => x.Page, "statistics")
            .Add(x => x.Title, "Statistik")
            .Add(x => x.Subtitle, "Deine Lesereise in Zahlen."));

        Assert.Equal("statistics", cut.Find(".world-banner").GetAttribute("data-page"));
        Assert.Equal("Statistik", cut.Find("h1").TextContent);
        Assert.Equal("Deine Lesereise in Zahlen.", cut.Find(".world-banner-subtitle").TextContent);
    }

    [Fact]
    public void WorldBanner_WithoutSubtitle_RendersNoSubtitleLine()
    {
        var cut = Render<WorldBanner>(p => p.Add(x => x.Page, "offline").Add(x => x.Title, "Offline"));

        Assert.Empty(cut.FindAll(".world-banner-subtitle"));
    }
}
