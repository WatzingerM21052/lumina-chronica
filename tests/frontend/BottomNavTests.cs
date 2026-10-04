using Bunit;
using LuminaChronica.Client.Layouts;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// Phone navigation (UI/UX plan B2). Visibility by breakpoint is pure CSS,
// so these tests cover what the markup promises: four destinations plus
// "Mehr", and a bottom sheet with the rest.
public class BottomNavTests : BunitContext
{
    public BottomNavTests()
    {
        // The "Mehr" sheet is a Dialog, which imports ./js/dialog.js.
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void BottomNav_ShowsFourDestinationsAndMore()
    {
        var cut = Render<BottomNav>();

        var labels = cut.FindAll("nav.bottom-nav .bottom-nav-item").Select(e => e.TextContent.Trim()).ToList();
        Assert.Equal(new[] { "Home", "Bibliothek", "Projekte", "Entdecken", "Mehr" }, labels);
        Assert.Equal("Hauptnavigation", cut.Find("nav.bottom-nav").GetAttribute("aria-label"));
    }

    [Fact]
    public void BottomNav_More_OpensASheetWithTheRemainingPages()
    {
        var cut = Render<BottomNav>();
        Assert.Empty(cut.FindAll(".dialog"));
        Assert.Equal("false", cut.Find("#bottom-nav-more").GetAttribute("aria-expanded"));

        cut.Find("#bottom-nav-more").Click();

        Assert.NotNull(cut.Find(".dialog.dialog--bottomsheet"));
        Assert.Equal("true", cut.Find("#bottom-nav-more").GetAttribute("aria-expanded"));
        var hrefs = cut.FindAll(".bottom-nav-more-list a").Select(a => a.GetAttribute("href")).ToList();
        Assert.Equal(new[] { "statistics", "offline", "impressum", "datenschutz" }, hrefs);
    }

    [Fact]
    public void BottomNav_More_ClosesOnNavigation()
    {
        var cut = Render<BottomNav>();
        cut.Find("#bottom-nav-more").Click();

        Services.GetRequiredService<NavigationManager>().NavigateTo("statistics");

        cut.WaitForAssertion(() => Assert.Empty(cut.FindAll(".dialog")));
    }

    [Fact]
    public void BottomNav_More_IsMarkedActiveOnOneOfItsPages()
    {
        Services.GetRequiredService<NavigationManager>().NavigateTo("statistics");

        var cut = Render<BottomNav>();

        Assert.Contains("active", cut.Find("#bottom-nav-more").GetAttribute("class"));
    }
}
