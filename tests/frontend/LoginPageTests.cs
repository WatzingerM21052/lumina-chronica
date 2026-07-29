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
    }

    [Fact]
    public void Login_RendersEmailAndPasswordFields()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Email or password is incorrect."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();

        Assert.NotNull(cut.Find("#email"));
        Assert.NotNull(cut.Find("#password"));
        Assert.NotNull(cut.Find("button[type=submit]"));
    }

    [Fact]
    public void Login_FailedSubmit_ShowsErrorMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"Email or password is incorrect."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();
        cut.Find("#email").Change("nobody@example.com");
        cut.Find("#password").Change("wrong password");
        cut.Find("form").Submit();

        Assert.Contains("Email or password is incorrect.", cut.Markup);
    }
}
