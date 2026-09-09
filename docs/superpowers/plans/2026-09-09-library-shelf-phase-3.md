# Library Rework Phase 3: Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's gradient-only shelf/book materials with real wood/leather texture images (already landed as assets), and replace the current procedural per-book palette with a spine color extracted at runtime from each book's actual cover image via an offscreen Canvas.

**Architecture:** Two independent, additive changes with no shared code or file-conflict risk beyond both touching `app.css` in different, non-overlapping rule blocks: (1) two low-opacity `::before` texture overlays following the exact established `brass-texture.webp`/`.goal-ring::before` pattern already in this codebase, and (2) a new small JS module (`coverColor.js`, following the codebase's one-file-per-feature convention) wrapped in a new `CoverColorService` (mirroring `BlobUrlService`'s existing shape exactly), called once per unique cover from `ShelfBook.razor.cs` alongside its existing cover-loading logic.

**Tech Stack:** Plain CSS (`::before`, `background-image`, `opacity`) for Task 1. Vanilla JS (offscreen `<canvas>`, `HTMLImageElement.decode()`, `getImageData`) plus a thin C# service wrapper for Task 2 — no new dependencies.

## Global Constraints

- **No new color tokens** — Task 1 introduces no color at all (pure texture images at low opacity); Task 2's extracted colors are runtime `rgb(...)` strings set via inline CSS custom property, never a new CSS variable declared in a theme file.
- **Texture images are an enhancement layered via low opacity, never a structural dependency.** If either `.webp` file were ever missing, the `background-image` simply fails to paint (a silently-absent image is not a broken `<img>` — no layout break, no visible error) and the shelf/book still renders correctly via its existing gradient. Both asset files already exist at `frontend/LuminaChronica.Client/wwwroot/images/library/shelf-wood-texture.webp` and `book-leather-texture.webp` (confirmed present, landed in an earlier PR) — this constraint is about the CSS technique staying inherently graceful, not about writing extra fallback code.
- **Cover-color extraction must be cached per unique cover, not recomputed per render or per hover.** Cache key is `Book.CoverUrl` (the stable, real API path, e.g. `/api/books/5/cover`) — **not** the ephemeral `blob:` object URL, since `BlobUrlService.CreateObjectUrlAsync` mints a brand-new unique `blob:` URL string on every call, even for the exact same underlying bytes, so caching by that would never hit across a fresh component mount for the same book.
- **Extraction must have a sensible fallback for books with no cover at all**, and must never surface an extraction failure to the user. If `Book.CoverUrl is null`, or the JS extraction throws/fails for any reason (decode error, tainted canvas, network hiccup), the book falls back to Phase 1's existing procedural per-book palette (`.shelf-book-palette-0` through `-4`), unchanged — this is what already provides per-book variety for no-cover books today and continues to do so.
- **Cross-origin/canvas-tainting**: cover images are loaded via `blob:` object URLs (`BlobUrlService`, `URL.createObjectURL`), which are always same-origin to the page that created them — `getImageData` on a canvas drawn from a `blob:` URL does not hit the tainted-canvas security restriction. This was verified by reading `BlobUrlService`'s and `ShelfBook.razor.cs`'s actual implementation (not assumed) before writing this plan.
- **BookCard is not modified** — it remains in use elsewhere in the app unchanged; this phase only touches `ShelfBook`/`ShelfRow`/`app.css`.
- Frontend test baseline at the start of this plan: 361/361 bUnit tests passing (confirmed by running the suite in a fresh worktree before writing this plan).

---

### Task 1: Texture Assets (Wood Shelf + Leather Book)

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`

**Interfaces:**
- Consumes: the already-landed asset files `frontend/LuminaChronica.Client/wwwroot/images/library/shelf-wood-texture.webp` and `book-leather-texture.webp` (verify both exist before starting — do not proceed if either is missing, escalate instead).
- Produces: nothing consumed by Task 2 — this task is CSS-only and fully independent.

**Context — the exact established pattern to follow** (`app.css`, search for `.goal-ring::before` and `.stats-panel.calendar-card::before`, read both yourself before starting):
```css
.stats-panel.calendar-card::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: url("../images/statistics/brass-texture.webp");
    background-size: cover;
    opacity: 0.15;
    pointer-events: none;
}

