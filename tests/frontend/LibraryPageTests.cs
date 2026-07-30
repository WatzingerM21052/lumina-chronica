using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
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

    [Fact]
    public void Library_TagMultiSelect_SelectingAPill_ReloadsWithTagInQueryString()
    {
        var capturedRequests = new List<HttpRequestMessage>();
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":["Fantasy","Klassiker"],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books", r =>
            {
                capturedRequests.Add(r);
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}""");
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Tag").Click();
        cut.FindAll(".multiselect-pill").Single(p => p.TextContent.Trim() == "Fantasy").Click();

        Assert.Contains("tag=Fantasy", capturedRequests[^1].RequestUri?.Query);
    }

    [Fact]
    public void Library_ReadsTagFromUrl_OnLoad()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":["Fantasy"],"genres":[]}}""")
            .WhenPathEndsWith("/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.GetRequiredService<NavigationManager>().NavigateTo("library?tag=Fantasy");

        var cut = Render<Library>();

        Assert.Equal("Tag (1)", cut.FindAll("button").Single(b => b.TextContent.Trim().StartsWith("Tag")).TextContent.Trim());
    }

    [Fact]
    public void Library_ClearFiltersButton_ResetsFavoritesOnlyAndReloadsWithoutIt()
    {
        var capturedRequests = new List<HttpRequestMessage>();
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books", r =>
            {
                capturedRequests.Add(r);
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}""");
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Library>();
        cut.Find("input[type=checkbox]").Change(true);
        Assert.Contains("favorite=true", capturedRequests[^1].RequestUri?.Query);

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Filter zurücksetzen").Click();

        Assert.DoesNotContain("favorite=true", capturedRequests[^1].RequestUri?.Query);
    }

    [Fact]
    public void Library_Pager_AppearsWhenMoreBooksThanOnePage_AndWeiterRequestsPage2()
    {
        var capturedRequests = new List<HttpRequestMessage>();
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books", r =>
            {
                capturedRequests.Add(r);
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"items":[{"id":1,"title":"Dune","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}],"total":25,"page":1,"pageSize":20}}""");
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Weiter →").Click();

        Assert.Contains("page=2", capturedRequests[^1].RequestUri?.Query);
    }
}
