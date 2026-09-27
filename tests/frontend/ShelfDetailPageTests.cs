using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfDetailPageTests : BunitContext
{
    public ShelfDetailPageTests()
    {
        // The ConfirmDialog now renders on the Dialog primitive, which
        // imports ./js/dialog.js for scroll-lock in OnAfterRenderAsync --
        // none of these tests are about that interop itself.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

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
        Services.AddSingleton<II18nService, FakeI18nService>();
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
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("button.shelf-book-remove").Click();

        Assert.Equal(HttpMethod.Delete, capturedRequest?.Method);
        Assert.Equal("/api/shelves/1/books/5", capturedRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void ShelfDetail_DeleteButton_OpensConfirmDialog()
    {
        UseDefaultRoutes();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Regal wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void ShelfDetail_EditButton_OpensDialogWithoutHidingShelfContent()
    {
        UseDefaultRoutes();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();

        // The old behaviour replaced the whole page with the edit form; the
        // Dialog fix (Phase 4 item 20) keeps the shelf's own heading and
        // description on screen behind the dialog instead of swapping them out.
        Assert.Contains("Fantasy Sammlung", cut.Markup);
        Assert.Contains("Meine liebsten Bücher", cut.Markup);
        Assert.NotNull(cut.Find("#shelf-edit-name"));
    }

    [Fact]
    public void ShelfDetail_EditDialog_SaveAsync_SendsUpdateAndClosesDialog()
    {
        HttpRequestMessage? putRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(
                    """{"success":true,"data":{"id":1,"name":"Umbenanntes Regal","description":"Meine liebsten Bücher","coverUrl":null,"visibility":"PRIVATE","bookCount":1,"createdAt":"2026-01-01"}}""");
            })
            .WhenPathEndsWith("/books", ShelfBooksJson)
            .WhenPathEndsWith("/shelves/1", ShelfJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Bearbeiten").Click();
        cut.Find("#shelf-edit-name").Change("Umbenanntes Regal");
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, putRequest?.Method);
        Assert.Equal("/api/shelves/1", putRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("Umbenanntes Regal", cut.Markup);
    }

    [Fact]
    public void ShelfDetail_ConfirmDialog_Confirm_DeletesTheShelfItself()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete && r.RequestUri!.AbsolutePath == "/api/shelves/1", r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}""");
            })
            .WhenPathEndsWith("/books", ShelfBooksJson)
            .WhenPathEndsWith("/shelves/1", ShelfJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<ShelfDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
    }
}
