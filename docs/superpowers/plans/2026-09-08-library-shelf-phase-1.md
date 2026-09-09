# Library Rework Phase 1: Shelf Structure & Mechanic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library page's flat CSS grid with a modeled 3D bookshelf — books stand spine-out, rotate to reveal their cover on hover/focus, and are visually grouped into shelf rows driven by the page's existing sort/filter state — while preserving every existing Library capability exactly.

**Architecture:** Two new Blazor components (`ShelfBook`: the individual spine/cover 3D book, adapting `BookCard`'s existing data-loading/favorite/badge/progress logic; `ShelfRow`: the compartment + divider + row of `ShelfBook`s) plus one pure C# grouping helper (`LibraryShelfGrouping`), wired into `Library.razor` in place of its current flat-grid rendering branch. Phase 1 uses a plain CSS transition for the hover/focus reveal (no JS spring physics yet — that's Phase 2) and procedural (hash-based) spine coloring (no Canvas cover-color extraction yet — that's Phase 3, alongside real texture images).

**Tech Stack:** Blazor WebAssembly (.NET 10), CSS 3D transforms (`perspective`/`rotateY`/`translateZ`/`preserve-3d`), existing `BlobUrlService`/`ApiClient` patterns.

## Global Constraints

- **No new color tokens.** Every color derives from existing theme tokens (`--color-primary`, `--color-secondary`, `--color-bg-dark`, `--color-border`, `--color-text-primary`, etc.) via `var()`/`color-mix()`, verified across all 4 themes.
- **No functional regression anywhere in `Library.razor`.** Search (debounced, with suggestions), genre/tag filters, sort/order, favorites-only, clear-filters, pagination, the `EmptyState`/no-results/error states, and the List view mode must all continue to work exactly as they do today. `BookCard` itself is not modified — it stays in use elsewhere in the app (Home, Statistics, PublicProfile) unchanged.
- **Two real CSS 3D bugs, found and fixed during design-phase browser validation, are load-bearing implementation constraints — not optional style choices:**
  1. Every element between the `perspective`-establishing ancestor and the rotating book must carry `transform-style: preserve-3d`, or the 3D context flattens at that boundary and the rotation silently renders as a 2D distortion instead of a real turn.
  2. The hover/focus transform must list `rotateY` last (rightmost) in the transform function list, after `translateY`/`translateZ` (CSS applies the rightmost function first) — this rotates in the book's own local frame first, then translates toward the viewer in the resulting world frame. Listing `rotateY` before the translates was tried and visibly failed (the book appeared to slide sideways instead of turning) during design validation. (Corrected during final review: an earlier version of this sentence had the ordering backwards in the prose even though the actual implemented CSS was always correct — see `.shelf-book:hover` in `app.css`, which lists `translateY`/`translateZ` first and `rotateY` last.)
- **Shelf groupings are visual-only**, derived from the current sort/filter state (recency buckets when sorted by date, alphabetical when sorted by title/author, the active filter name when a single genre/tag filter is active). They must **never** be confused with or replace the app's separate, real `/library/shelves` feature (`Shelf` model, `Shelves.razor`, `ShelfDetail.razor`) — that feature is untouched by this plan.
- **Accessibility is a hard requirement, not a follow-up.** `:focus-visible` must trigger the identical reveal as `:hover`. Every book's title (and author, when present) must be available as its accessible name via `aria-label` on the book's root link, regardless of the book's current visual rotation state — a screen reader must never depend on which face is currently "facing" the viewer.
- **`prefers-reduced-motion: reduce` must disable the CSS transition** (instant state change on hover/focus, not removed capability) — matches the project-wide standing rule already applied elsewhere (`app.css:205`, `motion.js`'s `prefersReducedMotion()`).
- **Do not implement JS spring physics or dynamic neighbor-parting in this plan** — both are explicitly Phase 2. Do not implement Canvas-based cover-color extraction or add real texture images — both are explicitly Phase 3. Phase 1 ships with a plain CSS transition and hash-based procedural spine coloring; a `ShelfBook`-slot wrapper element is included specifically so Phase 2 can add an independent neighbor-offset transform later without restructuring the DOM — do not remove or simplify it away even though it does nothing visible yet in Phase 1.

---

### Task 1: `ShelfBook` Component

**Files:**
- Create: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`
- Create: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (new `.shelf-book*` rules)
- Test: `tests/frontend/ShelfBookTests.cs`

**Interfaces:**
- Consumes: `LuminaChronica.Client.Models.Book` (existing, unchanged — `Id`, `Title`, `Author`, `CoverUrl`, `IsFavorite`), `ApiClient.GetBytesAsync`/`DeleteAsync`/`PostAsync`, `BlobUrlService.CreateObjectUrlAsync`/`RevokeObjectUrlAsync` (all existing, exact same methods `BookCard.razor.cs` already uses — do not guess different signatures, copy the proven pattern).
- Produces: `ShelfBook` component with parameters `Book` (required), `ProgressPercentage` (`double?`, optional), `Href` (`string?`, optional override), `ShowFavorite` (`bool`, default `true`), `OwnerUsername` (`string?`, optional) — deliberately the same parameter surface as `BookCard`, for later reuse consistency, even though Task 4's actual `Library.razor` call sites only use `Book`. Later tasks consume this as `<ShelfBook Book="book" />`.

**Context — `BookCard`'s exact existing implementation this task adapts** (read `frontend/LuminaChronica.Client/Components/BookCard/BookCard.razor.cs` yourself to confirm before starting — the code below is a direct copy of its proven logic, not a guess):

```csharp
private string? _coverObjectUrl;
private string? _loadedCoverUrl;
private bool _isFavorite;
private int? _loadedBookId;

protected override async Task OnParametersSetAsync()
{
    if (Book.Id != _loadedBookId)
    {
        _loadedBookId = Book.Id;
        _isFavorite = Book.IsFavorite;
    }

    if (Book.CoverUrl == _loadedCoverUrl) return;

    if (_coverObjectUrl is not null)
    {
        await BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
        _coverObjectUrl = null;
    }

    _loadedCoverUrl = Book.CoverUrl;
    if (Book.CoverUrl is null) return;

    var result = await ApiClient.GetBytesAsync(Book.CoverUrl);
    if (result is { } cover)
    {
        _coverObjectUrl = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
    }
}

private async Task ToggleFavoriteAsync()
{
    var wasFavorite = _isFavorite;
    _isFavorite = !wasFavorite;

    var succeeded = wasFavorite
        ? await ApiClient.DeleteAsync($"/api/books/{Book.Id}/favorite")
        : await ApiClient.PostAsync($"/api/books/{Book.Id}/favorite");

    if (!succeeded)
    {
        _isFavorite = wasFavorite;
    }
}
```

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/ShelfBookTests.cs`:

```csharp
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfBookTests : BunitContext
{
    public ShelfBookTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    private static Book MakeBook() => new() { Id = 1, Title = "The Hobbit", Author = "J.R.R. Tolkien", CoverUrl = null };

    [Fact]
    public void ShelfBook_RendersAccessibleLabelWithTitleAndAuthor()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("The Hobbit, J.R.R. Tolkien", cut.Find("a.shelf-book").GetAttribute("aria-label"));
    }

    [Fact]
    public void ShelfBook_NoAuthor_AccessibleLabelIsTitleOnly()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, new Book { Id = 2, Title = "Anonymous Work" }));

        Assert.Equal("Anonymous Work", cut.Find("a.shelf-book").GetAttribute("aria-label"));
    }

    [Fact]
    public void ShelfBook_LinksToBookDetailPage()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("library/books/1", cut.Find("a.shelf-book").GetAttribute("href"));
    }

    [Fact]
    public void ShelfBook_SpineAndCoverTitleText_AreAriaHidden()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("true", cut.Find(".shelf-book-spine-title").GetAttribute("aria-hidden"));
        Assert.Equal("true", cut.Find(".shelf-book-cover-title").GetAttribute("aria-hidden"));
    }

    [Fact]
    public void ShelfBook_FavoriteToggle_CallsPostAndFlipsVisualState()
    {
        HttpRequestMessage? capturedRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().When(r =>
        {
            capturedRequest = r;
            return true;
        }, _ => RoutedFakeHttpMessageHandler.JsonResponse("{}"));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);

        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.DoesNotContain("is-favorite", cut.Find("button.shelf-book-favorite").ClassList);

        cut.Find("button.shelf-book-favorite").Click();

        Assert.Equal(HttpMethod.Post, capturedRequest?.Method);
        Assert.Equal("/api/books/1/favorite", capturedRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("is-favorite", cut.Find("button.shelf-book-favorite").ClassList);
    }

    [Fact]
    public void ShelfBook_ShowFavoriteFalse_HidesFavoriteButton()
    {
        var cut = Render<ShelfBook>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.ShowFavorite, false));

        Assert.Empty(cut.FindAll("button.shelf-book-favorite"));
    }

    [Fact]
    public void ShelfBook_OwnerUsername_RendersBorrowedBadge()
    {
        var cut = Render<ShelfBook>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.OwnerUsername, "bob"));

        Assert.Contains("Geliehen von bob", cut.Find(".shelf-book-borrowed-badge").TextContent);
    }

    [Fact]
    public void ShelfBook_ProgressPercentage_RendersProgressBarWidth()
    {
        var cut = Render<ShelfBook>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.ProgressPercentage, 42.0));

        Assert.Contains("width: 42%", cut.Find(".shelf-book-progress-bar").GetAttribute("style"));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter ShelfBookTests`
Expected: FAIL — `ShelfBook` type does not exist yet.

- [ ] **Step 3: Create `ShelfBook.razor`**

```razor
@namespace LuminaChronica.Client.Components
@implements IDisposable
@inject ApiClient ApiClient
@inject BlobUrlService BlobUrlService

<a class="shelf-book shelf-book-palette-@(Book.Id % 5)"
   style="--shelf-book-rest: @(RestRotation.ToString(System.Globalization.CultureInfo.InvariantCulture))deg"
   href="@(Href ?? $"library/books/{Book.Id}")"
   aria-label="@AccessibleLabel">
    <span class="shelf-book-spine">
        <span class="shelf-book-spine-title" aria-hidden="true">@Book.Title</span>
    </span>
    <span class="shelf-book-cover">
        @if (_coverObjectUrl is not null)
        {
            <img src="@_coverObjectUrl" alt="" aria-hidden="true" />
        }
        else
        {
            <span class="shelf-book-cover-placeholder" aria-hidden="true"></span>
        }
        <span class="shelf-book-cover-title" aria-hidden="true">@Book.Title</span>
        @if (!string.IsNullOrWhiteSpace(Book.Author))
        {
            <span class="shelf-book-cover-author" aria-hidden="true">@Book.Author</span>
        }
        @if (ShowFavorite)
        {
            <button type="button" class="shelf-book-favorite @(_isFavorite ? "is-favorite" : "")"
                    title="@(_isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen")"
                    @onclick="ToggleFavoriteAsync" @onclick:stopPropagation="true" @onclick:preventDefault="true">
                @(_isFavorite ? "★" : "☆")
            </button>
        }
        @if (OwnerUsername is { } ownerUsername)
        {
            <span class="shelf-book-borrowed-badge" title="@($"Geteiltes Buch von {ownerUsername}")">Geliehen von @ownerUsername</span>
        }
        @if (ProgressPercentage is { } progress)
        {
            <span class="shelf-book-progress">
                <span class="shelf-book-progress-bar" style="width: @(progress)%"></span>
            </span>
        }
    </span>
</a>
```

Note: no `@using` needed for `LuminaChronica.Client.Models` (for `Book`, used in the code-behind) — `_Imports.razor` already provides it project-wide; confirm this yourself by checking `frontend/LuminaChronica.Client/_Imports.razor` before adding anything.

- [ ] **Step 4: Create `ShelfBook.razor.cs`**

```csharp
using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class ShelfBook : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Book Book { get; set; } = null!;

    [Parameter]
    public double? ProgressPercentage { get; set; }

    [Parameter]
    public string? Href { get; set; }

    [Parameter]
    public bool ShowFavorite { get; set; } = true;

    [Parameter]
    public string? OwnerUsername { get; set; }

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;
    private bool _isFavorite;
    private int? _loadedBookId;

    // Tight-banded resting rotation only (no combined rotateZ lean) --
    // wider variation combined with a simultaneous tilt read as a
    // "chaotic zigzag" during design validation, not natural shelf
    // clutter. Deterministic per book (not random) so it stays stable
    // across re-renders without needing any shared/coordinated state
    // with the parent ShelfRow.
    private double RestRotation => -9.5 - (Book.Id % 5) * 0.7;

    private string AccessibleLabel => string.IsNullOrWhiteSpace(Book.Author)
        ? Book.Title
        : $"{Book.Title}, {Book.Author}";

    protected override async Task OnParametersSetAsync()
    {
        if (Book.Id != _loadedBookId)
        {
            _loadedBookId = Book.Id;
            _isFavorite = Book.IsFavorite;
        }

        if (Book.CoverUrl == _loadedCoverUrl) return;

        if (_coverObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
            _coverObjectUrl = null;
        }

        _loadedCoverUrl = Book.CoverUrl;
        if (Book.CoverUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Book.CoverUrl);
        if (result is { } cover)
        {
            _coverObjectUrl = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
        }
    }

    private async Task ToggleFavoriteAsync()
    {
        var wasFavorite = _isFavorite;
        _isFavorite = !wasFavorite;

        var succeeded = wasFavorite
            ? await ApiClient.DeleteAsync($"/api/books/{Book.Id}/favorite")
            : await ApiClient.PostAsync($"/api/books/{Book.Id}/favorite");

        if (!succeeded)
        {
            _isFavorite = wasFavorite;
        }
    }

    public void Dispose()
    {
        if (_coverObjectUrl is not null)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
        }
    }
}
```

Do **not** add `[Inject]` properties for `ApiClient`/`BlobUrlService` here — the `@inject` directives in `ShelfBook.razor` (Step 3) already generate them on this same partial class; adding `[Inject]` again would conflict. This matches `BookCard.razor.cs`'s real code exactly (verify by reading it).

- [ ] **Step 5: Add the CSS**

Add to `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, in a new section near the existing `.library-*` rules:

```css
/* ShelfBook: books stand spine-out at rest, rotate ~90 deg on hover/
   focus to reveal the cover. Two load-bearing rules learned from live
   3D-transform validation during design (see plan Global Constraints):
   (1) every element between the perspective-establishing ancestor
   (.shelf-books, see ShelfRow) and this element needs
   transform-style: preserve-3d, or the rotation flattens into a 2D
   distortion; (2) the hover transform lists rotateY LAST (after
   translateY/translateZ) -- CSS applies the rightmost function first, so
   this rotates in the book's own local frame first, then moves toward
   the viewer in the resulting world frame. Listing rotateY before the
   translates was tried and visibly failed (the book appeared to slide
   sideways instead of turning). */
.shelf-book {
    display: block;
    width: 3.25rem;
    height: 9.5rem;
    position: relative;
    text-decoration: none;
    cursor: pointer;
    transform-style: preserve-3d;
    transform-origin: bottom center;
    transform: rotateY(var(--shelf-book-rest));
    transition: transform var(--motion-reveal) var(--ease-standard);
}

.shelf-book-spine,
.shelf-book-cover {
    position: absolute;
    inset: 0;
    border-radius: 0.15rem 0.3rem 0.3rem 0.15rem;
    backface-visibility: hidden;
    box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.4);
    overflow: hidden;
}

.shelf-book-spine {
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-rl;
}

.shelf-book-spine-title {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: rgba(242, 233, 216, 0.85);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    max-height: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
}

.shelf-book-cover {
    transform: rotateY(90deg) translateZ(1.6rem);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0.5rem;
    gap: 0.15rem;
    color: #f2e9d8;
    /* Only clickable once actually revealed -- at rest this face is
       edge-on (a thin sliver visually) but still occupies its full
       bounding box in the DOM, so without this the favorite button
       inside it could be spuriously clickable while barely visible. */
    pointer-events: none;
}

.shelf-book:hover .shelf-book-cover,
.shelf-book:focus-visible .shelf-book-cover {
    pointer-events: auto;
}

.shelf-book-cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.shelf-book-cover-placeholder {
    position: absolute;
    inset: 0;
}

.shelf-book-cover-title,
.shelf-book-cover-author {
    position: relative;
    font-size: 0.65rem;
    line-height: 1.2;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.shelf-book-cover-title { font-weight: 600; }
.shelf-book-cover-author { font-size: 0.6rem; opacity: 0.85; }

.shelf-book-favorite {
    position: relative;
    align-self: flex-end;
    background: none;
    border: none;
    color: #f2e9d8;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.15rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.shelf-book-favorite.is-favorite { color: var(--color-primary); }

.shelf-book-borrowed-badge {
    position: relative;
    font-size: 0.55rem;
    background: rgba(0, 0, 0, 0.5);
    padding: 0.1rem 0.3rem;
    border-radius: 0.15rem;
    align-self: flex-start;
}

.shelf-book-progress {
    position: relative;
    height: 0.2rem;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 0.1rem;
    overflow: hidden;
}
.shelf-book-progress-bar {
    height: 100%;
    background: var(--color-primary);
}

/* Procedural placeholder palette (Phase 1 only -- replaced by real
   cover-derived color extraction in Phase 3). Muted, theme-appropriate
   hues per the design spec's palette (bordeaux, green, brass, blue,
   brown), each as a gradient plus a matching cover-face tint. */
.shelf-book-palette-0 .shelf-book-spine,
.shelf-book-palette-0 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-secondary) 85%, white 10%), color-mix(in srgb, var(--color-secondary) 70%, black 30%)); }
.shelf-book-palette-1 .shelf-book-spine,
.shelf-book-palette-1 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, #2f4a3d 85%, white 10%), color-mix(in srgb, #2f4a3d 70%, black 30%)); }
.shelf-book-palette-2 .shelf-book-spine,
.shelf-book-palette-2 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 85%, white 10%), color-mix(in srgb, var(--color-primary) 70%, black 30%)); }
.shelf-book-palette-3 .shelf-book-spine,
.shelf-book-palette-3 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, #3d4a6e 85%, white 10%), color-mix(in srgb, #3d4a6e 70%, black 30%)); }
.shelf-book-palette-4 .shelf-book-spine,
.shelf-book-palette-4 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-secondary) 70%, var(--color-primary) 20%), color-mix(in srgb, var(--color-secondary) 55%, black 30%)); }