.goal-ring::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 50%;
    background-image: url("../images/statistics/brass-texture.webp");
    background-size: cover;
    opacity: 0.15;
    pointer-events: none;
}
```
Both establish the texture as a `::before` pseudo-element painted at `z-index: -1` — but that only paints correctly (above the parent's own background/gradient, below the parent's normal-flow and positioned children) if the parent element itself establishes a stacking context; otherwise the negative `z-index` escapes to the *nearest ancestor that does*, and paints behind whatever that ancestor's own background/children turn out to be, not the intended parent's. Check `.goal-ring`'s and `.stats-panel.calendar-card`'s own full rules (not just their `::before`) and note **both carry `isolation: isolate` for exactly this reason** — it's a load-bearing part of the established pattern, not incidental. `.goal-ring::before` gives the pseudo-element its own matching `border-radius` (a circle) rather than relying on the parent's `overflow: hidden`; `.stats-panel.calendar-card::before` relies on the parent's own `overflow: hidden` instead, since that panel has no animated children that could ever extend past its bounds.

**Why `.shelf-compartment` must follow the `.goal-ring` pattern (own border-radius), not the calendar-card pattern (ancestor `overflow: hidden`)**: `.shelf-compartment` contains `.shelf-books`, whose individual `.shelf-book` elements lift via `translateY(-1.4rem) translateZ(3.6rem) ...` when revealed (hover/focus/touch) — a JS-spring-driven animation from Phase 2. If `.shelf-compartment` had `overflow: hidden`, a revealed book lifting above its resting position risks being visually clipped at the compartment's top edge. Giving the `::before` its own matching `border-radius` (the same value `.shelf-compartment` itself uses) avoids this risk entirely, at zero cost to the texture's visual correctness (the texture image is intended to be subtle/tileable regardless of exact corner treatment).

- [ ] **Step 1: Add the wood-texture overlay to `.shelf-compartment`**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, find the existing `.shelf-compartment` rule (search for `.shelf-compartment {`):
```css
.shelf-compartment {
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-dark) 90%, black), var(--color-bg-dark));
    border-radius: var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius)) 0.15rem 0.15rem;
    box-shadow: inset 0 10px 18px rgba(0, 0, 0, 0.5), inset 0 -2px 0 rgba(0, 0, 0, 0.3);
    padding: var(--space-3) var(--space-3) 0;
    position: relative;
}
```
It already has `position: relative` (needed for the `::before`) — do not add `overflow: hidden` (per the reasoning above). It does **not** yet establish its own stacking context (`position: relative` alone, with no `z-index`/`transform`/`isolation`, does not), so — mirroring `.stats-panel.calendar-card`/`.goal-ring` — add `isolation: isolate;` as a new line inside this existing rule, immediately after `position: relative;`. Without it, the `::before` below would escape to whatever ancestor *does* establish a stacking context and paint in the wrong place, likely ending up invisible behind `.shelf-compartment`'s own gradient. Then add this new rule immediately after it:
```css
/* Aged wood grain overlay (Library Rework Phase 3), following the exact
   established brass-texture.webp technique (.goal-ring::before, app.css) --
   a low-opacity ::before painted at z-index: -1, above the compartment's
   own gradient but below its children. Uses its OWN matching border-radius
   rather than the parent's overflow: hidden (unlike the calendar-card
   precedent), since a revealed .shelf-book (Phase 2's spring reveal) can
   lift slightly above the compartment's resting bounds and must never be
   clipped. If shelf-wood-texture.webp is ever missing, this simply fails
   to paint -- the compartment's existing gradient background still renders
   correctly underneath with no layout break. */
