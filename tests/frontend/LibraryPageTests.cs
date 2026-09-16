using System.Globalization;
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
        Services.AddSingleton<CoverColorService>();
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
        Assert.Equal(2, cut.FindAll("a.shelf-book").Count);
    }

    [Fact]
    public void Library_RasterViewMode_RendersBookCardsInAResponsiveGrid()
    {
        UseApiResponse("""
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","coverUrl":null,"genre":"scifi","language":"en","visibility":"PRIVATE","createdAt":"2026-01-01"},
                {"id":2,"title":"The Hobbit","author":"J.R.R. Tolkien","coverUrl":null,"genre":"fantasy","language":"en","visibility":"PRIVATE","createdAt":"2026-01-02"}
            ],"total":2,"page":1,"pageSize":20}}
            """);

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Raster").Click();

        Assert.NotEmpty(cut.FindAll(".library-raster"));
        var cards = cut.FindAll("a.book-card");
        Assert.Equal(2, cards.Count);
        // Normal (not Small) size -- the old list view's compact horizontal
        // BookCard variant is gone now that this is a real grid, not a
        // dense list; the grid gives cards room to show their full cover.
        Assert.All(cards, card => Assert.Contains("book-card-normal", card.ClassList));
    }

    [Fact]
    public void Library_GridViewMode_WrapsShelfRowsInACabinet()
    {
        // Default sort/order on first load ("createdAt"/"desc", no genre or
        // tag filter narrowing to a single group) routes LibraryShelfGrouping
        // into GroupByRecency. One book created today lands in "Diese Woche";
        // one created decades ago lands in "Älter" -- two distinct groups,
        // which is what this test needs to exercise the multi-level cabinet.
        var today = DateTime.UtcNow.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        UseApiResponse("""
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","coverUrl":null,"genre":"scifi","language":"en","visibility":"PRIVATE","createdAt":"__TODAY__"},
                {"id":2,"title":"The Hobbit","author":"J.R.R. Tolkien","coverUrl":null,"genre":"fantasy","language":"en","visibility":"PRIVATE","createdAt":"2000-01-01"}
            ],"total":2,"page":1,"pageSize":20}}
            """.Replace("__TODAY__", today));

        var cut = Render<Library>();

        // Two distinct recency buckets must produce exactly two shelf-row
        // groups on the page, all living inside the one cabinet -- not just
        // "the cabinet contains 2", which would still pass if a stray group
        // ever rendered outside it. Anchoring the document-wide count and
        // then asserting the cabinet-scoped count matches it is what
        // actually proves "every one of them is a descendant of the
        // cabinet".
        var allGroups = cut.FindAll(".shelf-row-group");
        Assert.Equal(2, allGroups.Count);

        var cabinet = cut.Find(".shelf-cabinet");
        var groupsInCabinet = cabinet.QuerySelectorAll(".shelf-row-group");
        Assert.Equal(allGroups.Count, groupsInCabinet.Length);

        // The cabinet's last element child must specifically be a
        // .shelf-row-group -- this guards the ":last-child" CSS rule (see
        // app.css) that rounds only the bottom-most shelf level's lip. If a
        // future change ever appends a non-ShelfRow sibling inside
        // .shelf-cabinet (e.g. decorative set-dressing), this assertion
        // fails loudly instead of silently un-rounding the cabinet's bottom
        // edge.
        Assert.Contains("shelf-row-group", cabinet.Children[^1].ClassList);
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
        Services.AddSingleton<CoverColorService>();

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
        Services.AddSingleton<CoverColorService>();
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
        Services.AddSingleton<CoverColorService>();

        var cut = Render<Library>();
        cut.Find("input[type=checkbox]").Change(true);
        Assert.Contains("favorite=true", capturedRequests[^1].RequestUri?.Query);

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Filter zurücksetzen").Click();

        Assert.DoesNotContain("favorite=true", capturedRequests[^1].RequestUri?.Query);
    }

    [Fact]
    public void Library_SearchInput_AfterDebounce_ShowsSuggestionsAndFiltersResults()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books" && r.RequestUri.Query.Contains("pageSize=8"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"items":[{"id":1,"title":"Killimooin","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}],"total":1,"page":1,"pageSize":8}}"""))
            .When(r => r.RequestUri!.AbsolutePath == "/api/books",
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"items":[{"id":1,"title":"Killimooin","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}],"total":1,"page":1,"pageSize":20}}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();

        var cut = Render<Library>();
        cut.Find("input[type=search]").Input("Killi");

        // Verifies the debounced fetch/filter data flow (correct URLs,
        // correct response parsing). Note: this does NOT catch the
        // "missing StateHasChanged after a Timer-driven InvokeAsync" class
        // of bug that shipped once in this exact code path -- bUnit's test
        // renderer doesn't reproduce that gap the way a real browser does;
        // that one is only caught by live testing.
        cut.WaitForAssertion(() => Assert.Contains("Killimooin", cut.Markup), TimeSpan.FromSeconds(2));
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
        Services.AddSingleton<CoverColorService>();

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Weiter →").Click();

        Assert.Contains("page=2", capturedRequests[^1].RequestUri?.Query);
    }
}