.shelf-book:hover,
.shelf-book:focus-visible {
    transform: translateY(-1.4rem) translateZ(3.6rem) rotateY(-88deg) scale(1.08);
    z-index: 5;
}

@media (prefers-reduced-motion: reduce) {
    .shelf-book {
        transition: none;
    }
}
```

Do not add `outline: none` to the hover/focus-visible rule — the existing global `:focus-visible` outline rule (`app.css`, search for `:focus-visible`) already covers `a` elements and must keep composing on top of this transform, not be suppressed (removing it would break keyboard-focus visibility, which this same plan's Global Constraints require).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter ShelfBookTests`
Expected: all pass.

- [ ] **Step 7: Run the full frontend suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: all existing tests still pass (this task only adds new files, touches no existing markup/logic).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/ShelfBookTests.cs
git commit -m "Add ShelfBook component: spine/cover 3D book with hover/focus reveal"
```

---

### Task 2: `ShelfRow` Component

**Files:**
- Create: `frontend/LuminaChronica.Client/Components/ShelfRow/ShelfRow.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (new `.shelf-row-group`/`.shelf-plaque`/`.shelf-compartment`/`.shelf-books`/`.shelf-book-slot`/`.shelf-lip` rules)
- Test: `tests/frontend/ShelfRowTests.cs`