.shelf-compartment::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius)) 0.15rem 0.15rem;
    background-image: url("../images/library/shelf-wood-texture.webp");
    background-size: cover;
    opacity: 0.15;
    pointer-events: none;
}
```

- [ ] **Step 2: Add the leather-texture overlay to the book spine/cover faces**

Find the existing shared rule for both book faces (search for `.shelf-book-spine,\n.shelf-book-cover {`):
```css
.shelf-book-spine,
.shelf-book-cover {
    position: absolute;
    inset: 0;
    border-radius: 0.15rem 0.3rem 0.3rem 0.15rem;
    backface-visibility: hidden;
    box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.4);
    overflow: hidden;
}
```
This rule already has `overflow: hidden` and its own `border-radius` — unlike `.shelf-compartment`, these faces have no animated children that extend past their own bounds (the favorite button, text, and cover image all stay within the face's box), so relying on the existing `overflow: hidden` to clip the texture's square corners into the face's rounded shape is safe here, matching the calendar-card precedent.

**Stacking context check (same reasoning as `.shelf-compartment` above) — the two faces are not symmetric here.** `.shelf-book-cover` already establishes its own stacking context via its existing `transform: rotateY(90deg) translateZ(1.6rem)` rule (search for `.shelf-book-cover {` further down — a non-`none` `transform` establishes a stacking context on its own, same as `isolation: isolate` does), so its `::before` below is already safely scoped and needs no further change. `.shelf-book-spine` has no such property (only `display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl;`), so — same fix as `.shelf-compartment` — find the existing `.shelf-book-spine { ... }` rule (search for `.shelf-book-spine {`, the one with `writing-mode: vertical-rl`, not the shared rule above) and add `isolation: isolate;` as a new line inside it. This is safe with respect to Phase 1/2's `preserve-3d` fan-rotation chain: `isolation` only changes how `.shelf-book-spine`'s *own children* (the title text) get flattened for painting, not how `.shelf-book-spine` itself is positioned within `.shelf-book`'s 3D rotation — that positioning is governed by `.shelf-book`'s own `transform-style: preserve-3d`, unaffected by a child's `isolation` value. Step 12 below includes an explicit live check for this. Add this new rule immediately after the shared rule:
```css
/* Subtle leather grain overlay (Library Rework Phase 3), same established
   technique as the wood texture above. Painted at z-index: -1, so it sits
   above each face's own gradient background (which now carries either a
   cover-derived tint or the Phase 1 procedural palette color -- see the
   Canvas color extraction task) but below the face's own children. On
   .shelf-book-cover specifically, this means the leather grain is only
   visible when there's no real cover image on top (the placeholder/no-cover
   case) -- once a real photographic cover image paints (an absolutely-
   positioned child, painting above z-index: -1), it naturally covers the
   leather texture, which is correct: a real cover photo doesn't need a
   fake leather-grain overlay pretending to be its material. On
   .shelf-book-spine, which never has an image, the leather texture is
   always visible. If book-leather-texture.webp is ever missing, this
   simply fails to paint -- each face's existing gradient still renders
   correctly with no layout break. */
.shelf-book-spine::before,
.shelf-book-cover::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: url("../images/library/book-leather-texture.webp");
    background-size: cover;
    opacity: 0.18;
    pointer-events: none;
}
```

- [ ] **Step 3: Build**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success (this task is pure CSS; no C# changes).

- [ ] **Step 4: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all 361 existing tests to still pass unchanged (no C#/Razor files touched by this task).

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Add wood/leather texture overlays to the Library shelf and books"
```

(Live-visual verification of both textures happens once Task 2 is also complete, in that task's own live-verification step — there's value in checking both material changes together in one pass, since they compose visually on the same book.)

---

### Task 2: Canvas-Based Cover-Color Extraction

**Files:**
- Create: `frontend/LuminaChronica.Client/wwwroot/js/coverColor.js`
- Create: `frontend/LuminaChronica.Client/Services/CoverColorService.cs`
- Modify: `frontend/LuminaChronica.Client/Program.cs` (one line: DI registration)
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor` and `ShelfBook.razor.cs`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (the 5 `.shelf-book-palette-N` rules, plus one new rule)
- Test: `tests/frontend/ShelfBookTests.cs` (extend)

**Interfaces:**
- Consumes: `Book.CoverUrl` and the existing `_coverObjectUrl`/`BlobUrlService` cover-loading logic already in `ShelfBook.razor.cs` (unchanged by this task, only extended).
- Produces: a new `--shelf-book-tint` inline CSS custom property and a new `has-cover-tint` CSS class on `.shelf-book`, both set only when extraction succeeds. Nothing here is consumed by any other task in this plan (Task 1 is independent).

**Context — the exact existing pattern to follow for the C# service wrapper** (`frontend/LuminaChronica.Client/Services/BlobUrlService.cs`, read it yourself before starting):
```csharp
public class BlobUrlService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/blobUrl.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<string> CreateObjectUrlAsync(byte[] bytes, string mimeType)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("createObjectUrl", bytes, mimeType);
    }
    // ...
}
```
`Program.cs` registers it as `builder.Services.AddScoped<BlobUrlService>();` (search for that exact line — your new service goes on the line immediately after it).

- [ ] **Step 1: Create `coverColor.js`**

```javascript
// Extracts a book cover's average/dominant color at runtime via an
// offscreen canvas, so a book's spine visually relates to its actual cover
// instead of a procedurally-assigned placeholder color (Library Rework
// Phase 3). This is a simple average-color approximation (mean of all
// sampled pixel RGB values), not a full dominant-color-clustering
// algorithm -- a deliberate simplicity choice; a proper k-means/histogram
// approach would need a dependency or considerably more code for a result
// that, for a small spine-tint swatch, isn't visually distinguishable from
// a good average in the vast majority of covers.
//
// Results are cached by the STABLE cover URL (Book.CoverUrl, e.g.
// "/api/books/5/cover"), not by the ephemeral blob: URL used to actually
// draw the image -- a fresh component mount for the same book produces a
// brand-new unique blob: URL every time (see BlobUrlService's
// createObjectUrl), so caching by that would never hit across re-mounts of
// the same book's cover.
const colorCache = new Map();

