using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace LuminaChronica.Client.Tests;

// ResetPassword.razor is now a thin shell (D14) that parses "?token=" and
// renders PasswordResetDialog with LinkToken set -- the real form/state-
// machine behavior is covered by DialogTests.cs and (once it exists)
// PasswordResetDialogTests.cs. These tests only cover what's left of this
// page itself: it extracts the token correctly, opens the dialog at the
// right step for whether one is present, and closing it navigates home.
public class ResetPasswordPageTests : BunitContext
{
    // PasswordResetDialog injects TimeProvider for its debounces and timers.
    private readonly FakeTimeProvider _timeProvider = new();

    public ResetPasswordPageTests()
    {
        Services.AddSingleton<TimeProvider>(_timeProvider);
    }

    private void RegisterServices(HttpMessageHandler handler)
    {
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<ToastService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void ResetPassword_WithToken_OpensTheDialogAtPasswordEntry()
    {
        RegisterServices(new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt","userId":1}}"""));
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();

        Assert.NotNull(cut.Find("#passwordResetNewPassword"));
        Assert.NotNull(cut.Find("#passwordResetConfirmPassword"));
    }

    [Fact]
    public void ResetPassword_WithoutToken_OpensTheDialogAtIdentify()
    {
        // No "invalid link" dead end anymore (§4.1/D14) -- a tokenless
        // visit to this route just opens the same dialog fresh, as if it
        // were /forgot-password.
        RegisterServices(new FakeHttpMessageHandler("""{"success":true}"""));

        var cut = Render<ResetPassword>();

        Assert.NotNull(cut.Find("#passwordResetIdentifier"));
        Assert.Empty(cut.FindAll("#passwordResetNewPassword"));
    }

    [Fact]
    public void ResetPassword_OnSuccess_LogsInAndNavigatesHome()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt-value","userId":1}}""");
        RegisterServices(handler);
        var navManager = Services.GetRequiredService<NavigationManager>();
        navManager.NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();
        cut.Find("#passwordResetNewPassword").Input("new password");
        cut.Find("#passwordResetConfirmPassword").Input("new password");
        cut.Find("button.btn-primary").Click();

        // The success step's own auto-close (3s) or its "Weiter zur
        // Bibliothek" button both funnel through PasswordResetDialog's
        // CloseAsync -> OnClose -> this page's NavigateTo(""). Click the
        // button directly rather than waiting out the timer -- wait for
        // the step transition to actually land first, since the button at
        // this same selector was "Passwort setzen" a moment ago.
        cut.WaitForAssertion(() => Assert.Empty(cut.FindAll("#passwordResetNewPassword")));
        cut.Find("button.btn-primary").Click();

        cut.WaitForAssertion(() => Assert.Equal(navManager.BaseUri, navManager.Uri));
    }

    [Fact]
    public void ResetPassword_Submit_SendsTheUrlTokenInTheRequestBody()
    {
        // Confirms the token extracted from the "?token=" query string is
        // the same value that ends up in the POST body, not e.g. a stale
        // or re-parsed value. Same capture pattern as SettingsPageTests.cs's
        // Settings_PasswordResetButton_SendsRequestWithOwnEmail.
        HttpRequestMessage? postRequest = null;
        string? postBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                postRequest = r;
                postBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"token":"jwt","userId":1}}""");
            });
        RegisterServices(handler);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=some-specific-token-value");

        var cut = Render<ResetPassword>();
        cut.Find("#passwordResetNewPassword").Input("new password");
        cut.Find("#passwordResetConfirmPassword").Input("new password");
        cut.Find("button.btn-primary").Click();

        Assert.NotNull(postRequest);
        Assert.EndsWith("/reset-password", postRequest!.RequestUri!.AbsolutePath);
        Assert.Contains("\"token\":\"some-specific-token-value\"", postBody);
    }

    [Fact]
    public void ResetPassword_OnInvalidTokenError_DropsBackToIdentify()
    {
        // The only legitimate backwards transition (§4.5) -- but a link
        // token with no identifier on file has nothing for CodeEntry to
        // work with, so it drops back to Identify instead (a deliberate
        // corner the design doc's own diagram doesn't cover explicitly).
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_RESET_TOKEN","message":"This reset link is invalid or has expired."}}""");
        RegisterServices(handler);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=expired-token");

        var cut = Render<ResetPassword>();
        cut.Find("#passwordResetNewPassword").Input("new password");
        cut.Find("#passwordResetConfirmPassword").Input("new password");
        cut.Find("button.btn-primary").Click();

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetIdentifier")));
    }
}
