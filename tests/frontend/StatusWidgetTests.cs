using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class StatusWidgetTests : BunitContext
{
    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void StatusWidget_RendersNothing_WhenTheBackendIsOnline()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}"""));

        var cut = Render<StatusWidget>();

        Assert.Equal("", cut.Markup.Trim());
    }

    [Fact]
    public void StatusWidget_ShowsAnAlert_WhenTheBackendIsUnreachable()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":false,"error":{"code":"INTERNAL","message":"Boom"}}"""));

        var cut = Render<StatusWidget>();

        var alert = cut.Find("[role=alert]");
        Assert.Contains("Der Server ist gerade nicht erreichbar", alert.TextContent);
    }
}
