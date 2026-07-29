using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryPageTests : BunitContext
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
    public void Library_ShowsEmptyStateWhenNoBooksExist()
    {
        UseApiResponse("""{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}""");

        var cut = Render<Library>();

        Assert.Contains("Deine Bibliothek ist noch leer", cut.Markup);
    }

    [Fact]
    public void Library_RendersBookCardsFromApiResponse()
    {
        UseApiResponse("""
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","coverUrl":null,"genre":"scifi","language":"en","visibility":"PRIVATE","createdAt":"2026-01-01"},
                {"id":2,"title":"The Hobbit","author":"J.R.R. Tolkien","coverUrl":null,"genre":"fantasy","language":"en","visibility":"PRIVATE","createdAt":"2026-01-02"}
            ],"total":2,"page":1,"pageSize":20}}
            """);

        var cut = Render<Library>();

        Assert.Contains("Dune", cut.Markup);
        Assert.Contains("The Hobbit", cut.Markup);
        Assert.Equal(2, cut.FindAll("a.book-card").Count);
    }
}
