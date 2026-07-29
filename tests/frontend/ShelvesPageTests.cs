using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelvesPageTests : BunitContext
{
    private void UseApiResponse(string responseJson)
    {
        var handler = new FakeHttpMessageHandler(responseJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    [Fact]
    public void Shelves_ShowsEmptyState_WhenNoShelvesExist()
    {
        UseApiResponse("""{"success":true,"data":[]}""");

        var cut = Render<Shelves>();

        Assert.Contains("Du hast noch keine Regale angelegt", cut.Markup);
    }

    [Fact]
    public void Shelves_RendersShelfCardsFromApiResponse()
    {
        UseApiResponse("""
            {"success":true,"data":[
                {"id":1,"name":"Fantasy Sammlung","description":null,"coverUrl":null,"visibility":"PRIVATE","bookCount":3,"createdAt":"2026-01-01"},
                {"id":2,"name":"Schulbücher","description":null,"coverUrl":null,"visibility":"PRIVATE","bookCount":0,"createdAt":"2026-01-02"}
            ]}
            """);

        var cut = Render<Shelves>();

        Assert.Contains("Fantasy Sammlung", cut.Markup);
        Assert.Contains("Schulbücher", cut.Markup);
        Assert.Equal(2, cut.FindAll("a.shelf-card").Count);
    }

    [Fact]
    public void Shelves_CreateForm_SubmitsNameAndReloadsList()
    {
        HttpRequestMessage? createRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                createRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"name":"Neues Regal","description":null,"coverUrl":null,"visibility":"PRIVATE","bookCount":0,"createdAt":"2026-01-01"}}""");
            })
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Shelves>();
        cut.Find("button.btn-primary").Click(); // "Regal anlegen" toggles the create form
        cut.Find("#shelf-name").Change("Neues Regal");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Post, createRequest?.Method);
        Assert.Equal("/api/shelves", createRequest?.RequestUri?.AbsolutePath);
    }
}
