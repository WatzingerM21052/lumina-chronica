using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class RegisterPageTests : BunitContext
{
    private static void RegisterAuthServices(BunitContext context)
    {
        context.Services.AddSingleton<TokenStore>();
        context.Services.AddSingleton<LuminaAuthStateProvider>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void Register_RendersAllFormFields()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"unused"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Register>();

        Assert.NotNull(cut.Find("#username"));
        Assert.NotNull(cut.Find("#email"));
        Assert.NotNull(cut.Find("#password"));
        Assert.NotNull(cut.Find("#confirmPassword"));
        Assert.NotNull(cut.Find("button[type=submit]"));
    }

    [Fact]
    public void Register_MismatchedPasswords_ShowsErrorWithoutCallingApi()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"unused","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Register>();
        cut.Find("#username").Change("alice");
        cut.Find("#email").Change("alice@example.com");
        cut.Find("#password").Change("correct horse");
        cut.Find("#confirmPassword").Change("does not match");
        cut.Find("form").Submit();

        Assert.Contains("Die Passwörter stimmen nicht überein.", cut.Markup);
    }

    [Fact]
    public void Register_FailedSubmit_ShowsErrorMessageFromApi()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"EMAIL_TAKEN","message":"This email is already registered."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Register>();
        cut.Find("#username").Change("alice");
        cut.Find("#email").Change("alice@example.com");
        cut.Find("#password").Change("correct horse");
        cut.Find("#confirmPassword").Change("correct horse");
        cut.Find("form").Submit();

        Assert.Contains("This email is already registered.", cut.Markup);
    }

    [Fact]
    public void Register_DeletedAccountFound_ShowsRestoreOrNewChoice()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"DELETED_ACCOUNT_FOUND","message":"A deleted account exists with this email. Restore it, or confirm you want a new one."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Register>();
        cut.Find("#username").Change("alice");
        cut.Find("#email").Change("alice@example.com");
        cut.Find("#password").Change("correct horse");
        cut.Find("#confirmPassword").Change("correct horse");
        cut.Find("form").Submit();

        Assert.NotNull(cut.Find("#restoreDeletedAccount"));
        Assert.NotNull(cut.Find("#createNewAccountAnyway"));
    }

    [Fact]
    public void Register_RendersInEnglish_WhenLanguageIsEnglish()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"unused","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<II18nService>(new FakeI18nService("en"));

        var cut = Render<Register>();

        Assert.Equal("Register", cut.Find("h1").TextContent);
        Assert.Contains("Create Account", cut.Markup);
        Assert.DoesNotContain("Registrieren", cut.Markup);
    }
}
