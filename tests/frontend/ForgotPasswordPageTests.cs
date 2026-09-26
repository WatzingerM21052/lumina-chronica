using System.Net;
using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ForgotPasswordPageTests : BunitContext
{
    private static void RegisterServices(BunitContext context, FakeHttpMessageHandler handler)
    {
        context.Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        context.Services.AddSingleton<ApiClient>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void ForgotPassword_RendersIdentifierField()
    {
        RegisterServices(this, new FakeHttpMessageHandler("""{"success":true}"""));

        var cut = Render<ForgotPassword>();

        Assert.NotNull(cut.Find("#identifier"));
        Assert.NotNull(cut.Find("button[type=submit]"));
    }

    [Fact]
    public void ForgotPassword_OnSubmit_ShowsGenericSuccessMessage()
    {
        RegisterServices(this, new FakeHttpMessageHandler("""{"success":true,"data":{"message":"ok"}}"""));

        var cut = Render<ForgotPassword>();
        cut.Find("#identifier").Change("alice@example.com");
        cut.Find("form").Submit();

        Assert.Contains("Falls ein Konto mit diesen Angaben existiert", cut.Markup);
        Assert.Null(cut.FindAll("#identifier").FirstOrDefault());
    }

    [Fact]
    public void ForgotPassword_OnFailure_ShowsErrorMessage()
    {
        // FakeHttpMessageHandler always returns 200 OK regardless of body,
        // so it can't simulate a failure for ApiClient's bool-returning
        // PostAsync<TRequest> overload (checks IsSuccessStatusCode only,
        // ignores the response body entirely). RoutedFakeHttpMessageHandler
        // with a custom status code is what's actually needed here.
        var handler = new RoutedFakeHttpMessageHandler().When(_ => true, _ => new HttpResponseMessage(HttpStatusCode.TooManyRequests));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();

        var cut = Render<ForgotPassword>();
        cut.Find("#identifier").Change("alice@example.com");
        cut.Find("form").Submit();

        Assert.Contains("Anfrage fehlgeschlagen", cut.Markup);
    }
}
