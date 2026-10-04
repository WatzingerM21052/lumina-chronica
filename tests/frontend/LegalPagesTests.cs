using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// Datenschutz and Nutzungsbedingungen (point 9, 2026-10-04): reachable
// logged out, every section's text present (no missing i18n key), the
// decisions they state in place.
public class LegalPagesTests : BunitContext
{
    public LegalPagesTests()
    {
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Theory]
    [InlineData(typeof(Privacy))]
    [InlineData(typeof(Terms))]
    public void LegalPage_IsReachableLoggedOut(Type page)
    {
        Assert.Empty(page.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true));
    }

    [Fact]
    public void Privacy_RendersEverySection_WithItsContentsLink()
    {
        var cut = Render<Privacy>();

        Assert.DoesNotContain("⚠️", cut.Markup);
        var sections = cut.FindAll(".legal-section");
        Assert.Equal(15, sections.Count);
        Assert.Equal(sections.Count, cut.FindAll(".legal-toc a").Count);
        Assert.Equal("datenschutz#privacy-retention", cut.FindAll(".legal-toc a")[11].GetAttribute("href"));
        Assert.Equal("privacy-retention", sections[11].Id);
    }

    [Fact]
    public void Privacy_StatesTheRestoreWindow_TheViewCounter_AndTheContact()
    {
        var cut = Render<Privacy>();

        Assert.Contains("90 Tage", cut.Find("#privacy-retention").TextContent);
        Assert.Contains("nur die Zahl selbst", cut.Find("#privacy-views").TextContent);
        Assert.Equal("mailto:luminachronica@gmx.at", cut.Find("#privacy-rights a[href^='mailto:']").GetAttribute("href"));
    }

    [Fact]
    public void Terms_RendersEverySection_WithTheCopyrightRuleAndAReportAddress()
    {
        var cut = Render<Terms>();

        Assert.DoesNotContain("⚠️", cut.Markup);
        Assert.Equal(10, cut.FindAll(".legal-section").Count);
        Assert.Contains("gemeinfrei", cut.Find("#terms-copyright").TextContent);
        Assert.Equal("mailto:luminachronica@gmx.at", cut.Find("#terms-report a[href^='mailto:']").GetAttribute("href"));
        Assert.Equal(new[] { "datenschutz", "impressum" }, cut.FindAll(".legal-related a").Select(a => a.GetAttribute("href")));
    }

    [Fact]
    public void Terms_ReportSection_ReadsIntroThenListThenClosingSentence()
    {
        var cut = Render<Terms>();

        var children = cut.Find("#terms-report").Children.Select(c => c.TagName).ToArray();
        Assert.Equal(new[] { "H2", "P", "UL", "P", "P" }, children);
        Assert.StartsWith("Wir sehen uns jede Meldung an", cut.Find("#terms-report ul + p").TextContent);
    }
}