// Small downscale target -- average color doesn't need full resolution,
// and a tiny canvas keeps getImageData cheap even for a large cover image.
const SAMPLE_SIZE = 24;

// Perceptual luminance approximation (not full WCAG relative luminance
// with gamma correction -- good enough to decide "is this average color
// light enough to risk the white spine-title text becoming hard to read,"
// not a certified contrast-ratio calculation).
function relativeLuminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

async function sampleAverageColor(objectUrl) {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha === 0) continue; // skip fully transparent pixels
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    if (count === 0) return null; // fully transparent image -- nothing to sample

    const avgR = Math.round(r / count);
    const avgG = Math.round(g / count);
    const avgB = Math.round(b / count);

    // The book's spine title renders in near-white text (see
    // .shelf-book-spine-title, app.css) on top of whatever this tint
    // becomes. A raw average from a very light/white cover (common for
    // real book covers) would make that text hard to read -- darken the
    // result toward black when it's too light, rather than discarding a
    // real, if pale, cover color entirely.
    if (relativeLuminance(avgR, avgG, avgB) > 0.6) {
        const darken = 0.5;
        return `rgb(${Math.round(avgR * darken)}, ${Math.round(avgG * darken)}, ${Math.round(avgB * darken)})`;
    }

    return `rgb(${avgR}, ${avgG}, ${avgB})`;
}

