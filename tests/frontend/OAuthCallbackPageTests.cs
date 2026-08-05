using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class OAuthCallbackPageTests : BunitContext
{
    private static void RegisterAuthServices(BunitContext context)
    {
        context.Services.AddSingleton<TokenStore>();
        context.Services.AddSingleton<LuminaAuthStateProvider>();
    }

    [Fact]
    public void OAuthCallback_WithErrorQueryParam_ShowsFriendlyMessage_NoExchangeCall()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"SHOULD_NOT_BE_CALLED","message":"x"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("oauth-callback?error=invalid_state");

        var cut = Render<OAuthCallback>();

        Assert.Contains("abgelaufen", cut.Markup);
        Assert.Contains("Zurück zur Anmeldung", cut.Markup);
    }

    [Fact]
    public void OAuthCallback_WithValidCode_LogsInAndRedirectsHome()
    {
        // Loose mode: a successful exchange calls MarkUserAsAuthenticatedAsync,
        // which lazy-imports js/auth.js via TokenStore -- unrelated to what
        // this test actually verifies (that OAuthCallback reacts correctly to
        // a successful exchange response), same pattern as BiblePageTests.
        JSInterop.Mode = JSRuntimeMode.Loose;

        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"a.b.c","userId":7}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        var navManager = Services.GetRequiredService<NavigationManager>();
        navManager.NavigateTo("oauth-callback?code=some-exchange-code");

        Render<OAuthCallback>();

        Assert.Equal(navManager.BaseUri, navManager.Uri);
    }

    [Fact]
    public void OAuthCallback_WithInvalidOrExpiredCode_ShowsFriendlyMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CODE","message":"This sign-in link has expired or was already used."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("oauth-callback?code=stale-code");

        var cut = Render<OAuthCallback>();

        Assert.Contains("abgelaufen", cut.Markup);
    }

    [Fact]
    public void OAuthCallback_WithNoQueryParams_ShowsFriendlyMessage_NoExchangeCall()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"SHOULD_NOT_BE_CALLED","message":"x"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("oauth-callback");

        var cut = Render<OAuthCallback>();

        Assert.Contains("Zurück zur Anmeldung", cut.Markup);
    }
}
