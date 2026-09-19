# Bibliothek: Regal ohne Pagination + einstellbare Raster-Seitengröße — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bibliothek page's shared 20-per-page server pagination with a single "fetch everything matching the current filters" load; the Regal (shelf) view renders the full grouped result with lazy DOM rendering as the user scrolls, and the Raster (grid) view paginates client-side over the same data with a user-selectable, persisted page size.

**Architecture:** `Library.razor` gains one new field, `_allItems` (`List<Book>?`), populated by a new `LoadAllBooksAsync()` that loops the existing `/api/books` endpoint at the backend's max `pageSize=100` until every filtered item is retrieved. Both view modes render from `_allItems` in memory — no more server round-trip per page/view-mode switch. The Regal view additionally virtualizes its own DOM output by book count (not group count — see rationale in Task 2) via a `_visibleBookCount` counter driven by a scroll sentinel. The Raster view slices `_allItems` client-side by a persisted `_rasterPageSize`.

**Tech Stack:** Blazor WebAssembly (.NET), bUnit for component tests, plain JS modules for `IJSRuntime` interop (existing project convention — see `auth.js`/`TokenStore.cs`, `theme.js`/`ThemeService.cs`, `lazyCover.js`).

## Global Constraints

- Backend `MAX_PAGE_SIZE = 100` (`backend/src/routes/books.ts`) is unchanged — no backend work in this plan.
- `LibraryShelfGrouping.Group()`'s signature is unchanged — only the size of the `IReadOnlyList<Book>` passed to it grows.
- No renaming of the existing (admittedly confusing) `LibraryViewMode.Grid`/`.List` enum values — out of scope, unrelated refactor.
- Design spec: `docs/superpowers/specs/2026-09-19-library-view-unpaginated-shelf-design.md` (includes a post-brainstorm correction: lazy-rendering batches by **book count**, not group count — the default "Hinzugefügt" sort only ever produces 4 recency buckets, so batching by group count would not actually bound DOM size for a large library).
- Every task must leave `dotnet test tests/frontend` fully green (377 existing tests + whatever this plan adds) before moving to the next task.

---

### Task 1: Fetch-all data loop, both views wired to it (no lazy-render, no page-size picker yet)

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor` (full rewrite of the `@code` block's data-loading section, the two view-render blocks, and the pager)
- Modify: `tests/frontend/LibraryPageTests.cs` (rewrite the one test whose premise no longer holds; verify the rest still pass unmodified)

**Interfaces:**
- Produces: `List<Book>? _allItems` (null = still loading; the field every later task and every other part of this component reads from instead of `_result`).
- Produces: `int _rasterPage`, `const int DefaultRasterPageSize = 20` — Task 3 adds the picker on top of these; for this task, page size is hardcoded to `DefaultRasterPageSize`.
- Produces: `Task LoadAllBooksAsync()` — the only place that calls `ApiClient.GetAsync<BookListResponse>` for the main list from now on.

- [ ] **Step 1: Write the failing tests**

Replace the existing pager test (its premise — clicking "Weiter →" sends a new HTTP request — no longer holds) and add the core multi-page-fetch regression test. Add both to `tests/frontend/LibraryPageTests.cs`, replacing the `Library_Pager_AppearsWhenMoreBooksThanOnePage_AndWeiterRequestsPage2` test (lines 209-230) with:

```csharp
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
            return RoutedFakeHttpMessageHandler.JsonResponse($$"""{"success":true,"data":{"items":[{{books}}],"total":25,"page":1,"pageSize":100}}""");
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
            _ => RoutedFakeHttpMessageHandler.JsonResponse($$"""{"success":true,"data":{"items":[{{page2Books}}],"total":125,"page":2,"pageSize":100}}"""))
        .When(r => r.RequestUri!.AbsolutePath == "/api/books",
            _ => RoutedFakeHttpMessageHandler.JsonResponse($$"""{"success":true,"data":{"items":[{{page1Books}}],"total":125,"page":1,"pageSize":100}}"""));
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/frontend --filter "Library_RasterPager_ClickingWeiter|Library_LoadAllBooksAsync_FetchesEverySubsequentBackendPage"`
Expected: FAIL (compiles against the not-yet-existing new behavior — old code still paginates server-side at 20/page and would request `page=2` from the server, `capturedRequests.Count` would grow, and the second test would never see book 101-125 since the old code never re-fetches beyond the currently displayed 20-item page).

- [ ] **Step 3: Rewrite `Library.razor`'s data layer and both view blocks**

Replace lines 122-146 (state fields) with:

```csharp
private enum LibraryViewMode { Grid, List }