export async function extractDominantColor(coverUrl, objectUrl) {
    if (colorCache.has(coverUrl)) {
        return colorCache.get(coverUrl);
    }

    let color = null;
    try {
        color = await sampleAverageColor(objectUrl);
    } catch {
        // Decode failure, tainted canvas, or any other extraction error --
        // leave color as null so the caller falls back to its own
        // procedural default rather than surfacing an error to the user.
    }

    colorCache.set(coverUrl, color);
    return color;
}
```

- [ ] **Step 2: Create `CoverColorService.cs`**

```csharp
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// Thin wrapper around coverColor.js, following BlobUrlService's exact
// established shape for a lazily-imported single-purpose JS module.
public class CoverColorService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/coverColor.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    // coverUrl is the stable cache key (Book.CoverUrl); objectUrl is the
    // actual loadable blob: URL, only used by the JS module on a cache
    // miss. Returns null if extraction failed or the JS call itself
    // threw -- callers must treat null as "no tint available, use the
    // existing procedural fallback," never as an error to surface.
    // Virtual so tests can substitute a fake result without needing to
    // mock JS interop for this specific call (see ShelfBookTests.cs).
    public virtual async Task<string?> ExtractDominantColorAsync(string coverUrl, string objectUrl)
    {
        try
        {
            var module = await _moduleTask.Value;
            return await module.InvokeAsync<string?>("extractDominantColor", coverUrl, objectUrl);
        }
        catch (Exception)
        {
            return null;
        }
    }
}
```

- [ ] **Step 3: Register the service in `Program.cs`**

Find the exact line `builder.Services.AddScoped<BlobUrlService>();` and add immediately after it:
```csharp
builder.Services.AddScoped<CoverColorService>();
```

- [ ] **Step 4: Wire extraction into `ShelfBook.razor.cs`**

Read the current file first (`frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs`) to confirm it still matches what's shown below before editing — if it has diverged, stop and report rather than guessing.

Replace the whole file with:
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
    private string? _spineTint;

    // Tight-banded resting rotation only (no combined rotateZ lean) --
    // wider variation combined with a simultaneous tilt read as a
    // "chaotic zigzag" during design validation, not natural shelf
    // clutter. Deterministic per book (not random) so it stays stable
    // across re-renders without needing any shared/coordinated state
    // with the parent ShelfRow. Uses % 7 (not % 5) so this decorrelates
    // from the palette index (Book.Id % 5, set in the .razor markup) --
    // note that any (Book.Id * k) % 5 is just a relabeling of Id % 5
    // (since multiplication by a unit mod 5 is a bijection on its
    // residues), so it would NOT actually decorrelate; only a different
    // modulus does. The multiplier is reduced to keep the same ~2.8deg
    // resting band as before despite the wider 7-cycle.
    private double RestRotation => -9.5 - (Book.Id % 7) * 0.47;

    private string AccessibleLabel => string.IsNullOrWhiteSpace(Book.Author)
        ? Book.Title
        : $"{Book.Title}, {Book.Author}";

    // Combines the existing --shelf-book-rest custom property with a
    // --shelf-book-tint custom property (Library Rework Phase 3) when a
    // real cover-derived color is available. app.css's .has-cover-tint
    // rule is what actually consumes this custom property -- when
    // _spineTint is null (no cover, or extraction failed), no such
    // property is set at all, and the existing procedural
    // .shelf-book-palette-N rules apply exactly as they did before this
    // phase.
    private string InlineStyle
    {
        get
        {
            var style = $"--shelf-book-rest: {RestRotation.ToString(System.Globalization.CultureInfo.InvariantCulture)}deg";
            if (_spineTint is not null)
            {
                style += $"; --shelf-book-tint: {_spineTint}";
            }
            return style;
        }
    }

    protected override async Task OnParametersSetAsync()
    {
        if (Book.Id != _loadedBookId)
        {
            _loadedBookId = Book.Id;
            _isFavorite = Book.IsFavorite;
            _spineTint = null;
        }

        if (Book.CoverUrl == _loadedCoverUrl) return;

        if (_coverObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
            _coverObjectUrl = null;
        }

        _loadedCoverUrl = Book.CoverUrl;
        _spineTint = null;
        if (Book.CoverUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Book.CoverUrl);
        if (result is { } cover)
        {
            _coverObjectUrl = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
            _spineTint = await CoverColorService.ExtractDominantColorAsync(Book.CoverUrl, _coverObjectUrl);
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

Changes from the current file, summarized: added `_spineTint` field, added the `InlineStyle` computed property, reset `_spineTint = null` in both places `_loadedBookId`/`_loadedCoverUrl` already get reset (so a stale tint from a previous book never lingers while a new one's extraction is in flight), and added the one new `CoverColorService.ExtractDominantColorAsync` call right after the existing `BlobUrlService.CreateObjectUrlAsync` call. Nothing else changes.

- [ ] **Step 5: Wire `@inject CoverColorService` and the new style/class into `ShelfBook.razor`**

Read the current file first (`frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`) to confirm it still matches what's shown below before editing.

Change the top `@inject` block from:
```razor
@namespace LuminaChronica.Client.Components
@implements IDisposable
@inject ApiClient ApiClient
@inject BlobUrlService BlobUrlService
```
to:
```razor
@namespace LuminaChronica.Client.Components
@implements IDisposable
@inject ApiClient ApiClient
@inject BlobUrlService BlobUrlService
@inject CoverColorService CoverColorService
```

Change the anchor's `class` and `style` attributes from:
```razor
<a class="shelf-book shelf-book-palette-@(Book.Id % 5)"
   style="--shelf-book-rest: @(RestRotation.ToString(System.Globalization.CultureInfo.InvariantCulture))deg"
   href="@(Href ?? $"library/books/{Book.Id}")"
   aria-label="@AccessibleLabel">
