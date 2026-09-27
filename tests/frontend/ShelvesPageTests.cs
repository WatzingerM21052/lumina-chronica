using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelvesPageTests : BunitContext
{
    public ShelvesPageTests()
    {
        // The create form renders inside the Dialog primitive, which imports
        // ./js/dialog.js for scroll-lock -- not what these tests are about.
        JSInterop.Mode = JSRuntimeMode.Loose;

        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
    }

    [Fact]
    public void Shelves_CreateDialog_Escape_WithTypedName_AsksBeforeDiscarding()
    {
        var cut = Render<Shelves>();
        cut.Find("button.btn-primary").Click();
        cut.Find("#shelf-name").Change("Halb getippt");
        cut.Find("#shelf-create-form").Closest(".dialog")!.KeyDown(new Microsoft.AspNetCore.Components.Web.KeyboardEventArgs { Key = "Escape" });

        Assert.Contains("Ungespeicherte Änderungen verwerfen?", cut.Markup);
        Assert.NotNull(cut.Find("#shelf-name"));
    }

    [Fact]
    public void Shelves_CreateDialog_ReopenedAfterDiscarding_StartsEmpty()
    {
        var cut = Render<Shelves>();
        cut.Find("button.btn-primary").Click();
        cut.Find("#shelf-name").Change("Halb getippt");
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Verwerfen").Click();

        cut.Find("button.btn-primary").Click();
        Assert.Equal("", ((AngleSharp.Html.Dom.IHtmlInputElement)cut.Find("#shelf-name")).Value);
    }
}
