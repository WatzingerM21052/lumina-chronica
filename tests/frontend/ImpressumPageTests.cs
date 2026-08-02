using Bunit;
using LuminaChronica.Client.Pages;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ImpressumPageTests : BunitContext
{
    [Fact]
    public void Impressum_RendersWithoutThrowing_AndShowsHeading()
    {
        var cut = Render<Impressum>();

        Assert.Contains("Impressum", cut.Markup);
        Assert.Contains("Angaben gemäß § 5 TMG", cut.Markup);
    }

    [Fact]
    public void Impressum_HasNoAuthorizeAttribute()
    {
        // Regression coverage: this page must be reachable while logged out
        // (a real German Impressum has to be, and it's the entry point to
        // the secret Bible page's easter egg). bUnit's Render<T> bypasses
        // AuthorizeRouteView entirely, so it would NOT catch an [Authorize]
        // attribute being added by mistake -- check the attribute directly.
        var hasAuthorizeAttribute = typeof(Impressum).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).Length > 0;

        Assert.False(hasAuthorizeAttribute);
    }
}