private const int FetchPageSize = 100; // backend's MAX_PAGE_SIZE
private const int DefaultRasterPageSize = 20;

private List<Book>? _allItems;
private BookFacets? _facets;
private List<Book>? _suggestions;
private string? _errorMessage;
private LibraryViewMode _viewMode = LibraryViewMode.Grid;

private string _searchTerm = string.Empty;
private IReadOnlyList<string> _genreFilters = [];
private IReadOnlyList<string> _tagFilters = [];
private bool _favoritesOnly;
private string _sort = "createdAt";
private string _order = "desc";
private int _rasterPage = 1;
private int _rasterPageSize = DefaultRasterPageSize;

private System.Threading.Timer? _searchDebounceTimer;

private ElementReference _shelfRef;
private IJSObjectReference? _shelfPhysicsModule;
private bool _shelfPhysicsInitialized;

private bool HasActiveFilters => !string.IsNullOrWhiteSpace(_searchTerm) || _genreFilters.Count > 0 || _tagFilters.Count > 0 || _favoritesOnly;

private int RasterPageCount => _allItems is null ? 1 : Math.Max(1, (int)Math.Ceiling((double)_allItems.Count / _rasterPageSize));
```

Replace the `PageCount` property's old definition entirely (it's gone — replaced by `RasterPageCount` above).

Replace `OnInitializedAsync` (lines 151-171) — same body, just the last line changes:

```csharp
protected override async Task OnInitializedAsync()
{
    // Supports deep-linking from a tag link on Book Detail (library?tag=X).
    var query = new Uri(NavigationManager.Uri).Query.TrimStart('?');
    foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
        var parts = pair.Split('=', 2);
        if (parts[0] == "tag" && parts.Length == 2)
        {
            _tagFilters = [Uri.UnescapeDataString(parts[1])];
        }
    }

    var facetsResponse = await ApiClient.GetAsync<BookFacets>("/api/books/facets");
    if (facetsResponse is { Success: true, Data: not null })
    {
        _facets = facetsResponse.Data;
    }

    await LoadAllBooksAsync();
}
```

Replace `ShelfIsRendered` (lines 173-178):

```csharp
private bool ShelfIsRendered =>
    _errorMessage is null
    && _allItems is not null
    && !(_allItems.Count == 0 && !HasActiveFilters)
    && _allItems.Count != 0
    && _viewMode == LibraryViewMode.Grid;
```

Replace `ApplyFiltersAsync` and `GoToPageAsync` (lines 279-289) with:

```csharp
private Task ApplyFiltersAsync() => LoadAllBooksAsync();

