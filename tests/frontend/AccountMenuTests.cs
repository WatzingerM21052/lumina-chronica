using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// UI/UX plan A8: avatar + name in the top bar open the account menu.
public class AccountMenuTests : BunitContext
{
    private const string MeJson = """{"success":true,"data":{"id":1,"username":"mira","email":"mira@example.test","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01"}}""";
    private int _logoutCalls;

    public AccountMenuTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/api/auth/logout"), _ =>
            {
                _logoutCalls++;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":null}""");
            })
            .WhenPathEndsWith("/api/users/me", MeJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void Closed_ShowsInitialAndName_WithoutThePanel()
    {
        var cut = Render<AccountMenu>();

        cut.WaitForAssertion(() => Assert.Equal("mira", cut.Find(".account-menu-name").TextContent));
        Assert.Equal("M", cut.Find(".account-menu-toggle .account-avatar").TextContent.Trim());
        Assert.Equal("false", cut.Find("#account-menu-button").GetAttribute("aria-expanded"));
        Assert.Empty(cut.FindAll(".account-menu-panel"));
    }

    [Fact]
    public void Open_ShowsIdentity_AndTheFourEntries()
    {
        var cut = Render<AccountMenu>();
        cut.WaitForAssertion(() => Assert.Equal("mira", cut.Find(".account-menu-name").TextContent));

        cut.Find("#account-menu-button").Click();

        cut.WaitForAssertion(() => Assert.Contains("mira@example.test", cut.Find(".account-menu-head").TextContent));
        var hrefs = cut.FindAll(".account-menu-items a").Select(a => a.GetAttribute("href")).ToList();
        Assert.Equal(["u/mira", "settings", "profile"], hrefs);
        Assert.Equal("Abmelden", cut.Find("#account-menu-logout").TextContent.Trim());
    }

    [Fact]
    public void Escape_ClosesTheMenu()
    {
        var cut = Render<AccountMenu>();
        cut.Find("#account-menu-button").Click();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".account-menu-panel")));

        cut.Find(".account-menu").KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.Empty(cut.FindAll(".account-menu-panel"));
    }

    [Fact]
    public void Logout_CallsTheApi_AndGoesHome()
    {
        var cut = Render<AccountMenu>();
        cut.Find("#account-menu-button").Click();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("#account-menu-logout")));

        cut.Find("#account-menu-logout").Click();

        cut.WaitForAssertion(() => Assert.Equal(1, _logoutCalls));
        Assert.Equal("http://localhost/", Services.GetRequiredService<NavigationManager>().Uri);
    }
}