```
to:
```razor
<a class="shelf-book shelf-book-palette-@(Book.Id % 5) @(_spineTint is not null ? "has-cover-tint" : "")"
   style="@InlineStyle"
   href="@(Href ?? $"library/books/{Book.Id}")"
   aria-label="@AccessibleLabel">
```
Everything else in the file (the spine/cover markup, favorite button, borrowed badge, progress bar) is unchanged.

- [ ] **Step 6: Replace the procedural palette CSS with a tint-aware version**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, find the existing 5 palette rules (search for `.shelf-book-palette-0`) and the comment immediately above them:
```css
/* Procedural placeholder palette (Phase 1 only -- replaced by real
   cover-derived color extraction in Phase 3). 5 procedurally-varied
   swatches derived from --color-primary/--color-secondary/--color-border/
   --color-bg-dark, each as a gradient plus a matching cover-face tint.
   Every color-mix() below intentionally specifies only the first color's
   percentage so the second defaults to the exact remainder (percentages
   summing to less than 100% makes the browser apply an unwanted alpha
   multiplier to the result). */
.shelf-book-palette-0 .shelf-book-spine,
.shelf-book-palette-0 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-secondary) 85%, white), color-mix(in srgb, var(--color-secondary) 70%, black)); }
.shelf-book-palette-1 .shelf-book-spine,
.shelf-book-palette-1 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-border) 60%, var(--color-secondary)), color-mix(in srgb, var(--color-border) 50%, black)); }
.shelf-book-palette-2 .shelf-book-spine,
.shelf-book-palette-2 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 85%, white), color-mix(in srgb, var(--color-primary) 70%, black)); }
.shelf-book-palette-3 .shelf-book-spine,
.shelf-book-palette-3 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-bg-dark) 40%, var(--color-primary)), color-mix(in srgb, var(--color-bg-dark) 70%, black)); }
.shelf-book-palette-4 .shelf-book-spine,
.shelf-book-palette-4 .shelf-book-cover { background: linear-gradient(160deg, color-mix(in srgb, var(--color-secondary) 78%, var(--color-primary)), color-mix(in srgb, var(--color-secondary) 65%, black)); }
```

Replace the comment (keep the 5 rules below it completely unchanged -- they remain the fallback for books with no cover or failed extraction) with:
```css
/* Procedural placeholder palette -- the fallback for books with no cover
   image, or where cover-color extraction failed (Library Rework Phase 3,
   see .has-cover-tint below). 5 procedurally-varied swatches derived from
   --color-primary/--color-secondary/--color-border/--color-bg-dark, each
   as a gradient plus a matching cover-face tint. Every color-mix() below
   intentionally specifies only the first color's percentage so the second
   defaults to the exact remainder (percentages summing to less than 100%
   makes the browser apply an unwanted alpha multiplier to the result). */
```

Then add this new rule immediately after the 5 palette rules:
```css
/* Cover-derived spine tint (Library Rework Phase 3): when ShelfBook.razor.cs
   successfully extracted a color from the book's actual cover image, it
   sets --shelf-book-tint inline and adds this class, which then takes
   precedence over whichever .shelf-book-palette-N class the book also
   carries (two classes on .shelf-book gives this selector higher
   specificity than any single-class palette rule, so the override holds
   regardless of source order). Uses the same 85%/70% white/black mix
   pattern as the simpler palette rules above, applied uniformly to the
   extracted color rather than trying to retrofit --shelf-book-tint into
   each palette's own distinct two-token mix recipe. */
