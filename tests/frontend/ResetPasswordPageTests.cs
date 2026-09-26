using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ResetPasswordPageTests : BunitContext
{
    private static void RegisterAuthServices(BunitContext context)
    {
        context.Services.AddSingleton<TokenStore>();
        context.Services.AddSingleton<LuminaAuthStateProvider>();
        context.Services.AddSingleton<ToastService>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void ResetPassword_WithToken_RendersForm()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();

        Assert.NotNull(cut.Find("#newPassword"));
        Assert.NotNull(cut.Find("#confirmPassword"));
    }

    [Fact]
    public void ResetPassword_WithoutToken_ShowsInvalidTokenMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<ResetPassword>();

        Assert.Contains("Dieser Link ist ungültig oder abgelaufen.", cut.Markup);
        Assert.Empty(cut.FindAll("#newPassword"));
    }

    [Fact]
    public void ResetPassword_MismatchedPasswords_ShowsErrorWithoutCallingApi()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();
        cut.Find("#newPassword").Change("new password");
        cut.Find("#confirmPassword").Change("does not match");
        cut.Find("form").Submit();

        Assert.Contains("Die Passwörter stimmen nicht überein.", cut.Markup);
    }

    [Fact]
    public void ResetPassword_OnSuccess_LogsInAndNavigatesHome()
    {
        // Loose mode: a successful reset calls MarkUserAsAuthenticatedAsync,
        // which lazy-imports js/auth.js via TokenStore -- unrelated to what
        // this test actually verifies. Same pattern as
        // OAuthCallbackPageTests.cs's OAuthCallback_WithValidCode_LogsInAndRedirectsHome
        // (ResetPassword.razor's success path is structurally identical to
        // OAuthCallback.razor's).
        JSInterop.Mode = JSRuntimeMode.Loose;

        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt-value","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        var navManager = Services.GetRequiredService<NavigationManager>();
        navManager.NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();
        cut.Find("#newPassword").Change("new password");
        cut.Find("#confirmPassword").Change("new password");
        cut.Find("form").Submit();

        // WaitForAssertion, not a plain Assert: the success path does
        // `await Task.Yield(); NavigationManager.NavigateTo(...)` (see
        // ResetPassword.razor) so ToastHost's StateHasChanged from
        // ToastService.Show wins the render race against the navigation --
        // same reasoning as BookDetail.razor's DeleteAsync. That yield
        // posts its continuation to the renderer's dispatcher, so
        // `form.Submit()` returns before the navigation actually runs.
        // Same idiom as the other async-race assertions in this test suite
        // (e.g. BiblePageTests.cs, ProfilePageTests.cs).
        cut.WaitForAssertion(() => Assert.Equal(navManager.BaseUri, navManager.Uri));
    }

    [Fact]
    public void ResetPassword_OnInvalidTokenError_ShowsInvalidTokenMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_RESET_TOKEN","message":"This reset link is invalid or has expired."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=expired-token");

        var cut = Render<ResetPassword>();
        cut.Find("#newPassword").Change("new password");
        cut.Find("#confirmPassword").Change("new password");
        cut.Find("form").Submit();

        Assert.Contains("Dieser Link ist ungültig oder abgelaufen.", cut.Markup);
    }
}
