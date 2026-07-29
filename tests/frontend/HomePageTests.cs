using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class HomePageTests : BunitContext
{
    public HomePageTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"status":"online"}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
    }

    [Fact]
    public void Home_RendersWithoutThrowing_AndShowsWelcomeHeading()
    {
        var cut = Render<Home>();

        Assert.Contains("Willkommen zurück", cut.Markup);
    }

    [Fact]
    public void Home_ShowsEmptyStateForLibrary()
    {
        var cut = Render<Home>();

        Assert.Contains("Deine Bibliothek ist noch leer", cut.Markup);
    }
}