.shelf-book.has-cover-tint .shelf-book-spine,
.shelf-book.has-cover-tint .shelf-book-cover {
    background: linear-gradient(160deg,
        color-mix(in srgb, var(--shelf-book-tint) 85%, white),
        color-mix(in srgb, var(--shelf-book-tint) 70%, black));
}
```

- [ ] **Step 7: Write the failing tests**

In `tests/frontend/ShelfBookTests.cs`, first move the `CoverColorService` registration into the shared constructor (every `ShelfBook` render now needs one, even tests that never touch a cover, since Blazor resolves `@inject` properties eagerly regardless of whether the component's logic path ever uses them). Change the constructor from:
```csharp
public ShelfBookTests()
{
    var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
    var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
    Services.AddSingleton(httpClient);
    Services.AddSingleton<ApiClient>();
    Services.AddSingleton<BlobUrlService>();
}
```
to:
```csharp
public ShelfBookTests()
{
    var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
    var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
    Services.AddSingleton(httpClient);
    Services.AddSingleton<ApiClient>();
    Services.AddSingleton<BlobUrlService>();
    Services.AddSingleton<CoverColorService>();
}
```
This registers the REAL `CoverColorService` by default (needs only `IJSRuntime`, which bUnit's `TestContext` already provides automatically to every test in this file, the same way it already does for `BlobUrlService`). The real service is never actually invoked by the 8 existing tests, since all of them use `MakeBook()` (`CoverUrl = null`), and `OnParametersSetAsync` returns before ever calling it in that case.

Add this private fake class inside the `ShelfBookTests` class (anywhere after the constructor), following the same hand-rolled-fake style already used by `FakeHttpMessageHandler`/`RoutedFakeHttpMessageHandler` elsewhere in this test project rather than a mocking framework:
```csharp
private sealed class FakeCoverColorService(string? result) : CoverColorService(null!)
{
    public override Task<string?> ExtractDominantColorAsync(string coverUrl, string objectUrl) => Task.FromResult(result);
}
```
(Passing `null!` for the base class's unused `IJSRuntime` parameter is safe here: the override never calls the base implementation, so the base's lazily-initialized `_moduleTask` field is never evaluated.)

Add these two tests at the end of the `ShelfBookTests` class, immediately before the closing brace:
```csharp
[Fact]
public void ShelfBook_CoverColorExtracted_AppliesTintStyleAndClass()
{
    var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/cover", "fake cover bytes", "image/jpeg");
    var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
    Services.AddSingleton(httpClient);
    JSInterop.SetupModule("./js/blobUrl.js").Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-cover-url");
    Services.AddSingleton<CoverColorService>(new FakeCoverColorService("rgb(120, 60, 30)"));

    var book = new Book { Id = 3, Title = "Farbtest", CoverUrl = "/api/books/3/cover" };
    var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, book));

    var anchor = cut.Find("a.shelf-book");
    Assert.Contains("--shelf-book-tint: rgb(120, 60, 30)", anchor.GetAttribute("style"));
    Assert.Contains("has-cover-tint", anchor.ClassList);
}

[Fact]
public void ShelfBook_NoCoverImage_DoesNotApplyTint()
{
    Services.AddSingleton<CoverColorService>(new FakeCoverColorService("rgb(120, 60, 30)"));

    var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

    var anchor = cut.Find("a.shelf-book");
    Assert.DoesNotContain("--shelf-book-tint", anchor.GetAttribute("style"));
    Assert.DoesNotContain("has-cover-tint", anchor.ClassList);
}
```
Both tests rely on .NET's documented dependency-injection behavior that when a service type is registered more than once, resolving it via constructor injection returns the *last* registration — the same mechanism `ShelfBook_FavoriteToggle_CallsPostAndFlipsVisualState` (existing test, same file) already relies on when it re-registers `httpClient` inside its own test body, overriding the constructor's default.

- [ ] **Step 8: Run the two new tests and verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "ShelfBook_CoverColorExtracted_AppliesTintStyleAndClass|ShelfBook_NoCoverImage_DoesNotApplyTint"`
Expected: both PASS. If `ShelfBook_CoverColorExtracted_AppliesTintStyleAndClass` fails because the style string doesn't contain the expected substring, check the actual rendered `style` attribute value in the assertion failure message first — a formatting mismatch (e.g. spacing around `;`/`:`) is more likely than a logic bug, given `InlineStyle`'s exact string-concatenation shape above.

