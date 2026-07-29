using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfDetailPageTests : BunitContext
{
    private const string ShelfJson = """{"success":true,"data":{"id":1,"name":"Fantasy Sammlung","description":"Meine liebsten Bücher","coverUrl":null,"visibility":"PRIVATE","bookCount":1,"createdAt":"2026-01-01"}}""";

    private const string ShelfBooksJson = """
        {"success":true,"data":{"items":[
            {"id":5,"title":"The Hobbit","author":"J.R.R. Tolkien","coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}
        ],"total":1,"page":1,"pageSize":20}}
        """;

    private RoutedFakeHttpMessageHandler UseDefaultRoutes()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/books", ShelfBooksJson)
            .WhenPathEndsWith("/shelves/1", ShelfJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        return handler;
    }

    [Fact]
    public void ShelfDetail_RendersNameDescriptionAndBooks()
    {
        UseDefaultRoutes();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Fantasy Sammlung", cut.Markup);
        Assert.Contains("Meine liebsten Bücher", cut.Markup);
        Assert.Contains("The Hobbit", cut.Markup);
    }

    [Fact]
    public void ShelfDetail_RemoveButton_CallsRemoveEndpoint()
    {
        HttpRequestMessage? capturedRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, r =>
            {
                capturedRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("{}");
            })
            .WhenPathEndsWith("/books", ShelfBooksJson)
            .WhenPathEndsWith("/shelves/1", ShelfJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("button.shelf-book-remove").Click();

        Assert.Equal(HttpMethod.Delete, capturedRequest?.Method);
        Assert.Equal("/api/shelves/1/books/5", capturedRequest?.RequestUri?.AbsolutePath);
    }
}