**Interfaces:**
- Consumes: `ShelfBook` (from Task 1, exact parameter `Book`), `LuminaChronica.Client.Models.Book`.
- Produces: `ShelfRow` component with parameters `Label` (`string?`, optional — omit the divider plaque when null/empty) and `Books` (`IReadOnlyList<Book>`, required). Task 4 consumes this as `<ShelfRow Label="@group.Label" Books="group.Books" />`.

**Context**: each book renders inside a `.shelf-book-slot` wrapper `<div>` with `transform-style: preserve-3d`. This wrapper does nothing visible in Phase 1 (it exists purely so Phase 2 can later apply an independent neighbor-parting `translateX` to it without restructuring the DOM or re-deriving the preserve-3d chain) — do not skip it or "simplify" it away, and do not implement any parting behavior on it yet, per this plan's Global Constraints.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/ShelfRowTests.cs`:

```csharp
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfRowTests : BunitContext
{
    public ShelfRowTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    private static List<Book> MakeBooks(int count) =>
        Enumerable.Range(1, count).Select(i => new Book { Id = i, Title = $"Book {i}" }).ToList();

    [Fact]
    public void ShelfRow_RendersOneShelfBookPerBook()
    {
        var cut = Render<ShelfRow>(parameters => parameters.Add(p => p.Books, MakeBooks(3)));

        Assert.Equal(3, cut.FindAll("a.shelf-book").Count);
    }

    [Fact]
    public void ShelfRow_WithLabel_RendersPlaque()
    {
        var cut = Render<ShelfRow>(parameters => parameters
            .Add(p => p.Books, MakeBooks(1))
            .Add(p => p.Label, "Fantasy"));

        Assert.Contains("Fantasy", cut.Find(".shelf-plaque").TextContent);
    }

    [Fact]
    public void ShelfRow_WithoutLabel_RendersNoPlaque()
    {
        var cut = Render<ShelfRow>(parameters => parameters.Add(p => p.Books, MakeBooks(1)));

        Assert.Empty(cut.FindAll(".shelf-plaque"));
    }

    [Fact]
    public void ShelfRow_EachBookWrappedInPreserve3dSlot()
    {
        var cut = Render<ShelfRow>(parameters => parameters.Add(p => p.Books, MakeBooks(2)));

        Assert.Equal(2, cut.FindAll(".shelf-book-slot").Count);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter ShelfRowTests`
