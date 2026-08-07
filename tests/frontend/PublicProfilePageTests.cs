using Bunit;
using Bunit.TestDoubles;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class PublicProfilePageTests : BunitContext
{
    // <AuthorizeView> (Community Phase 2, issue #304) needs bUnit's
    // authorization test-double wiring, not just a plain
    // AuthenticationStateProvider -- AddAuthorization() registers a
    // BunitAuthorizationContext + CascadingAuthenticationState in the render
    // tree; SetAuthorized/SetNotAuthorized then drive its state.
    private void SetAuthenticated(bool authenticated, string username = "")
    {
        var authContext = AddAuthorization();
        if (authenticated)
        {
            authContext.SetAuthorized(username, AuthorizationState.Authorized);
        }
        else
        {
            authContext.SetNotAuthorized();
        }
    }

    private const string ProfileWithContentJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[{"id":1,"title":"Public Book","author":"Jane Doe","description":null,"coverUrl":null,"genre":null,"language":null}],"projects":[{"id":2,"title":"Public World","description":null,"type":"WORLD","coverUrl":null}]}}""";

    private const string EmptyProfileJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":false,"books":[],"projects":[]}}""";

    private const string NotFollowingProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":3,"followingCount":1,"isFollowing":false,"isOwnProfile":false,"books":[],"projects":[]}}""";

    private const string FollowingProfileJson =
        """{"success":true,"data":{"username":"bob","avatarUrl":null,"followerCount":4,"followingCount":1,"isFollowing":true,"isOwnProfile":false,"books":[],"projects":[]}}""";

    private const string OwnProfileJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"followerCount":0,"followingCount":0,"isFollowing":false,"isOwnProfile":true,"books":[],"projects":[]}}""";

    // Every test renders <AuthorizeView> (Community Phase 2, issue #304) --
    // SetAuthenticated(false) is still required even for the "logged out"
    // tests below, since AuthorizeView needs IAuthorizationPolicyProvider
    // registered regardless of which branch it ends up rendering.
    private RoutedFakeHttpMessageHandler UseRoutes(string profileJson)
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", profileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(false);
        return handler;
    }

    [Fact]
    public void PublicProfile_RendersUsernameAndBooksAndProjects()
    {
        UseRoutes(ProfileWithContentJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.Contains("alice", cut.Markup);
        Assert.Contains("Public Book", cut.Markup);
        Assert.Contains("Jane Doe", cut.Markup);
        Assert.Contains("Public World", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsEmptyStateMessages_WhenNoPublicContent()
    {
        UseRoutes(EmptyProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.Contains("noch keine öffentlichen Bücher", cut.Markup);
        Assert.Contains("noch keine öffentlichen Projekte", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsNotFoundMessage_WhenUserDoesNotExist()
    {
        var handler = new RoutedFakeHttpMessageHandler().When(
            r => r.RequestUri!.AbsolutePath.EndsWith("/public"),
            _ => new HttpResponseMessage(System.Net.HttpStatusCode.NotFound));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(false);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "nobody"));

        Assert.Contains("existiert nicht", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsFollowerAndFollowingCounts()
    {
        UseRoutes(NotFollowingProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.Contains("3", cut.Markup);
        Assert.Contains("Follower", cut.Markup);
        Assert.Contains("1", cut.Markup);
        Assert.Contains("Folgt", cut.Markup);
    }

    [Fact]
    public void PublicProfile_HidesFollowButton_WhenLoggedOut()
    {
        UseRoutes(NotFollowingProfileJson);

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        Assert.DoesNotContain("Folgen", cut.Markup);
    }

    [Fact]
    public void PublicProfile_HidesFollowButton_OnOwnProfile()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", OwnProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "alice"));

        Assert.DoesNotContain("Folgen", cut.Markup);
    }

    [Fact]
    public void PublicProfile_ShowsFollowButton_WhenLoggedInAndNotFollowing()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", NotFollowingProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var button = cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen");
        Assert.Equal("Folgen", button.TextContent.Trim());
    }

    [Fact]
    public void PublicProfile_ShowsEntfolgen_WhenAlreadyFollowing()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", FollowingProfileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));

        var button = cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen");
        Assert.Equal("Entfolgen", button.TextContent.Trim());
    }

    [Fact]
    public void PublicProfile_ClickingFollow_SendsPostAndFlipsToEntfolgen()
    {
        HttpRequestMessage? followRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/public", NotFollowingProfileJson)
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                followRequest = r;
                return new HttpResponseMessage(System.Net.HttpStatusCode.NoContent);
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        SetAuthenticated(true, "alice");

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "bob"));
        cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen").Click();

        Assert.Equal(HttpMethod.Post, followRequest?.Method);
        Assert.Equal("/api/users/bob/follow", followRequest?.RequestUri?.AbsolutePath);
        Assert.Equal("Entfolgen", cut.FindAll("button").Single(b => b.TextContent.Trim() is "Folgen" or "Entfolgen").TextContent.Trim());
    }

    [Fact]
    public void PublicProfile_HasNoAuthorizeAttribute()
    {
        // Regression coverage, same reasoning as ImpressumPageTests: this
        // page must be reachable while logged out (Community Phase 1, issue
        // #300). bUnit's Render<T> bypasses AuthorizeRouteView entirely, so
        // it would NOT catch an [Authorize] attribute being added by mistake
        // -- check the attribute directly.
        var hasAuthorizeAttribute = typeof(PublicProfile).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).Length > 0;

        Assert.False(hasAuthorizeAttribute);
    }
}
