# Dashboard Rework — Phase 1 (Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Dashboard's three data sections (Weiterlesen, stat row, Aktuelle Projekte) their Phase-1 layout treatment from the design spec — no new visual language, no backend changes — and fix the "Aktuelle Projekte" section so it shows real data instead of always rendering empty.

**Architecture:** Three independent, additive changes to `frontend/LuminaChronica.Client/Pages/Home.razor` and its `@code` block: (1) extract the four stat boxes into a new `StatCard` component that renders the exact same existing global CSS classes Statistics.razor also relies on, so nothing else regresses; (2) mark the first `ContinueReading` item as `BookCardSize.Large` (an enum value + CSS class that already exist in `BookCard` but have never had a real caller) and give that size's progress bar a gold fill instead of the default; (3) fetch `GET /api/projects` (live since v2.0, unchanged) alongside the existing dashboard/books fetches and render real `ProjectCard`s instead of an unconditional `EmptyState`.

**Tech Stack:** Blazor WebAssembly (.NET), bUnit for component tests (`BunitContext`, `RoutedFakeHttpMessageHandler`).

## Global Constraints

- No new CSS custom properties/color tokens — reuse existing tokens (`--color-accent-text`, `--color-border`, etc.) exactly as defined in `wwwroot/Styles/themes/*.css`.
- No new motion durations/timings — this plan doesn't add any animation.
- No fake data — every rendered value must come from a real API response.
- No regression to Continue Reading, Recommendations, or the `ownerUsername` "Geliehen von" badge — `HomePageTests.cs`'s existing assertions for these must keep passing unchanged.
- `Statistics.razor` is explicitly out of scope — do not modify it, even though it shares `.dashboard-stat`'s CSS classes with this plan's `StatCard` component.
- Every existing `HomePageTests.cs` test that renders `<Home>` must keep working after this plan adds a new `/api/projects` fetch to `OnInitializedAsync` — `RoutedFakeHttpMessageHandler` throws `InvalidOperationException` for any unmatched request path, so every test's handler needs a route for it.
- `main` is protected — every change goes out via branch + PR + squash merge, per this repo's established convention (see recent `docs/*` branches).

---

## Task 1: `StatCard` component