private void GoToRasterPage(int page)
{
    _rasterPage = page;
}
```

Replace `LoadBooksAsync` (lines 291-310) with:

```csharp
private async Task LoadAllBooksAsync()
{
    _errorMessage = null;
    _allItems = null;
    _rasterPage = 1;

    var query = new List<string> { $"sort={_sort}", $"order={_order}", $"pageSize={FetchPageSize}" };
    if (!string.IsNullOrWhiteSpace(_searchTerm)) query.Add($"search={Uri.EscapeDataString(_searchTerm)}");
    if (_genreFilters.Count > 0) query.Add($"genre={Uri.EscapeDataString(string.Join(",", _genreFilters))}");
    if (_tagFilters.Count > 0) query.Add($"tag={Uri.EscapeDataString(string.Join(",", _tagFilters))}");
    if (_favoritesOnly) query.Add("favorite=true");

    var items = new List<Book>();
    var page = 1;
    while (true)
    {
        var response = await ApiClient.GetAsync<BookListResponse>($"/api/books?{string.Join('&', query)}&page={page}");
        if (response is not { Success: true, Data: not null })
        {
            _errorMessage = response?.Error?.Message ?? "Bibliothek konnte nicht geladen werden.";
            return;
        }

        items.AddRange(response.Data.Items);

        // Stop once we've collected everything the server says exists, or
        // if a page ever comes back empty despite Total not being reached
        // yet -- the latter guards against an infinite loop if the server
        // and its own reported Total ever disagree.
        if (items.Count >= response.Data.Total || response.Data.Items.Count == 0)
        {
            break;
        }

        page++;
    }

    _allItems = items;
}
```

`OnSearchInput`'s debounce timer callback (around line 240) calls `ApplyFiltersAsync()` already — no change needed there, it now transitively calls the new loop.

`ClearFiltersAsync` (lines 269-277) — unchanged, still ends by calling `ApplyFiltersAsync()`.

- [ ] **Step 4: Rewrite the two view-render blocks and the pager**

Replace lines 89-120 (the `@if (_viewMode == LibraryViewMode.Grid) { ... } else { ... }` block through the pager) with:

```razor
@if (_viewMode == LibraryViewMode.Grid)
{
    <div class="library-shelf" @ref="_shelfRef">
        <div class="shelf-cabinet">
            @foreach (var group in LibraryShelfGrouping.Group(_allItems ?? [], _sort, _genreFilters, _tagFilters))
            {
                <ShelfRow @key="group.Label" Label="@group.Label" Books="group.Books" />
            }
        </div>
    </div>
}
else
{
    <div class="library-raster">
        @foreach (var book in (_allItems ?? []).Skip((_rasterPage - 1) * _rasterPageSize).Take(_rasterPageSize))
        {
            <BookCard Book="book" />
        }
    </div>

    @if ((_allItems?.Count ?? 0) > _rasterPageSize)
    {
        <div class="library-pager">
            <button type="button" class="btn" disabled="@(_rasterPage <= 1)" @onclick="() => GoToRasterPage(_rasterPage - 1)">← Zurück</button>
            <span>Seite @_rasterPage von @RasterPageCount</span>
            <button type="button" class="btn" disabled="@(_rasterPage >= RasterPageCount)" @onclick="() => GoToRasterPage(_rasterPage + 1)">Weiter →</button>
        </div>
    }
}
```

The pager moved *inside* the `else` (Raster-only) branch and is gone from Grid entirely — this is the direct fix for the reported bug (the Grid/Regal view never had a pager-driven page boundary to split a category across again).

Also update the surrounding state-check markup (originally lines 71-88) to read `_allItems` instead of `_result`:

```razor
@if (_errorMessage is not null)
{
    <p class="form-error">@_errorMessage</p>
}
else if (_allItems is null)
{
    <LoadingIndicator Mode="LoadingIndicatorMode.Page" Text="Bibliothek wird geladen..." />
}
else if (_allItems.Count == 0 && !HasActiveFilters)
{
    <EmptyState Message="Deine Bibliothek ist noch leer. Füge dein erstes Buch hinzu und beginne deine Sammlung."
                ActionText="Buch hinzufügen"
                OnAction="GoToUpload" />
}
else if (_allItems.Count == 0)
{
    <p class="text-muted">Keine Bücher gefunden.</p>
}
else
{
    @* Task 1's Grid/Raster blocks above go here *@
}
```

- [ ] **Step 5: Run the new tests, verify they pass**

Run: `dotnet test tests/frontend --filter "Library_RasterPager_ClickingWeiter|Library_LoadAllBooksAsync_FetchesEverySubsequentBackendPage"`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite, verify nothing else broke**

Run: `dotnet test tests/frontend`
Expected: PASS, same total test count as before minus the one removed test plus the two new ones (377 - 1 + 2 = 378). Pay particular attention to `Library_SearchInput_AfterDebounce_ShowsSuggestionsAndFiltersResults`, `Library_TagMultiSelect_SelectingAPill_ReloadsWithTagInQueryString`, and `Library_ClearFiltersButton_ResetsFavoritesOnlyAndReloadsWithoutIt` — these should all still pass unmodified since their mocked `total` values are all ≤ 100 (single backend page, loop exits immediately) and they assert on query substrings, not exact `pageSize` values.

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Library.razor tests/frontend/LibraryPageTests.cs
git commit -m "feat: load entire filtered book list once, paginate raster view client-side"
```

