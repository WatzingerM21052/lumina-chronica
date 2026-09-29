using Bunit;
using Bunit.TestDoubles;
using LuminaChronica.Client.Layouts;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// NavMenu wraps its <NavLink> list in <AuthorizeView> so the whole nav
// (Home/Bibliothek/Projekte/Entdecken/Statistik/Offline/Einstellungen)
// disappears while logged out -- MainLayout's own separate <AuthorizeView>
// still shows "Anmelden"/"Profil" independently of this component, so no
// <NotAuthorized> branch is needed here.
public class NavMenuTests : BunitContext
{
    private void SetAuthenticated(bool authenticated)
    {
        var authContext = AddAuthorization();
        if (authenticated)
        {
            authContext.SetAuthorized("alice", AuthorizationState.Authorized);
        }
        else
        {
            authContext.SetNotAuthorized();
        }
    }

    [Fact]
    public void NavMenu_Authenticated_RendersAllSixLinks_SettingsLiveInTheAccountMenu()
    {
        Services.AddSingleton<II18nService, FakeI18nService>();
        SetAuthenticated(true);

        var cut = Render<NavMenu>();

        Assert.Equal(6, cut.FindAll("nav.nav-menu a").Count);
        Assert.DoesNotContain(cut.FindAll("nav.nav-menu a"), a => a.GetAttribute("href") == "settings");
    }

    [Fact]
    public void NavMenu_NotAuthenticated_RendersNoLinks()
    {
        Services.AddSingleton<II18nService, FakeI18nService>();
        SetAuthenticated(false);

        var cut = Render<NavMenu>();

        Assert.Empty(cut.FindAll("nav.nav-menu a"));
    }
}