**Files:**
- Create: `frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor`
- Create: `tests/frontend/StatCardTests.cs`
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor:37-54`

**Interfaces:**
- Produces: `StatCard` component with `[Parameter] public string Value { get; set; }` and `[Parameter] public string Label { get; set; }`, namespace `LuminaChronica.Client.Components`. Renders `<div class="dashboard-stat"><span class="dashboard-stat-value">{Value}</span><span class="dashboard-stat-label">{Label}</span></div>` — the exact markup/classes `Home.razor` currently hand-rolls and `Statistics.razor` (`.stats-overview .dashboard-stat`) already relies on via the same global `app.css` classes. No new CSS is added anywhere in this task.

- [ ] **Step 1: Write the failing test**

Create `tests/frontend/StatCardTests.cs`:

```csharp
using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class StatCardTests : BunitContext
{
    [Fact]
    public void StatCard_RendersValueAndLabel_WithDashboardStatClasses()
    {
        var cut = Render<StatCard>(parameters => parameters
            .Add(p => p.Value, "4")
            .Add(p => p.Label, "Bücher"));

        var root = cut.Find("div.dashboard-stat");
        Assert.Equal("4", root.QuerySelector(".dashboard-stat-value")!.TextContent);
        Assert.Equal("Bücher", root.QuerySelector(".dashboard-stat-label")!.TextContent);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/frontend --filter StatCard_RendersValueAndLabel_WithDashboardStatClasses`
Expected: FAIL — `StatCard` type doesn't exist yet (compile error).

- [ ] **Step 3: Create the component**

Create `frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor`:

```razor
@namespace LuminaChronica.Client.Components

<div class="dashboard-stat">
    <span class="dashboard-stat-value">@Value</span>
    <span class="dashboard-stat-label">@Label</span>
</div>

@code {
    [Parameter, EditorRequired]
    public string Value { get; set; } = string.Empty;

    [Parameter, EditorRequired]
    public string Label { get; set; } = string.Empty;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/frontend --filter StatCard_RendersValueAndLabel_WithDashboardStatClasses`
Expected: PASS

- [ ] **Step 5: Wire `StatCard` into `Home.razor`**

In `frontend/LuminaChronica.Client/Pages/Home.razor`, replace the four `.dashboard-stat` divs inside `<div class="dashboard-overview">` (lines 37-54; the surrounding `@if (_dashboard is not null) { ... }` block stays untouched):

```razor
    <div class="dashboard-overview">
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_dashboard.Overview.TotalBooks</span>
            <span class="dashboard-stat-label">Bücher</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_dashboard.Overview.TotalShelves</span>
            <span class="dashboard-stat-label">Regale</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_dashboard.Overview.TotalFavorites</span>
            <span class="dashboard-stat-label">Favoriten</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_dashboard.Overview.FinishedBooks</span>
            <span class="dashboard-stat-label">Gelesen</span>
        </div>
    </div>
```

with:

```razor
    <div class="dashboard-overview">
        <StatCard Value="@_dashboard.Overview.TotalBooks.ToString()" Label="Bücher" />
        <StatCard Value="@_dashboard.Overview.TotalShelves.ToString()" Label="Regale" />
        <StatCard Value="@_dashboard.Overview.TotalFavorites.ToString()" Label="Favoriten" />
        <StatCard Value="@_dashboard.Overview.FinishedBooks.ToString()" Label="Gelesen" />
    </div>
```

`Home.razor` already has `@using LuminaChronica.Client.Components` at the top — no new using needed.

- [ ] **Step 6: Run the existing Home page tests to confirm no regression**

Run: `dotnet test tests/frontend --filter Home_ShowsOverviewCounts_FromDashboardEndpoint`
Expected: PASS — `HomePageTests.cs`'s existing `.dashboard-stat-value` element query (see its own comment about scoped-CSS attributes) still matches, since `StatCard` renders the identical markup, just from a component instead of inline.

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor frontend/LuminaChronica.Client/Pages/Home.razor tests/frontend/StatCardTests.cs
git commit -m "refactor: extract dashboard stat boxes into StatCard component"
```

---

## Task 2: Feature the first Continue-Reading card + gold progress line

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor:22-31`
- Modify: `frontend/LuminaChronica.Client/Components/BookCard/BookCard.razor.css`
- Modify: `tests/frontend/HomePageTests.cs` (extends `Home_ShowsContinueReadingSection_WhenReadingHistoryExists`, see Task 3's full-file rewrite)

**Interfaces:**
- Consumes: `BookCardSize.Large` (already defined in `Components/BookCard/BookCard.razor.cs`, already has a `.book-card-large` CSS rule, currently has zero real callers — confirmed via grep before writing this plan).
- Produces: nothing new for later tasks — this task only changes `Home.razor`'s Weiterlesen loop and `BookCard.razor.css`.

- [ ] **Step 1: Write the failing test**

In `tests/frontend/HomePageTests.cs`, add a new test (final file content is written out in full in Task 3 — for now, add this method to the existing file, in the same handler style as `Home_ShowsContinueReadingSection_WhenReadingHistoryExists`):

```csharp
[Fact]
public void Home_ContinueReading_FirstBookIsFeaturedSize_RestAreNormal()
{
    const string dashboardJson = """
        {"success":true,"data":{"continueReading":[
            {"book":{"id":7,"title":"Der Herr der Ringe","author":"J.R.R. Tolkien","description":null,
             "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
             "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
             "percentage":42.5,"lastOpened":"2026-08-01T10:00:00Z"},
            {"book":{"id":8,"title":"Der Hobbit","author":"J.R.R. Tolkien","description":null,
             "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
             "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
             "percentage":10,"lastOpened":"2026-08-01T09:00:00Z"}
        ],"overview":{"totalBooks":2,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
        """;
    UseHandler(new RoutedFakeHttpMessageHandler()
        .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
        .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
        .WhenPathEndsWith("/api/dashboard", dashboardJson));
    Services.AddSingleton<BlobUrlService>();

    var cut = Render<Home>();

    var cards = cut.FindAll("a.book-card");
    Assert.Equal(2, cards.Count);
    Assert.Contains("book-card-large", cards[0].ClassList);
    Assert.Contains("book-card-normal", cards[1].ClassList);
}
```

Note: no `/api/projects` route is needed here — `Home.razor` doesn't fetch it until Task 3. Task 3's full-file rewrite of `HomePageTests.cs` will add that route to this test method too, once the fetch exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/frontend --filter Home_ContinueReading_FirstBookIsFeaturedSize_RestAreNormal`
Expected: FAIL — every `BookCard` currently renders `book-card-normal` (the component's default `Size`), so `cards[0]` won't have `book-card-large`.

- [ ] **Step 3: Update `Home.razor`'s Weiterlesen loop**

Replace lines 22-31 of `frontend/LuminaChronica.Client/Pages/Home.razor`:

```razor
@if (_dashboard is { ContinueReading.Count: > 0 })
{
    <h2>Weiterlesen</h2>
    <div class="library-grid">
        @foreach (var item in _dashboard.ContinueReading)
        {
            <BookCard Book="item.Book" ProgressPercentage="item.Percentage" Href="@($"library/books/{item.Book.Id}/read")"
                      ShowFavorite="item.OwnerUsername is null" OwnerUsername="@item.OwnerUsername" />
        }
    </div>
}
```

with:

```razor
@if (_dashboard is { ContinueReading.Count: > 0 })
{
    <h2>Weiterlesen</h2>
    <div class="library-grid">
        @for (var i = 0; i < _dashboard.ContinueReading.Count; i++)
        {
            var item = _dashboard.ContinueReading[i];
            <BookCard Book="item.Book" ProgressPercentage="item.Percentage" Href="@($"library/books/{item.Book.Id}/read")"
                      ShowFavorite="item.OwnerUsername is null" OwnerUsername="@item.OwnerUsername"
                      Size="@(i == 0 ? BookCardSize.Large : BookCardSize.Normal)" />
        }
    </div>
}
```

The backend already caps `ContinueReading` at 5 entries (documented in the design spec and in `documentation/Roadmap.md`'s Dashboard section), so this is already "featured + up to 4 normal" with no extra truncation logic needed. `.library-grid`'s existing `display: flex; flex-wrap: wrap;` (in `wwwroot/Styles/app.css`) already handles a wider first child correctly — no new CSS class needed for the container.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests/frontend --filter Home_ContinueReading_FirstBookIsFeaturedSize_RestAreNormal`
Expected: PASS

- [ ] **Step 5: Give the `Large` size's progress bar a gold fill**

In `frontend/LuminaChronica.Client/Components/BookCard/BookCard.razor.css`, after the existing `.book-card-large` rules at the bottom of the file, add:

```css
/* Featured Weiterlesen card only (Dashboard Rework Phase 1) -- uses
   --color-accent-text, not --color-gold-accent: the plain gold accent
   fails WCAG's 3:1 non-text-contrast floor against light-theme paper
   (see #341's identical reasoning for the rating-star/focus-ring fix in
   app.css). Small/Normal cards elsewhere (Library, Reader) are untouched. */
.book-card-large .book-card-progress {
    height: 2px;
}

.book-card-large .book-card-progress-bar {
    background-color: var(--color-accent-text);
}
```

This step has no bUnit test — bUnit doesn't compute rendered CSS (the same limitation `documentation/Roadmap.md` notes repeatedly for this project's motion/color work). It's covered in Task 4's live verification pass instead.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Home.razor frontend/LuminaChronica.Client/Components/BookCard/BookCard.razor.css tests/frontend/HomePageTests.cs
git commit -m "feat: feature the first Weiterlesen card with a gold progress line"
```

---

## Task 3: Wire "Aktuelle Projekte" to the real Projects API (and keep every test routed)

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor` (imports, `@code` block, and the "Aktuelle Projekte" markup at lines 91-93)
- Modify: `tests/frontend/HomePageTests.cs` (full rewrite, this task's last step)

**Interfaces:**
- Consumes: `ApiClient.GetAsync<List<Project>>("/api/projects")` (existing method, same call shape already used by `Pages/Projects.razor:92`), `Project` model (`Models/Project.cs`, fields `Id`/`Title`/`Type`/`CoverUrl`/etc.), `ProjectCard` component (`Components/ProjectCard/ProjectCard.razor`, single `[Parameter] Project Project` — used as-is, unmodified).
- Produces: `Home.razor`'s `_projects` field (`List<Project>?`), used only within this file.

This task must end with the *entire* `tests/frontend` suite green, not just its own new tests — Step 3 below makes `Home.razor` unconditionally fetch `/api/projects`, and `RoutedFakeHttpMessageHandler` throws `InvalidOperationException` for any unrouted request. Every pre-existing `HomePageTests.cs` method (the 8 from before this plan, plus Task 1/2's `StatCardTests.cs` is a different file and unaffected) needs that route added — done in this task's final step (Step 6), not deferred to a separate task, so no commit in this task ever leaves the suite red.

- [ ] **Step 1: Write the failing tests**

Add to `tests/frontend/HomePageTests.cs`: first add the new constant next to the existing `EmptyDashboardJson`:

```csharp
    private const string EmptyProjectsJson = """{"success":true,"data":[]}""";
```

Then add these two new test methods (the full, final file layout — with this constant placed correctly and every method routed — is written out in Step 6; for now just add the constant and these two methods to the existing file):

```csharp
[Fact]
public void Home_ShowsEmptyStateForProjects_WhenNoProjectsExist()
{
    UseHandler(new RoutedFakeHttpMessageHandler()
        .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
        .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
        .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
        .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

    var cut = Render<Home>();

    Assert.Contains("Du hast noch keine Projekte erstellt", cut.Markup);
}

[Fact]
public void Home_ShowsRealProjects_WhenProjectsExist()
{
    // Regression coverage for the bug where "Aktuelle Projekte" always
    // showed the empty state regardless of real data (never wired to the
    // Projects API that's existed since v2.0 -- see Roadmap.md).
    const string projectsJson = """
        {"success":true,"data":[
            {"id":3,"title":"Mittelerde","description":null,"type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}
        ]}
        """;
    UseHandler(new RoutedFakeHttpMessageHandler()
        .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
        .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
        .WhenPathEndsWith("/api/projects", projectsJson)
        .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));
    Services.AddSingleton<BlobUrlService>();

    var cut = Render<Home>();

    Assert.Contains("Mittelerde", cut.Markup);
    Assert.DoesNotContain("Du hast noch keine Projekte erstellt", cut.Markup);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests/frontend --filter "Home_ShowsEmptyStateForProjects_WhenNoProjectsExist|Home_ShowsRealProjects_WhenProjectsExist"`
Expected: `Home_ShowsRealProjects_WhenProjectsExist` FAILs (no fetch to `/api/projects` happens yet, so "Mittelerde" never renders and the empty-state text is still there). `Home_ShowsEmptyStateForProjects_WhenNoProjectsExist` currently passes by accident (today's hardcoded `EmptyState` always shows) — that's expected; it'll keep passing for the right reason once Step 3 lands.

- [ ] **Step 3: Add the imports, field, and fetch**

In `frontend/LuminaChronica.Client/Pages/Home.razor`, the `@using` block at the top already has `@using LuminaChronica.Client.Models` (used by `Book`) — no new using is needed since `Project` lives in the same `LuminaChronica.Client.Models` namespace and `ProjectCard` in the already-imported `LuminaChronica.Client.Components` namespace.

Replace the `@code` block's field declarations (current lines 96-100):

```csharp
    private const int RecentBooksLimit = 6;

    private List<Book>? _books;
    private int _totalBooks;
    private DashboardResponse? _dashboard;
```

with:

```csharp
    private const int RecentBooksLimit = 6;
    private const int RecentProjectsLimit = 6;

    private List<Book>? _books;
    private int _totalBooks;
    private DashboardResponse? _dashboard;
    private List<Project>? _projects;
```

Replace `OnInitializedAsync` (current lines 102-118):

```csharp
    protected override async Task OnInitializedAsync()
    {
        var dashboardTask = ApiClient.GetAsync<DashboardResponse>("/api/dashboard");
        var response = await ApiClient.GetAsync<BookListResponse>($"/api/books?sort=createdAt&order=desc&pageSize={RecentBooksLimit}");
        if (response is { Success: true, Data: not null })
        {
            _books = response.Data.Items;
            _totalBooks = response.Data.Total;
        }
        else
        {
            _books = [];
        }

        var dashboardResponse = await dashboardTask;
        _dashboard = dashboardResponse is { Success: true, Data: not null } ? dashboardResponse.Data : new DashboardResponse();
    }
```

with:

```csharp
    protected override async Task OnInitializedAsync()
    {
        var dashboardTask = ApiClient.GetAsync<DashboardResponse>("/api/dashboard");
        var projectsTask = ApiClient.GetAsync<List<Project>>("/api/projects");
        var response = await ApiClient.GetAsync<BookListResponse>($"/api/books?sort=createdAt&order=desc&pageSize={RecentBooksLimit}");
        if (response is { Success: true, Data: not null })
        {
            _books = response.Data.Items;
            _totalBooks = response.Data.Total;
        }
        else
        {
            _books = [];
        }

        var dashboardResponse = await dashboardTask;
        _dashboard = dashboardResponse is { Success: true, Data: not null } ? dashboardResponse.Data : new DashboardResponse();

        var projectsResponse = await projectsTask;
        _projects = projectsResponse is { Success: true, Data: not null } ? projectsResponse.Data : [];
    }
```

- [ ] **Step 4: Replace the "Aktuelle Projekte" markup**

Replace the current lines 91-93:

```razor
<h2>Aktuelle Projekte</h2>
<EmptyState Message="Du hast noch keine Projekte erstellt. Beginne mit deiner ersten Welt, Geschichte oder Kampagne."
            ActionText="Projekt erstellen" />
```

with:

```razor
<h2>Aktuelle Projekte</h2>
@if (_projects is null)
{
    <LoadingIndicator Text="Projekte werden geladen..." />
}
else if (_projects.Count == 0)
{
    <EmptyState Message="Du hast noch keine Projekte erstellt. Beginne mit deiner ersten Welt, Geschichte oder Kampagne."
                ActionText="Projekt erstellen"
                ActionHref="projects" />
}
else
{
    <div class="library-grid">
        @foreach (var project in _projects.Take(RecentProjectsLimit))
        {
            <ProjectCard Project="project" />
        }
    </div>
    @if (_projects.Count > RecentProjectsLimit)
    {
        <p><a href="projects">Alle Projekte ansehen (@_projects.Count)</a></p>
    }
}
```

Note: the previous `EmptyState` had no `OnAction`/`ActionHref` at all, so its "Projekt erstellen" button was a dead click — this fixes that too, using the same `ActionHref="projects"` pattern `Home.razor`'s books section doesn't use (it uses `OnAction="GoToUpload"` because `/library/upload` is a dedicated page) but that fits here since project creation is an inline form on `/projects` itself, not a separate route.

- [ ] **Step 5: Run the two new tests to verify they pass**

Run: `dotnet test tests/frontend --filter "Home_ShowsEmptyStateForProjects_WhenNoProjectsExist|Home_ShowsRealProjects_WhenProjectsExist"`
Expected: PASS. Do **not** run the full suite yet — Step 3 just made `Home.razor` unconditionally call `/api/projects`, so every pre-existing test (and Task 2's featured-card test) will currently fail with `InvalidOperationException: No route configured for GET .../api/projects`. That's expected and fixed by Step 6 next, in this same task.

- [ ] **Step 6: Fix every other test's handler — replace the entire contents of `tests/frontend/HomePageTests.cs`**

Every pre-existing test (from before this plan) plus Task 2's `Home_ContinueReading_FirstBookIsFeaturedSize_RestAreNormal` calls `UseHandler(new RoutedFakeHttpMessageHandler()...)` without a `/api/projects` route — each now needs `.WhenPathEndsWith("/api/projects", EmptyProjectsJson)` added. Doing this as one full-file replacement (rather than editing each call site individually) avoids missing one.

```csharp
using Bunit;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class HomePageTests : BunitContext
{
    private const string EmptyDashboardJson =
        """{"success":true,"data":{"continueReading":[],"recommendations":[],"overview":{"totalBooks":0,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}""";

    private const string EmptyProjectsJson = """{"success":true,"data":[]}""";

    [Fact]
    public void Home_RendersWithoutThrowing_AndShowsWelcomeHeading()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Willkommen zurück", cut.Markup);
    }

    [Fact]
    public void Home_ShowsEmptyStateForLibrary_WhenLibraryIsEmpty()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Deine Bibliothek ist noch leer", cut.Markup);
    }

    [Fact]
    public void Home_ShowsRecentBooks_WhenLibraryHasBooks()
    {
        // Regression coverage for the bug where Home always showed the
        // "library is empty" placeholder regardless of real data.
        const string booksJson = """
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null}
            ],"total":1,"page":1,"pageSize":6}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", booksJson)
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Dune", cut.Markup);
        Assert.DoesNotContain("Deine Bibliothek ist noch leer", cut.Markup);
    }

    [Fact]
    public void Home_ShowsOverviewCounts_FromDashboardEndpoint()
    {
        const string dashboardJson =
            """{"success":true,"data":{"continueReading":[],"overview":{"totalBooks":4,"totalShelves":2,"totalFavorites":1,"finishedBooks":3}}}""";
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));

        var cut = Render<Home>();

        // Issue #180: this used to assert the raw substring
        // dashboard-stat-value">4< against cut.Markup -- which can never
        // match, since Home.razor.css gives Home a scoped-CSS id that
        // Blazor inserts as its own attribute between class="..." and the
        // element's closing >, e.g. class="dashboard-stat-value" b-xxxxxxx>4.
        // Querying the actual elements (like the rest of this suite does
        // elsewhere) isn't sensitive to that attribute's presence, order, or
        // exact scope hash.
        var values = cut.FindAll(".dashboard-stat-value").Select(e => e.TextContent).ToList();
        Assert.Equal(["4", "2", "1", "3"], values);
    }

    [Fact]
    public void Home_ShowsContinueReadingSection_WhenReadingHistoryExists()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[
                {"book":{"id":7,"title":"Der Herr der Ringe","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":42.5,"lastOpened":"2026-08-01T10:00:00Z"}
            ],"overview":{"totalBooks":1,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Weiterlesen", cut.Markup);
        Assert.Contains("Der Herr der Ringe", cut.Markup);
        Assert.Contains("href=\"library/books/7/read\"", cut.Markup);
    }

    [Fact]
    public void Home_ContinueReading_FirstBookIsFeaturedSize_RestAreNormal()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[
                {"book":{"id":7,"title":"Der Herr der Ringe","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":42.5,"lastOpened":"2026-08-01T10:00:00Z"},
                {"book":{"id":8,"title":"Der Hobbit","author":"J.R.R. Tolkien","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":10,"lastOpened":"2026-08-01T09:00:00Z"}
            ],"overview":{"totalBooks":2,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        var cards = cut.FindAll("a.book-card");
        Assert.Equal(2, cards.Count);
        Assert.Contains("book-card-large", cards[0].ClassList);
        Assert.Contains("book-card-normal", cards[1].ClassList);
    }

    [Fact]
    public void Home_ShowsBorrowedBadge_WithOwnerUsername_NotAsLiteralText()
    {
        // Regression: OwnerUsername="item.OwnerUsername" (no leading @) once
        // bound the BookCard parameter to that literal string instead of
        // evaluating the property -- same bug class as the missing-@ Razor
        // parameter binding bug documented in CHANGELOG.md's v1.0 Fixed
        // section. Assert the real username renders and the raw C# text
        // never leaks into the markup.
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[
                {"book":{"id":7,"title":"Geliehenes Buch","author":null,"description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"SHARED","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null},
                 "percentage":10,"lastOpened":"2026-08-01T10:00:00Z","ownerUsername":"bob"}
            ],"overview":{"totalBooks":0,"totalShelves":0,"totalFavorites":0,"finishedBooks":0}}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Geliehen von bob", cut.Markup);
        Assert.DoesNotContain("item.OwnerUsername", cut.Markup);
        Assert.Empty(cut.FindAll("button.book-card-favorite"));
    }

    [Fact]
    public void Home_HidesContinueReadingSection_WhenNoReadingHistoryExists()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.DoesNotContain("Weiterlesen", cut.Markup);
    }

    [Fact]
    public void Home_ShowsRecommendationsSection_WhenUnstartedBooksExist()
    {
        const string dashboardJson = """
            {"success":true,"data":{"continueReading":[],"overview":{"totalBooks":1,"totalShelves":0,"totalFavorites":0,"finishedBooks":0},
             "recommendations":[
                {"id":9,"title":"Struwwelpeter","author":"Heinrich Hoffmann","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null}
             ]}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", dashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Empfehlungen", cut.Markup);
        Assert.Contains("Struwwelpeter", cut.Markup);
    }

    [Fact]
    public void Home_HidesRecommendationsSection_WhenNoneAvailable()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.DoesNotContain("Empfehlungen", cut.Markup);
    }

    [Fact]
    public void Home_ShowsEmptyStateForProjects_WhenNoProjectsExist()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

        var cut = Render<Home>();

        Assert.Contains("Du hast noch keine Projekte erstellt", cut.Markup);
    }

    [Fact]
    public void Home_ShowsRealProjects_WhenProjectsExist()
    {
        // Regression coverage for the bug where "Aktuelle Projekte" always
        // showed the empty state regardless of real data (never wired to the
        // Projects API that's existed since v2.0 -- see Roadmap.md).
        const string projectsJson = """
            {"success":true,"data":[
                {"id":3,"title":"Mittelerde","description":null,"type":"WORLD","coverUrl":null,"mapUrl":null,"visibility":"PRIVATE","createdAt":"2026-01-01"}
            ]}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
            .WhenPathEndsWith("/api/projects", projectsJson)
            .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Mittelerde", cut.Markup);
        Assert.DoesNotContain("Du hast noch keine Projekte erstellt", cut.Markup);
    }

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
    }
}
```

- [ ] **Step 7: Run the full frontend test suite**

Run: `dotnet test tests/frontend`
Expected: all tests pass — every test in `HomePageTests.cs` (11 methods: the original 8, Task 2's featured-card test, and this task's 2 new project tests), plus `BookCardTests.cs` and `StatCardTests.cs` from Tasks 1-2, unaffected.

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Home.razor tests/frontend/HomePageTests.cs
git commit -m "fix: wire Aktuelle Projekte section to the real Projects API"
```

---

## Task 4: Live verification against the real deployed backend

**Files:** none (manual verification pass, per this project's established pattern of live-verifying every phase against production before considering it done — see `documentation/Roadmap.md`'s entries for #349's phases).

- [ ] **Step 1: Deploy/run the frontend against the real backend**

Follow this repo's existing local-dev or deployed-preview flow (`dotnet run` against the live Cloudflare Worker backend, same pattern used throughout `documentation/Roadmap.md`'s "Live-verified" notes) — no new tooling needed.

- [ ] **Step 2: Verify the stat row**

Log in with a real account that has books/shelves/favorites. Confirm all four numbers on `/` match `/statistics`'s own numbers (same `dashboardService.ts` overview data) in both Classic Library and Dark Library themes.

- [ ] **Step 3: Verify the featured Weiterlesen card**

With at least 2 in-progress books, confirm the first `BookCard` renders visibly larger (14rem vs 10rem) and its progress line is a thin gold line (not the previous oxblood/gray fill) in both themes; confirm the remaining cards still show the fill unchanged (only `.book-card-large` was touched).

- [ ] **Step 4: Verify Aktuelle Projekte**

With zero projects: confirm the empty state shows and its "Projekt erstellen" button/link now actually navigates to `/projects` (previously a dead click). Create a real project, return to `/`: confirm it now appears as a real `ProjectCard`, matching the same card already used on `/projects` itself. Create 7+ projects: confirm only 6 show on the Dashboard plus an "Alle Projekte ansehen (N)" link, and that the link navigates to `/projects` and shows the true count.

- [ ] **Step 5: Regression pass**

Confirm Continue Reading's "Geliehen von {owner}" borrowed-book badge, the Recommendations section, and the recent-books grid all still render exactly as before this plan (no size/behavior change to any card besides the single featured one).

- [ ] **Step 6: Update `documentation/Roadmap.md`**

Add a "Dashboard Rework — Phase 1" entry following the existing per-phase format (bullet list of what shipped, test counts, "Live-verified against real production data (YYYY-MM-DD)" note) — same convention as every other completed phase in that file. Commit this alongside the PR that merges Phase 1.