---

### Task 2: Lazy DOM rendering for the Regal (shelf) view

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`
- Modify: `tests/frontend/LibraryPageTests.cs`

**Interfaces:**
- Consumes: `List<Book>? _allItems` from Task 1.
- Produces: `[JSInvokable] public void RevealMoreBooks()` — called by JS once the scroll sentinel intersects; also directly callable from tests via `cut.Instance.RevealMoreBooks()` since bUnit exposes the live component instance.
- Produces (JS): `observeLoadMore(sentinel, dotNetHelper, methodName)` / `disconnectLoadMore()`, exported from `shelf-physics.js` alongside the existing `initShelfPhysics`/`initShelfTouch`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/frontend/LibraryPageTests.cs`:

```csharp
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
    UseApiResponse($$"""{"success":true,"data":{"items":[{{books}}],"total":60,"page":1,"pageSize":100}}""");

    var cut = Render<Library>();

    var initialCount = cut.FindAll("a.shelf-book").Count;
    Assert.True(initialCount < 60, $"expected fewer than 60 books rendered initially, got {initialCount}");
    Assert.True(initialCount > 0);
}

[Fact]
public void Library_RevealMoreBooks_EventuallyRendersEveryBook_AndStopsGrowingOnceAllShown()
{
    var books = string.Join(",", Enumerable.Range(1, 60).Select(i =>
        $$"""{"id":{{i}},"title":"Book {{i}}","author":null,"coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2000-01-01","isFavorite":false}"""));
    UseApiResponse($$"""{"success":true,"data":{"items":[{{books}}],"total":60,"page":1,"pageSize":100}}""");

    var cut = Render<Library>();

    for (var i = 0; i < 10; i++) // generous upper bound; the loop below stops early once everything is shown
    {
        if (cut.FindAll("a.shelf-book").Count >= 60) break;
        cut.Instance.RevealMoreBooks();
    }

    Assert.Equal(60, cut.FindAll("a.shelf-book").Count);

    var countAfterFull = cut.FindAll("a.shelf-book").Count;
    cut.Instance.RevealMoreBooks(); // calling again once everything is already shown must be a harmless no-op
    Assert.Equal(countAfterFull, cut.FindAll("a.shelf-book").Count);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/frontend --filter "Library_GridView_InitiallyRendersFewerBooksThanTotal|Library_RevealMoreBooks_Eventually"`
Expected: FAIL — `RevealMoreBooks` doesn't exist yet (compile error), and today's Grid view renders every book immediately (first assertion would fail once it does compile).

- [ ] **Step 3: Add the book-count virtualization state and helper to `Library.razor`**

Add to the state-fields section (alongside `_rasterPage` etc. from Task 1):

```csharp
private const int InitialVisibleBookCount = 40;
private const int VisibleBookBatchSize = 40;

private int _visibleBookCount = InitialVisibleBookCount;
private ElementReference _loadMoreSentinelRef;
private DotNetObjectReference<Library>? _dotNetHelper;
```

