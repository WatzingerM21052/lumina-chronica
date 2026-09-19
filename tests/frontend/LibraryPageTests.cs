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
    public void Library_RasterPager_ClickingWeiter_ShowsNextClientSidePage_WithoutANewRequest()
    {
        var books = string.Join(",", Enumerable.Range(1, 25).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}"""));
        var capturedRequests = new List<HttpRequestMessage>();
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books", r =>
            {
                capturedRequests.Add(r);
                return RoutedFakeHttpMessageHandler.JsonResponse($$$"""{"success":true,"data":{"items":[{{{books}}}],"total":25,"page":1,"pageSize":100}}""");
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Raster").Click();

        Assert.Equal(20, cut.FindAll("a.book-card").Count); // default page size, Task 3 makes this configurable
        Assert.Contains("Book 1", cut.Markup);
        Assert.DoesNotContain("Book 21", cut.Markup);

        var requestCountBeforeClick = capturedRequests.Count;
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Weiter →").Click();

        Assert.Equal(5, cut.FindAll("a.book-card").Count); // remaining 5 books on page 2
        Assert.Contains("Book 21", cut.Markup);
        Assert.DoesNotContain("Book 1<", cut.Markup); // page 1's first book is gone from page 2
        Assert.Equal(requestCountBeforeClick, capturedRequests.Count); // no new HTTP request for the page turn
    }

    [Fact]
    public void Library_LoadAllBooksAsync_FetchesEverySubsequentBackendPage_WhenTotalExceedsOneBackendPage()
    {
        var page1Books = string.Join(",", Enumerable.Range(1, 100).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2000-01-01","isFavorite":false}"""));
        var page2Books = string.Join(",", Enumerable.Range(101, 25).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2000-01-01","isFavorite":false}"""));
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books" && r.RequestUri.Query.Contains("page=2"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse($$$"""{"success":true,"data":{"items":[{{{page2Books}}}],"total":125,"page":2,"pageSize":100}}"""))
            .When(r => r.RequestUri!.AbsolutePath == "/api/books",
                _ => RoutedFakeHttpMessageHandler.JsonResponse($$$"""{"success":true,"data":{"items":[{{{page1Books}}}],"total":125,"page":1,"pageSize":100}}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Raster").Click();

        // All 125 must be reachable via client-side raster paging -- proves
        // LoadAllBooksAsync actually followed the second backend page instead
        // of silently stopping at the first 100.
        Assert.Contains("Book 1", cut.Markup);
        Assert.DoesNotContain("Book 125", cut.Markup); // not on page 1 of the raster view yet
        // DefaultRasterPageSize = 20 -> ceil(125/20) = 7 pages total; starting on
        // page 1, reaching page 7 (where book 125 lives) takes 6 "Weiter"-clicks.
        for (var i = 0; i < 6; i++)
        {
            cut.FindAll("button").Single(b => b.TextContent.Trim() == "Weiter →").Click();
        }
        Assert.Contains("Book 125", cut.Markup);
    }

    [Fact]
    public void Library_GridView_KeepsACategoryWithMoreThan20BooksAsOneContinuousGroup()
    {
        // Regression test for the bug this task fixes: the shelf (Regal)
        // view used to group books by category within only the currently
        // loaded 20-item server page, so a category with more than 20 books
        // got split across pages instead of rendering as one group. All 25
        // books share the same old createdAt date -- with the default sort
        // ("createdAt"/"desc", no genre/tag filter), LibraryShelfGrouping
        // routes to GroupByRecency, and a date this old buckets everything
        // into the single "Älter" group (see
        // Library_GridViewMode_WrapsShelfRowsInACabinet for the same
        // bucketing rule).
        var books = string.Join(",", Enumerable.Range(1, 25).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2000-01-01","isFavorite":false}"""));
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books",
                _ => RoutedFakeHttpMessageHandler.JsonResponse($$$"""{"success":true,"data":{"items":[{{{books}}}],"total":25,"page":1,"pageSize":100}}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();

        // Default view mode is Grid (Regal) -- no click needed.
        var cut = Render<Library>();

        Assert.Single(cut.FindAll(".shelf-row-group"));
        Assert.Equal(25, cut.FindAll("a.shelf-book").Count);
        Assert.Empty(cut.FindAll(".library-pager")); // pager is Raster-only now
    }

    [Fact]
    public void Library_ReloadInFlight_KeepsShowingPreviousResults_InsteadOfBlankingToLoadingState()
    {
        // Regression test for the "don't blank _allItems during a reload"
        // fix: every other test's mocked HTTP response resolves
        // synchronously, so none of them can distinguish "keeps old results
        // visible while the new request is in flight" from "blanks to the
        // loading spinner and then repopulates" -- both would look
        // identical once the (synchronous) response arrives. This handler
        // lets the *first* /api/books request complete normally, then makes
        // every subsequent /api/books request hang forever (adapted from
        // DiscoverPageTests.NeverRespondingHttpMessageHandler), so we can
        // assert on what's on screen *while* a reload is still pending.
        var handler = new FirstRequestThenHangingHttpMessageHandler(
            """{"success":true,"data":{"tags":[],"genres":[]}}""",
            """{"success":true,"data":{"items":[{"id":1,"title":"Dune","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}],"total":1,"page":1,"pageSize":100}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();

        var cut = Render<Library>();
        Assert.Contains("Dune", cut.Markup);

        // Any reload path works here; the favorites checkbox is the
        // simplest synchronous one already used elsewhere in this file
        // (Library_ClearFiltersButton_ResetsFavoritesOnlyAndReloadsWithoutIt)
        // -- its @bind:after calls ApplyFiltersAsync -> LoadAllBooksAsync
        // directly, no debounce timer to contend with. That second
        // /api/books request now hangs forever courtesy of the handler.
        cut.Find("input[type=checkbox]").Change(true);

        // If LoadAllBooksAsync ever blanks _allItems to null again before
        // this second request resolves, "Dune" disappears and the
        // <LoadingIndicator> markup ("Bibliothek wird geladen...") takes
        // its place -- this assertion catches that regression even though
        // the hanging request never completes for the rest of the test.
        Assert.Contains("Dune", cut.Markup);
        Assert.DoesNotContain("Bibliothek wird geladen", cut.Markup);
    }

    [Fact]
    public void Library_GridView_InitiallyRendersFewerBooksThanTotal_WhenLibraryIsLarge()
    {
        // All 60 books share one createdAt far in the past -- default sort
        // (createdAt/desc) buckets them all into the single "Älter" recency
        // group. This is deliberate: it's the exact case the design spec's
        // self-correction called out -- batching by GROUP count would not
        // limit anything here, since there's only one group. Batching by BOOK
        // count must still cap the initial render below the total.
        var books = string.Join(",", Enumerable.Range(1, 60).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2000-01-01","isFavorite":false}"""));
        UseApiResponse($$$"""{"success":true,"data":{"items":[{{{books}}}],"total":60,"page":1,"pageSize":100}}""");

        var cut = Render<Library>();

        var initialCount = cut.FindAll("a.shelf-book").Count;
        Assert.True(initialCount < 60, $"expected fewer than 60 books rendered initially, got {initialCount}");
        Assert.True(initialCount > 0);
    }

    [Fact]
    public async Task Library_RevealMoreBooks_EventuallyRendersEveryBook_AndStopsGrowingOnceAllShown()
    {
        var books = string.Join(",", Enumerable.Range(1, 60).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2000-01-01","isFavorite":false}"""));
        UseApiResponse($$$"""{"success":true,"data":{"items":[{{{books}}}],"total":60,"page":1,"pageSize":100}}""");

        var cut = Render<Library>();

        for (var i = 0; i < 10; i++) // generous upper bound; the loop below stops early once everything is shown
        {
            if (cut.FindAll("a.shelf-book").Count >= 60) break;
            // RevealMoreBooks calls StateHasChanged, which requires running on
            // bUnit's render dispatcher -- cut.InvokeAsync marshals onto it,
            // matching this codebase's existing convention for calling a
            // rendering-triggering instance method directly from a test (see
            // DiscoverPageTests.LoadCoverAsync / ReaderPageTests.OnChapterAnchorNotFound).
            await cut.InvokeAsync(() => cut.Instance.RevealMoreBooks());
        }

        Assert.Equal(60, cut.FindAll("a.shelf-book").Count);

        var countAfterFull = cut.FindAll("a.shelf-book").Count;
        await cut.InvokeAsync(() => cut.Instance.RevealMoreBooks()); // calling again once everything is already shown must be a harmless no-op
        Assert.Equal(countAfterFull, cut.FindAll("a.shelf-book").Count);
    }

    [Fact]
    public void Library_RasterPageSizeDropdown_ChangingItReslicesWithoutANewRequest_AndPersists()
    {
        var books = string.Join(",", Enumerable.Range(1, 50).Select(i =>
            $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01","isFavorite":false}"""));
        var capturedRequests = new List<HttpRequestMessage>();
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/facets", """{"success":true,"data":{"tags":[],"genres":[]}}""")
            .When(r => r.RequestUri!.AbsolutePath == "/api/books", r =>
            {
                capturedRequests.Add(r);
                return RoutedFakeHttpMessageHandler.JsonResponse($$$"""{"success":true,"data":{"items":[{{{books}}}],"total":50,"page":1,"pageSize":100}}""");
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
        var setSizeHandler = JSInterop.SetupModule("./js/libraryPreferences.js").SetupVoid("setRasterPageSize", _ => true);

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Raster").Click();
        Assert.Equal(20, cut.FindAll("a.book-card").Count);

        var requestCountBeforeChange = capturedRequests.Count;
        cut.Find("select.library-raster-page-size").Change("60");

        Assert.Equal(50, cut.FindAll("a.book-card").Count); // 60 requested but only 50 exist -- all of them show on page 1
        Assert.Equal(requestCountBeforeChange, capturedRequests.Count); // still no new HTTP request
        var invocation = Assert.Single(setSizeHandler.Invocations);
        Assert.Equal(60, invocation.Arguments[0]); // persisted the new choice
    }

    [Fact]
    public void Library_OnLoad_UsesPersistedRasterPageSize()
    {
        UseApiResponse("""{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":100}}""");
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule("./js/libraryPreferences.js")
            .Setup<int?>("getRasterPageSize", _ => true)
            .SetResult(40);

        var cut = Render<Library>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Raster").Click();

        Assert.Equal("40", cut.Find("select.library-raster-page-size").GetAttribute("value"));
    }

    private sealed class FirstRequestThenHangingHttpMessageHandler(string facetsJson, string firstBooksJson) : HttpMessageHandler
    {
        private int _booksRequestCount;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/facets"))
            {
                return Task.FromResult(RoutedFakeHttpMessageHandler.JsonResponse(facetsJson));
            }

            if (Interlocked.Increment(ref _booksRequestCount) == 1)
            {
                return Task.FromResult(RoutedFakeHttpMessageHandler.JsonResponse(firstBooksJson));
            }

            // Every subsequent /api/books request hangs forever -- lets a
            // test observe what's on screen while a reload is still pending.
            return new TaskCompletionSource<HttpResponseMessage>().Task;
        }
    }
}