Expected: FAIL — `ShelfRow` type does not exist yet.

- [ ] **Step 3: Create `ShelfRow.razor`**

```razor
@namespace LuminaChronica.Client.Components

<div class="shelf-row-group">
    @if (!string.IsNullOrWhiteSpace(Label))
    {
        <span class="shelf-plaque">@Label</span>
    }
    <div class="shelf-compartment">
        <div class="shelf-books">
            @foreach (var book in Books)
            {
                <div class="shelf-book-slot">
                    <ShelfBook Book="book" />
                </div>
            }
        </div>
        <div class="shelf-lip"></div>
    </div>
</div>

@code {
    [Parameter]
    public string? Label { get; set; }

    [Parameter, EditorRequired]
    public IReadOnlyList<Book> Books { get; set; } = [];
}
```

- [ ] **Step 4: Add the CSS**

Add to `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, immediately before or after Task 1's `.shelf-book*` rules:

```css
.shelf-row-group {
    margin-top: var(--space-3);
}
.shelf-row-group:first-child {
    margin-top: 0;
}

.shelf-plaque {
    display: inline-block;
    background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 85%, white), color-mix(in srgb, var(--color-primary) 75%, black));
    color: var(--color-bg-dark);
    font-family: var(--font-family-display);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.8rem;
    border-radius: 0.15rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    margin-bottom: var(--space-2);
    letter-spacing: 0.03em;
}