Reset `_visibleBookCount` inside `LoadAllBooksAsync()` (Task 1's method) right next to where `_rasterPage = 1;` is set:

```csharp
_rasterPage = 1;
_visibleBookCount = InitialVisibleBookCount;
```

Add a pure helper method (near `ShelfIsRendered`):

```csharp
// Walks the already-grouped shelf in order, including whole groups until
// the remaining book budget runs out, then truncates the group that
// crosses the budget boundary instead of skipping it entirely -- so a
// partially-revealed shelf compartment grows in place on the next reveal
// rather than appearing all-or-nothing.
private static IEnumerable<BookGroup> TakeUpToBookCount(IEnumerable<BookGroup> groups, int bookCount)
{
    var remaining = bookCount;
    foreach (var group in groups)
    {
        if (remaining <= 0) yield break;

        if (group.Books.Count <= remaining)
        {
            yield return group;
            remaining -= group.Books.Count;
        }
        else
        {
            yield return new BookGroup(group.Label, group.Books.Take(remaining).ToList());
            remaining = 0;
        }
    }
}

[JSInvokable]
public void RevealMoreBooks()
{
    var total = _allItems?.Count ?? 0;
    _visibleBookCount = Math.Min(_visibleBookCount + VisibleBookBatchSize, total);
    StateHasChanged();
}
```

- [ ] **Step 4: Use the helper in the Grid view markup, add the sentinel**

Replace the Grid view block from Task 1 with:

```razor
@if (_viewMode == LibraryViewMode.Grid)
{
    var allGroups = LibraryShelfGrouping.Group(_allItems ?? [], _sort, _genreFilters, _tagFilters);
    var totalBookCount = _allItems?.Count ?? 0;

    <div class="library-shelf" @ref="_shelfRef">
        <div class="shelf-cabinet">
            @foreach (var group in TakeUpToBookCount(allGroups, _visibleBookCount))
            {
                <ShelfRow @key="group.Label" Label="@group.Label" Books="group.Books" />
            }
        </div>
    </div>
    @if (_visibleBookCount < totalBookCount)
    {
        <div class="shelf-load-more-sentinel" @ref="_loadMoreSentinelRef"></div>
    }
}
```

Note the sentinel is a sibling of `.library-shelf`, not a child of `.shelf-cabinet` — `.shelf-cabinet`'s own CSS has a `:last-child` rule (from the earlier Library Shelf Cabinet phase) that assumes its last child is always a `.shelf-row-group`; putting anything else inside it breaks that rule.

- [ ] **Step 5: Add `observeLoadMore`/`disconnectLoadMore` to `shelf-physics.js`**

Append to the end of `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js` (after the existing `initShelfPhysics` export):

```js
// Infinite-scroll trigger for the Regal view's lazy book rendering
// (Library Rework -- unpaginated shelf). One observer instance at a time,
// same disconnect-before-reobserve pattern as lazyCover.js: this module is
// re-invoked on every render where more books remain to reveal, and each
// call must fully replace whatever observer the previous render created
// rather than stacking a new one on top of it.
let loadMoreObserver = null;

export function observeLoadMore(sentinel, dotNetHelper, methodName) {
    loadMoreObserver?.disconnect();
    if (!sentinel) return;

    loadMoreObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            dotNetHelper.invokeMethodAsync(methodName);
        }
    }, { rootMargin: "600px 0px" }); // start revealing well before the sentinel is actually on-screen

    loadMoreObserver.observe(sentinel);
}

export function disconnectLoadMore() {
    loadMoreObserver?.disconnect();
    loadMoreObserver = null;
}
```

- [ ] **Step 6: Wire `OnAfterRenderAsync` and `DisposeAsync` in `Library.razor`**

Replace `OnAfterRenderAsync` (originally lines 180-208) with:

```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (!ShelfIsRendered)
    {
        // .library-shelf isn't in the DOM right now for any reason (still
        // loading, error, empty result, List view, etc.) -- force re-init
        // next time it reappears, since it may be a new DOM node.
        _shelfPhysicsInitialized = false;
        return;
    }

    if (!_shelfPhysicsInitialized)
    {
        try
        {
            _shelfPhysicsModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelf-physics.js");
            await _shelfPhysicsModule.InvokeVoidAsync("initShelfPhysics", _shelfRef);
            await _shelfPhysicsModule.InvokeVoidAsync("initShelfTouch", _shelfRef);
            // Re-check rather than unconditionally setting true: a later
            // OnAfterRenderAsync invocation (e.g. a view-mode toggle mid-import)
            // may have already reset this while these awaits were suspended --
            // only claim "initialized" if the shelf is still actually rendered
            // now that we've resumed.
            _shelfPhysicsInitialized = ShelfIsRendered;
        }
        catch (Exception)
        {
        }
    }

    var totalBookCount = _allItems?.Count ?? 0;
    if (_visibleBookCount < totalBookCount)
    {
        try
        {
            _shelfPhysicsModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelf-physics.js");
            _dotNetHelper ??= DotNetObjectReference.Create(this);
            await _shelfPhysicsModule.InvokeVoidAsync("observeLoadMore", _loadMoreSentinelRef, _dotNetHelper, nameof(RevealMoreBooks));
        }
        catch (Exception)
        {
        }
    }
}
```

Replace `DisposeAsync` (originally lines 312-326) with:

```csharp
public async ValueTask DisposeAsync()
{
    _searchDebounceTimer?.Dispose();

    if (_shelfPhysicsModule is not null)
    {
        try
        {
            await _shelfPhysicsModule.InvokeVoidAsync("disconnectLoadMore");
            await _shelfPhysicsModule.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
    }

    _dotNetHelper?.Dispose();
}
```

- [ ] **Step 7: Add the sentinel's CSS**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, add right before the `.shelf-cabinet` rule (around line 1900):

```css
/* Invisible trigger for the Regal view's scroll-driven lazy rendering
   (Library Rework -- unpaginated shelf). Needs a non-zero size to be a
   reliable IntersectionObserver target across browsers; kept visually
   inert otherwise. Lives as a sibling AFTER .library-shelf, never inside
   .shelf-cabinet -- see that class's own :last-child rule below. */
.shelf-load-more-sentinel {
  height: 1px;
}
```

- [ ] **Step 8: Run the new tests, verify they pass**

Run: `dotnet test tests/frontend --filter "Library_GridView_InitiallyRendersFewerBooksThanTotal|Library_RevealMoreBooks_Eventually"`
Expected: PASS

- [ ] **Step 9: Run the full frontend suite**

Run: `dotnet test tests/frontend`
Expected: PASS, including `Library_GridViewMode_WrapsShelfRowsInACabinet` (only 2 books, well under `InitialVisibleBookCount = 40`, so both groups render on the very first pass, unaffected by virtualization).

- [ ] **Step 10: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Library.razor frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/LibraryPageTests.cs
git commit -m "feat: lazily render the shelf view by book count as the user scrolls"
```

---

### Task 3: Configurable, persisted Raster page size

**Files:**
- Create: `frontend/LuminaChronica.Client/wwwroot/js/libraryPreferences.js`
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor`
- Modify: `tests/frontend/LibraryPageTests.cs`

**Interfaces:**
- Consumes: `int _rasterPageSize`, `int _rasterPage` from Task 1.
- Produces (JS): `getRasterPageSize()` (returns a number or `null`), `setRasterPageSize(value)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/frontend/LibraryPageTests.cs`:

```csharp
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
            return RoutedFakeHttpMessageHandler.JsonResponse($$"""{"success":true,"data":{"items":[{{books}}],"total":50,"page":1,"pageSize":100}}""");
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
```

Note: `JSInterop.Mode` in `BunitContext` already defaults to `Loose` for this test class (existing tests in this file never set it and already rely on unmocked JS calls, e.g. the `import "./js/shelf-physics.js"` call, returning harmlessly) -- the explicit `JSInterop.Mode = JSRuntimeMode.Loose;` line in the second test is only for clarity, matching `BiblePageTests.cs`'s existing style; it's not strictly required if the suite's default is already Loose, but include it for readability.

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/frontend --filter "Library_RasterPageSizeDropdown|Library_OnLoad_UsesPersistedRasterPageSize"`
Expected: FAIL — no `select.library-raster-page-size` exists yet, `_rasterPageSize` is hardcoded.

- [ ] **Step 3: Create `libraryPreferences.js`**

```js
// Persists the Bibliothek Raster view's chosen page size across sessions.
// Same minimal localStorage-wrapper shape as auth.js/theme.js.
const RASTER_PAGE_SIZE_KEY = "lumina_library_raster_page_size";

export function getRasterPageSize() {
    const raw = localStorage.getItem(RASTER_PAGE_SIZE_KEY);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function setRasterPageSize(value) {
    localStorage.setItem(RASTER_PAGE_SIZE_KEY, String(value));
}
```

- [ ] **Step 4: Wire the module into `Library.razor`**

Add to the state fields (alongside the others):

```csharp
private static readonly int[] RasterPageSizeOptions = [20, 40, 60, 100];

private IJSObjectReference? _libraryPreferencesModule;
```

Change the `_rasterPageSize` field's initial inline value from `DefaultRasterPageSize` to just declared without an initializer (it gets set during `OnInitializedAsync` now):

```csharp
private int _rasterPageSize;
```

Update `OnInitializedAsync` (from Task 1) to load the persisted value first:

```csharp
protected override async Task OnInitializedAsync()
{
    // Supports deep-linking from a tag link on Book Detail (library?tag=X).
    var query = new Uri(NavigationManager.Uri).Query.TrimStart('?');
    foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
        var parts = pair.Split('=', 2);
        if (parts[0] == "tag" && parts.Length == 2)
        {
            _tagFilters = [Uri.UnescapeDataString(parts[1])];
        }
    }

    _rasterPageSize = await LoadPreferredRasterPageSizeAsync();

    var facetsResponse = await ApiClient.GetAsync<BookFacets>("/api/books/facets");
    if (facetsResponse is { Success: true, Data: not null })
    {
        _facets = facetsResponse.Data;
    }

    await LoadAllBooksAsync();
}

private async Task<int> LoadPreferredRasterPageSizeAsync()
{
    try
    {
        _libraryPreferencesModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/libraryPreferences.js");
        var stored = await _libraryPreferencesModule.InvokeAsync<int?>("getRasterPageSize");
        return stored.HasValue && RasterPageSizeOptions.Contains(stored.Value) ? stored.Value : DefaultRasterPageSize;
    }
    catch (Exception)
    {
        return DefaultRasterPageSize;
    }
}

private async Task SavePreferredRasterPageSizeAsync(int size)
{
    try
    {
        _libraryPreferencesModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/libraryPreferences.js");
        await _libraryPreferencesModule.InvokeVoidAsync("setRasterPageSize", size);
    }
    catch (Exception)
    {
    }
}

private async Task OnRasterPageSizeChangedAsync()
{
    _rasterPage = 1;
    await SavePreferredRasterPageSizeAsync(_rasterPageSize);
}
```

Add the dropdown to the toolbar, immediately after the existing `.library-view-toggle` block (around line 68 of the original file):

```razor
@if (_viewMode == LibraryViewMode.List)
{
    <select class="library-raster-page-size" @bind="_rasterPageSize" @bind:after="OnRasterPageSizeChangedAsync">
        @foreach (var size in RasterPageSizeOptions)
        {
            <option value="@size">@size pro Seite</option>
        }
    </select>
}
```

Add `_libraryPreferencesModule`'s disposal to `DisposeAsync` (from Task 2), right before the closing brace:

```csharp
if (_libraryPreferencesModule is not null)
{
    try
    {
        await _libraryPreferencesModule.DisposeAsync();
    }
    catch (JSDisconnectedException)
    {
    }
}
```

- [ ] **Step 5: Run the new tests, verify they pass**

Run: `dotnet test tests/frontend --filter "Library_RasterPageSizeDropdown|Library_OnLoad_UsesPersistedRasterPageSize"`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite one last time**

Run: `dotnet test tests/frontend`
Expected: PASS, full count (378 from Task 1, +2 from Task 2, +2 from this task = 382).

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/libraryPreferences.js frontend/LuminaChronica.Client/Pages/Library.razor tests/frontend/LibraryPageTests.cs
git commit -m "feat: make the raster view's page size configurable and persisted"
```

---

## Live verification (required before this is considered done, per this project's own standing convention)

bUnit cannot exercise a real `IntersectionObserver` or real scrolling. Before calling this feature finished, verify live in a real browser (register/login locally per `documentation`'s local-dev notes):

1. Upload or seed enough books (or temporarily lower `InitialVisibleBookCount`/`VisibleBookBatchSize` for the test, then revert) to exceed one batch, confirm the Regal view initially shows fewer books than exist, and that scrolling down (**real scroll-wheel input**, not `window.scrollTo()` — this project's own documented Claude-in-Chrome automation quirk makes synthetic scrolls unreliable for verifying `IntersectionObserver` triggers) reveals more without a visible pop-in stutter.
2. Confirm a shelf compartment that was cut mid-reveal (e.g. a large "Älter" bucket) visually grows in place rather than flickering/remounting when the next batch reveals more of the same group.
3. Confirm the Raster page-size dropdown persists across a full page reload (not just a SPA navigation).
4. Spot-check that a genre/date group that used to span the old 20-item page boundary now renders as one continuous shelf compartment.
