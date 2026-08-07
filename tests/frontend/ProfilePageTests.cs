using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProfilePageTests : BunitContext
{
    private const string ProfileJson = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01"}}""";

    [Fact]
    public void Profile_PublicProfileLink_HasNoLeadingSlash()
    {
        // Regression coverage: a leading "/" makes the browser treat this as
        // domain-root-relative, bypassing the <base href> rewrite that GitHub
        // Pages project sites need for their subpath -- the exact class of
        // bug already documented for issue #38, caught live for this link
        // during Community Phase 1 (issue #300) verification.
        var handler = new FakeHttpMessageHandler(ProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();

        var cut = Render<Profile>();

        var link = cut.Find("a");
        Assert.Equal("u/alice", link.GetAttribute("href"));
    }
}