.shelf-compartment {
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-dark) 90%, black), var(--color-bg-dark));
    border-radius: var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius)) 0.15rem 0.15rem;
    box-shadow: inset 0 10px 18px rgba(0, 0, 0, 0.5), inset 0 -2px 0 rgba(0, 0, 0, 0.3);
    padding: var(--space-3) var(--space-3) 0;
    position: relative;
}

.shelf-books {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding-bottom: var(--space-2);
    perspective: 60rem;
}

.shelf-book-slot {
    transform-style: preserve-3d;
}

.shelf-lip {
    height: 1rem;
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 85%, white) 0%, var(--color-primary) 45%, color-mix(in srgb, var(--color-primary) 70%, black) 100%);
    border-radius: 0 0 var(--radius) var(--radius);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter ShelfRowTests`
Expected: all pass.

- [ ] **Step 6: Run the full frontend suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: all existing tests plus Task 1's and this task's new tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfRow/ShelfRow.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/ShelfRowTests.cs
git commit -m "Add ShelfRow component: shelf compartment with divider plaque and book row"
```

---

### Task 3: `LibraryShelfGrouping` Helper

**Files:**
- Create: `frontend/LuminaChronica.Client/Models/LibraryShelfGrouping.cs`
- Test: `tests/frontend/LibraryShelfGroupingTests.cs`

**Interfaces:**
- Consumes: `LuminaChronica.Client.Models.Book` (existing — `CreatedAt` is `string`, ISO-ish date text; `Title`, `Author` are `string`/`string?`).
- Produces: `BookGroup` record (`string? Label`, `List<Book> Books`) and `static class LibraryShelfGrouping` with `static List<BookGroup> Group(IReadOnlyList<Book> books, string sortKey, IReadOnlyList<string> genreFilters, IReadOnlyList<string> tagFilters)`. Task 4 consumes this directly: `LibraryShelfGrouping.Group(_result.Items, _sort, _genreFilters, _tagFilters)`.

