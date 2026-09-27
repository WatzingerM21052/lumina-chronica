using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace LuminaChronica.Client.Tests;

// ForgotPassword.razor is now a thin shell (D14) that just renders
// PasswordResetDialog IsOpen="true" -- the real form/state-machine
// behavior is covered by DialogTests.cs and (once it exists)
// PasswordResetDialogTests.cs. These tests only cover what's left of this
// page itself: it opens the dialog at the right step, and closing it
// navigates home.
public class ForgotPasswordPageTests : BunitContext
{
    // PasswordResetDialog injects TimeProvider for its debounces and timers.
    private readonly FakeTimeProvider _timeProvider = new();

    public ForgotPasswordPageTests()
    {
        Services.AddSingleton<TimeProvider>(_timeProvider);
    }

    private static void RegisterServices(BunitContext context, FakeHttpMessageHandler handler)
    {
        context.Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        context.Services.AddSingleton<ApiClient>();
        context.Services.AddSingleton<TokenStore>();
        context.Services.AddSingleton<LuminaAuthStateProvider>();
        context.Services.AddSingleton<ToastService>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
        context.JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void ForgotPassword_OpensTheDialogAtIdentify()
    {
        RegisterServices(this, new FakeHttpMessageHandler("""{"success":true}"""));

        var cut = Render<ForgotPassword>();

        Assert.NotNull(cut.Find("#passwordResetIdentifier"));
    }

    [Fact]
    public void ForgotPassword_ClosingTheDialog_NavigatesHome()
    {
        RegisterServices(this, new FakeHttpMessageHandler("""{"success":true}"""));
        var navManager = Services.GetRequiredService<Microsoft.AspNetCore.Components.NavigationManager>();
        navManager.NavigateTo("forgot-password");

        var cut = Render<ForgotPassword>();
        cut.Find(".dialog-overlay").MouseDown();
        cut.Find(".dialog-overlay").Click();

        Assert.Equal(navManager.BaseUri, navManager.Uri);
    }
}