- [ ] **Step 9: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all 363 tests (361 existing + 2 new) to pass, output pristine (no stray warnings).

- [ ] **Step 10: Build**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success.

- [ ] **Step 11: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/coverColor.js frontend/LuminaChronica.Client/Services/CoverColorService.cs frontend/LuminaChronica.Client/Program.cs frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/ShelfBookTests.cs
git commit -m "Add Canvas-based cover-color extraction for the Library shelf spine tint"
```

- [ ] **Step 12: Live-visual verification (both tasks together)**

Using the established live-verification technique for this feature (construct the actual `ShelfRow`/`ShelfBook` DOM structure directly in a browser and import the real, currently-shipped JS modules from the dev server — the WASM-fetch/stale-dev-server issues hit during Phase 2's live verification are documented in project memory; check there first if real Blazor data-loading is attempted instead):

1. **Wood texture**: confirm the shelf compartment shows a subtle wood-grain texture under its existing dark gradient, at all 4 themes -- it should read as "aged wood," not dominate or look like a visible seam/repeat at typical shelf widths.
2. **Leather texture**: confirm book spines show a subtle leather-grain texture; confirm a book's COVER face (once revealed) does NOT show the leather texture when it has a real cover image (the image should fully cover it, per Step 2's documented z-index reasoning) but DOES show it when the book has no cover at all (placeholder state).
3. **Cover-color extraction, happy path**: using a book with a real, colorful cover image, confirm the spine's gradient color visibly relates to the cover's actual dominant tone (not the old procedural `--color-primary`/`--color-secondary`-derived palette) -- check via `getComputedStyle` on the `--shelf-book-tint` custom property and the rendered gradient, not just a visual impression.
4. **Cover-color extraction, light-cover contrast fix**: using a book with a very light/white-dominant cover, confirm the spine-title text (`.shelf-book-spine-title`, near-white) stays legible against the resulting (darkened) tint -- this specifically exercises the `relativeLuminance > 0.6` darkening branch in `coverColor.js`.
5. **Fallback path**: using a book with no cover at all, confirm it still renders via the unchanged procedural `.shelf-book-palette-N` color (no `has-cover-tint` class, no `--shelf-book-tint` style) -- confirm via DOM inspection, not just visual variety.
6. **3D fan-rotation regression**: with the new `isolation: isolate;` added to `.shelf-compartment` and `.shelf-book-spine` (Step 1/Step 2's stacking-context fix), confirm the Phase 1 resting fan effect still renders correctly -- each book still shows its per-book `RestRotation` tilt, and hovering/focusing a book still triggers Phase 2's spring reveal without the rotation flattening to 2D or the spine/cover faces losing their `backface-visibility: hidden` culling (i.e. you should not see both faces simultaneously, or a book that looks flat/undistorted regardless of its rotation).
7. **All 4 themes**: confirm both textures and at least one cover-tinted book render acceptably in Classic Library, Dark Library, Modern Light, and System.
8. Confirm all of Phase 1/2's already-verified behavior still holds unchanged (search/filters/sort/pagination/favorites/reveal mechanic/spring physics/touch) -- this task only changes material/color treatment, not structure or interaction.

Document any concern (a texture that reads too strong/weak, an extraction result that looks visually wrong for a specific cover, anything above that didn't hold) honestly in the task report.

- [ ] **Step 13: Add a Roadmap.md entry**

Append a new entry to `documentation/Roadmap.md`, in the same established style as the "Library Rework — Phase 2" entry immediately above it (find it by searching for "Library Rework"). Cover: what shipped in this phase (wood/leather textures, Canvas-based cover-color extraction replacing the procedural palette), the test results (363/363), and the live-verification results from Step 12 including any concerns. Note that this closes out all three phases of the Library Rework design spec (`docs/superpowers/specs/2026-09-08-library-shelf-design.md`).

```bash
git add documentation/Roadmap.md
git commit -m "Document Library Rework Phase 3 in Roadmap"
```
