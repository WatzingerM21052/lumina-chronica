using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LoginPageTests : BunitContext
{
    private static void RegisterAuthServices(BunitContext context)
    {
        context.Services.AddSingleton<TokenStore>();
        context.Services.AddSingleton<LuminaAuthStateProvider>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void Login_RendersIdentifierAndPasswordFields()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Username/email or password is incorrect."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();

        Assert.NotNull(cut.Find("#identifier"));
        Assert.NotNull(cut.Find("#password"));
        Assert.NotNull(cut.Find("button[type=submit]"));
    }

    [Fact]
    public void Login_RendersOAuthButtons_PointingAtBackendOrigin()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Username/email or password is incorrect."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();

        var links = cut.FindAll("a.btn-oauth");
        Assert.Equal(2, links.Count);
        Assert.Contains(links, a => a.GetAttribute("href")!.EndsWith("/api/auth/oauth/google/start"));
        Assert.Contains(links, a => a.GetAttribute("href")!.EndsWith("/api/auth/oauth/github/start"));
    }

    [Fact]
    public void Login_FailedSubmit_ShowsErrorMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Username/email or password is incorrect."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();
        cut.Find("#identifier").Change("nobody");
        cut.Find("#password").Change("wrong password");
        cut.Find("form").Submit();

        Assert.Contains("Username/email or password is incorrect.", cut.Markup);
    }

    [Fact]
    public void Login_RendersInEnglish_WhenLanguageIsEnglish()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"unused"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<II18nService>(new FakeI18nService("en"));

        var cut = Render<Login>();

        Assert.Equal("Sign In", cut.Find("h1").TextContent);
        Assert.Contains("Email or Username", cut.Markup);
        Assert.DoesNotContain("Anmelden", cut.Markup);
    }

    [Fact]
    public void Login_RendersForgotPasswordLink()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"unused"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();

        var link = cut.Find("a[href='forgot-password']");
        Assert.Equal("Passwort vergessen?", link.TextContent);
    }
}
