using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class PublicProfilePageTests : BunitContext
{
    private const string ProfileWithContentJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"books":[{"id":1,"title":"Public Book","author":"Jane Doe","description":null,"coverUrl":null,"genre":null,"language":null}],"projects":[{"id":2,"title":"Public World","description":null,"type":"WORLD","coverUrl":null}]}}""";

    private const string EmptyProfileJson =
        """{"success":true,"data":{"username":"alice","avatarUrl":null,"books":[],"projects":[]}}""";

    private RoutedFakeHttpMessageHandler UseRoutes(string profileJson)
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/public", profileJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
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

        var cut = Render<PublicProfile>(parameters => parameters.Add(p => p.Username, "nobody"));

        Assert.Contains("existiert nicht", cut.Markup);
    }

    [Fact]
    public void PublicProfile_HasNoAuthorizeAttribute()
    {
        // Regression coverage, same reasoning as ImpressumPageTests: this
        // page must be reachable while logged out (Community Phase 1, issue
        // #300). bUnit's Render<T> bypasses AuthorizeRouteView entirely, so
        // it would NOT catch an [Authorize] attribute added by mistake --
        // check the attribute directly.
        var hasAuthorizeAttribute = typeof(PublicProfile).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).Length > 0;

        Assert.False(hasAuthorizeAttribute);
    }
}