**Context**: deliberately named `BookGroup`/`LibraryShelfGrouping`, not `Shelf`/`ShelfGroup` — the app already has a real `Shelf` model (`frontend/LuminaChronica.Client/Models/Shelf.cs`, the user's own named collections, a separate feature at `/library/shelves`). This plan's visual shelf-row grouping is unrelated to that feature (see this plan's Global Constraints) and must not share confusingly similar type names with it.

This helper operates only on the current page's already-fetched, already-server-sorted `List<Book>` (the existing 20-per-page pagination, unchanged) — it does not re-sort or re-fetch anything, only buckets the given list into named groups for shelf-row rendering.

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/LibraryShelfGroupingTests.cs`:

```csharp
using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryShelfGroupingTests
{
    private static Book MakeBook(int id, string title, string? author = null, string createdAt = "2026-01-01T00:00:00Z") =>
        new() { Id = id, Title = title, Author = author, CreatedAt = createdAt };

    [Fact]
    public void Group_EmptyList_ReturnsEmpty()
    {
        var result = LibraryShelfGrouping.Group([], "createdAt", [], []);

        Assert.Empty(result);
    }

    [Fact]
    public void Group_SingleGenreFilterActive_ReturnsOneGroupLabeledWithGenre()
    {
        var books = new List<Book> { MakeBook(1, "A"), MakeBook(2, "B") };

        var result = LibraryShelfGrouping.Group(books, "createdAt", ["Fantasy"], []);

        var group = Assert.Single(result);
        Assert.Equal("Fantasy", group.Label);
        Assert.Equal(2, group.Books.Count);
    }

    [Fact]
    public void Group_SingleTagFilterActive_ReturnsOneGroupLabeledWithTag()
    {
        var books = new List<Book> { MakeBook(1, "A") };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], ["Lieblingsbücher"]);

        var group = Assert.Single(result);
        Assert.Equal("Lieblingsbücher", group.Label);
    }

    [Fact]
    public void Group_SortedByTitle_GroupsAlphabeticallyByFirstLetter()
    {
        var books = new List<Book> { MakeBook(1, "Apple"), MakeBook(2, "Banana"), MakeBook(3, "Avocado") };

        var result = LibraryShelfGrouping.Group(books, "title", [], []);

        Assert.Equal(2, result.Count);
        Assert.Equal("A", result[0].Label);
        Assert.Equal(2, result[0].Books.Count);
        Assert.Equal("B", result[1].Label);
        Assert.Single(result[1].Books);
    }

    [Fact]
    public void Group_SortedByAuthor_FallsBackToTitleWhenAuthorMissing()
    {
        var books = new List<Book> { MakeBook(1, "Zebra", author: null) };

        var result = LibraryShelfGrouping.Group(books, "author", [], []);

        var group = Assert.Single(result);
        Assert.Equal("Z", group.Label);
    }

    [Fact]
    public void Group_SortedByCreatedAt_BucketsIntoRecencyGroups()
    {
        var today = DateTime.UtcNow;
        var books = new List<Book>
        {
            MakeBook(1, "Recent", createdAt: today.ToString("O")),
            MakeBook(2, "Old", createdAt: today.AddYears(-2).ToString("O")),
        };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], []);

        Assert.Contains(result, g => g.Label == "Diese Woche" && g.Books.Count == 1);
        Assert.Contains(result, g => g.Label == "Älter" && g.Books.Count == 1);
    }

    [Fact]
    public void Group_UnparsableCreatedAt_FallsBackToOlderBucket()
    {
        var books = new List<Book> { MakeBook(1, "Broken", createdAt: "not-a-date") };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], []);

        var group = Assert.Single(result);
        Assert.Equal("Älter", group.Label);
    }

    [Fact]
    public void Group_EmptyBucketsAreOmitted()
    {
        var books = new List<Book> { MakeBook(1, "Recent", createdAt: DateTime.UtcNow.ToString("O")) };

        var result = LibraryShelfGrouping.Group(books, "createdAt", [], []);

        Assert.DoesNotContain(result, g => g.Books.Count == 0);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter LibraryShelfGroupingTests`
Expected: FAIL — `LibraryShelfGrouping`/`BookGroup` do not exist yet.

- [ ] **Step 3: Create `LibraryShelfGrouping.cs`**

```csharp
namespace LuminaChronica.Client.Models;

public record BookGroup(string? Label, List<Book> Books);

public static class LibraryShelfGrouping
{
    public static List<BookGroup> Group(
        IReadOnlyList<Book> books,
        string sortKey,
        IReadOnlyList<string> genreFilters,
        IReadOnlyList<string> tagFilters)
    {
        if (books.Count == 0)
        {
            return [];
        }

        if (genreFilters.Count == 1)
        {
            return [new BookGroup(genreFilters[0], books.ToList())];
        }

        if (tagFilters.Count == 1)
        {
            return [new BookGroup(tagFilters[0], books.ToList())];
        }

        return sortKey switch
        {
            "title" or "author" => GroupAlphabetically(books, sortKey),
            _ => GroupByRecency(books),
        };
    }

    private static List<BookGroup> GroupAlphabetically(IReadOnlyList<Book> books, string sortKey)
    {
        return books
            .GroupBy(b => FirstLetter(sortKey == "title" ? b.Title : b.Author ?? b.Title))
            .Select(g => new BookGroup(g.Key, g.ToList()))
            .ToList();
    }

    private static string FirstLetter(string value)
    {
        var trimmed = value.TrimStart();
        return trimmed.Length == 0 ? "#" : char.ToUpperInvariant(trimmed[0]).ToString();
    }

    private static List<BookGroup> GroupByRecency(IReadOnlyList<Book> books)
    {
        var today = DateTime.UtcNow.Date;
        var buckets = new (string Label, List<Book> Books)[]
        {
            ("Diese Woche", []),
            ("Diesen Monat", []),
            ("Dieses Jahr", []),
            ("Älter", []),
        };

        foreach (var book in books)
        {
            if (!DateTime.TryParse(book.CreatedAt, out var createdAt))
            {
                buckets[^1].Books.Add(book);
                continue;
            }

            var ageDays = (today - createdAt.Date).TotalDays;
            var bucketIndex = ageDays switch
            {
                <= 7 => 0,
                <= 31 => 1,
                <= 365 => 2,
                _ => 3,
            };
            buckets[bucketIndex].Books.Add(book);
        }

        return buckets
            .Where(b => b.Books.Count > 0)
            .Select(b => new BookGroup(b.Label, b.Books))
            .ToList();
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter LibraryShelfGroupingTests`
Expected: all pass.

- [ ] **Step 5: Run the full frontend suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: all existing tests plus Tasks 1/2/3's new tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/Models/LibraryShelfGrouping.cs tests/frontend/LibraryShelfGroupingTests.cs
git commit -m "Add LibraryShelfGrouping: visual shelf-row bucketing by sort/filter state"
```

---

### Task 4: `Library.razor` Integration

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (header band re-skin, `.library-shelf` wrapper)
- Modify: `tests/frontend/LibraryPageTests.cs` (verify grep first — see Step 1)

**Interfaces:**
- Consumes: `ShelfRow` (Task 2), `LibraryShelfGrouping.Group` (Task 3), the existing `_result`, `_sort`, `_genreFilters`, `_tagFilters`, `_viewMode` fields already in `Library.razor` (unchanged names/types).
- Produces: nothing consumed by a later task — this is the last task in this plan.

**Context — current rendering branch being replaced** (`Library.razor`, search for `library-grid`):

```razor
<div class="@(_viewMode == LibraryViewMode.Grid ? "library-grid" : "library-list")">
    @foreach (var book in _result.Items)
    {
        <BookCard Book="book" Size="@(_viewMode == LibraryViewMode.Grid ? BookCardSize.Normal : BookCardSize.Small)" />
    }
</div>
```

**Current header/toolbar** (`Library.razor`, top of the file, search for `library-header`):

```razor
<div class="library-header">
    <h1>Bibliothek</h1>
    <div class="form-actions">
        <a class="btn" href="library/shelves">Regale</a>
        <a class="btn btn-primary" href="library/upload">Buch hinzufügen</a>
    </div>
</div>
```

**Current view-toggle buttons** (`Library.razor`, search for `library-view-toggle`):

```razor
<div class="library-view-toggle">
    <button type="button" class="btn @(_viewMode == LibraryViewMode.Grid ? "btn-primary" : "")" @onclick='() => SetViewMode(LibraryViewMode.Grid)'>Raster</button>
    <button type="button" class="btn @(_viewMode == LibraryViewMode.List ? "btn-primary" : "")" @onclick='() => SetViewMode(LibraryViewMode.List)'>Liste</button>
</div>
```

- [ ] **Step 1: Verify test coupling before changing markup**

Run: `grep -n "library-grid\|Raster\|BookCardSize.Normal" tests/frontend/LibraryPageTests.cs`

If this returns matches asserting on the `library-grid` class name, the literal button text "Raster", or `BookCardSize.Normal` being passed to a `BookCard` in this page's tests, note them now — they will need updating in Step 5, since the grid-mode branch is being replaced with shelf rendering and the button label changes to "Regal". Do not skip this check and discover the breakage later.

- [ ] **Step 2: Change the view-toggle button label**

In `Library.razor`, change:
```razor
<button type="button" class="btn @(_viewMode == LibraryViewMode.Grid ? "btn-primary" : "")" @onclick='() => SetViewMode(LibraryViewMode.Grid)'>Raster</button>
```
to:
```razor
<button type="button" class="btn @(_viewMode == LibraryViewMode.Grid ? "btn-primary" : "")" @onclick='() => SetViewMode(LibraryViewMode.Grid)'>Regal</button>
```
Only the visible label text changes — the `LibraryViewMode.Grid` enum member name, the `_viewMode` field, and `SetViewMode` all stay exactly as they are (renaming the enum value is unnecessary churn with no user-visible benefit, per this plan's YAGNI stance — it's an internal identifier, not UI text).

- [ ] **Step 3: Replace the grid-mode rendering branch**

Replace:
```razor
<div class="@(_viewMode == LibraryViewMode.Grid ? "library-grid" : "library-list")">
    @foreach (var book in _result.Items)
    {
        <BookCard Book="book" Size="@(_viewMode == LibraryViewMode.Grid ? BookCardSize.Normal : BookCardSize.Small)" />
    }
</div>
```
with:
```razor
@if (_viewMode == LibraryViewMode.Grid)
{
    <div class="library-shelf">
        @foreach (var group in LibraryShelfGrouping.Group(_result.Items, _sort, _genreFilters, _tagFilters))
        {
            <ShelfRow Label="@group.Label" Books="group.Books" />
        }
    </div>
}
else
{
    <div class="library-list">
        @foreach (var book in _result.Items)
        {
            <BookCard Book="book" Size="BookCardSize.Small" />
        }
    </div>
}
```
No new `@using` needed — `LuminaChronica.Client.Models` and `LuminaChronica.Client.Components` are both already provided globally via `_Imports.razor` (confirm this yourself before assuming it, per this plan's established practice of verifying rather than guessing).

- [ ] **Step 4: Re-skin the header band**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, find the existing `.library-header` rule (currently just flex layout, no visual treatment) and add a textured band treatment to it — do not rename the class or restructure `Library.razor`'s header markup, only add declarations to the existing selector:

```css
.library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4, 2rem);
    background: linear-gradient(160deg, color-mix(in srgb, var(--color-bg-dark) 92%, var(--color-primary) 8%), var(--color-bg-dark));
    border-radius: var(--radius-lg, var(--radius));
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: var(--color-text-on-dark, #f2e9d8);
}

.library-header h1 {
    color: inherit;
    font-family: var(--font-family-display);
}
```

Also add the new `.library-shelf` wrapper (a simple vertical stack — `ShelfRow` handles its own internal layout, this just spaces multiple rows apart, matching `.shelf-row-group`'s own `margin-top` from Task 2 rather than duplicating spacing logic here):

```css
.library-shelf {
    display: flex;
    flex-direction: column;
}
```

Check `--color-text-on-dark` actually exists as a token before using it (it was referenced in this session's memory of the Classic Library theme file, `themes/classic-library.css`) — if a theme is missing it, use a `color-mix()` fallback consistent with how other rules in this file handle optional tokens (e.g. `var(--radius-lg, var(--radius))`'s fallback pattern already used elsewhere in this file).

- [ ] **Step 5: Fix any test coupling found in Step 1**

If Step 1 found assertions on `library-grid`, the literal "Raster" button text, or `BookCardSize.Normal` in grid mode, update them now to match the new shelf-based rendering (e.g. asserting on `.library-shelf`/`.shelf-book` presence instead of `.library-grid`/`.book-card`, and "Regal" instead of "Raster"). If Step 1 found no such coupling, state that explicitly rather than silently skipping this step.

- [ ] **Step 6: Build and run the full test suite**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success.
Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all tests passing, including Tasks 1-3's new tests and any Step 5 fixes.

- [ ] **Step 7: Live-visual verification across all four themes**

Using the established technique (JWT + `window.fetch` intercept against a local dev server, SPA-internal navigation to preserve the patched `fetch` across theme switches — mock `/api/books` and `/api/books/facets` with a realistic multi-book response, since this page's own endpoints differ from Statistics's):

1. Confirm the shelf renders (compartments, divider plaques, spine-out books) in all 4 themes, with no new-color-token violations (every color should trace back to existing tokens).
2. Hover several books — confirm the reveal rotation works correctly (cover becomes readable, not a sideways slide — the exact regression class the Global Constraints call out), the favorite star and any borrowed-badge/progress-bar are visible and clickable once revealed, and clicking a revealed book's cover area navigates to its detail page.
3. Tab through the shelf with the keyboard — confirm `:focus-visible` triggers the identical reveal, the browser's focus outline is still visible (not suppressed), and Enter navigates.
4. Toggle `prefers-reduced-motion` (devtools) — confirm the reveal still happens on hover/focus but instantly, no animated transition.
5. Confirm search, genre/tag filters, sort, favorites-only, clear-filters, and pagination all still work exactly as before, and that switching to List view still shows the original compact `BookCard` list unaffected by any of this.
6. Confirm shelf groupings change sensibly when the sort key changes (date → recency buckets, title/author → alphabetical) and when a single genre/tag filter is active (labeled by that filter).

Document any theme or interaction where something doesn't read correctly as a concern in the task report rather than silently proceeding.

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Library.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/LibraryPageTests.cs
git commit -m "Wire ShelfRow/ShelfBook into Library.razor, replacing the flat grid view"
```

- [ ] **Step 9: Add a Roadmap.md entry**

Append a new entry to `documentation/Roadmap.md`, in the same established style as prior Dashboard/Statistics phase entries (find the most recent one — "Statistics Visuals Round 2" — and match its structure/tone). Cover: what shipped (shelf structure, spine/cover reveal mechanic and the two real CSS 3D bugs found/fixed during design validation, visual grouping, preserved existing functionality, accessibility), what's explicitly deferred to Phase 2 (spring physics, neighbor-parting) and Phase 3 (real textures, cover-derived spine color), the test results, and the live-verification results from Step 7 including any open concerns.

```bash
git add documentation/Roadmap.md
git commit -m "Document Library Rework Phase 1 in Roadmap"
```
