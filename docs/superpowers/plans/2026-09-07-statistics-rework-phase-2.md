# Statistics Rework Phase 2 (Parallax Hero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Statistics.razor` a three-layer CSS scroll-driven parallax hero ("The Reading Observatory"), replacing the current plain `.stats-header` block, using the same technique as the already-shipped Dashboard hero (`Home.razor`/`Home.razor.css`).

**Architecture:** A new `Statistics.razor.css` scoped CSS file (mirroring `Home.razor.css` almost exactly) holds all hero-specific rules; the pre-existing Statistics styling in the global `app.css` is otherwise untouched except for removing the two rules the old plain header used (now dead). Three real, already-delivered WebP layers stack via `position: absolute`/z-index, animate via `animation-timeline: view()`, and compact on scroll via the existing `motion.js` `initHeaderCompact` sentinel pattern — reused a third time (already used for `.app-header` and the Dashboard hero), built correctly from the start this time on two points the Dashboard hero's final review had to catch after the fact: the sentinel goes *before* the hero in markup, and the component implements `IAsyncDisposable` for its JS module reference.

**Tech Stack:** Blazor WebAssembly (.NET 10), Blazor CSS isolation (`Statistics.razor.css`), `wwwroot/js/motion.js` (unmodified), bUnit for tests.

## Global Constraints

- No new color tokens — reuse existing custom properties only (`--color-bg-dark`, `--color-text-on-dark`, `--radius-lg`, `--shadow-card`, `--motion-standard`, `--ease-standard`), same set Dashboard's hero already uses.
- No new motion durations — reuse `--motion-standard`/`--ease-standard` for the height-compaction transition, exactly as Dashboard's hero does.
- Parallax must be pure CSS (`animation-timeline: view()`), gated behind `@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) { … } }` — no scroll-event JS listener.
- The compaction sentinel (`.stats-hero-sentinel`) MUST be placed *before* `.stats-hero` in the markup, not after. `.stats-hero` is a normal, non-sticky block; a sentinel placed after it would only leave the viewport once the hero has already scrolled fully out of view, applying the compaction class to something invisible — this exact bug shipped in the Dashboard hero and was only caught by that phase's final whole-branch review. Get it right the first time here.
- `Statistics.razor` must `@implements IAsyncDisposable` and dispose its `motion.js` module reference in `DisposeAsync` (catching `JSDisconnectedException`), matching `MainLayout.razor`'s and (after its own fix) `Home.razor`'s pattern. `Home.razor` initially shipped without this and it was caught by Dashboard Phase 2's final review — build it correctly from the start here.
- No functional regression — the `StatCard` row, Goal Ring, calendar heatmap (including its Phase 1 accessibility fix), Yearly Overview, Genre Breakdown, and Recent Activity must all keep rendering and working exactly as after Phase 1.
- Assets already exist, committed, no action needed to fetch them: `frontend/LuminaChronica.Client/wwwroot/images/statistics-hero-layer1-background.webp` (opaque), `-layer2-moonlight.webp` (transparent), `-layer3-armillary.webp` (transparent, left-weighted composition).

---

### Task 1: Hero markup and static CSS

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor:1-16` (top-of-file directives and the `.stats-header` block)
- Create: `frontend/LuminaChronica.Client/Pages/Statistics.razor.css`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css:955-965` (remove the now-dead `.stats-header`/`.stats-subtitle` rules)
- Test: `tests/frontend/StatisticsPageTests.cs`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first task).
- Produces: `.stats-hero`/`.stats-hero-sentinel` classes and `_heroRef`/`_heroSentinelRef` `ElementReference` fields that Task 3 wires up via JS interop. `.stats-hero-layer-1/2/3` classes that Task 2's `@keyframes` target.

- [ ] **Step 1: Replace the top of `Statistics.razor`**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, replace lines 1-16:

```razor
@page "/statistics"
@attribute [Authorize]
@using System.Globalization
@using Microsoft.AspNetCore.Authorization
@using LuminaChronica.Client.Components
@using LuminaChronica.Client.Models
@using LuminaChronica.Client.Services
@inject ApiClient ApiClient

<PageTitle>Statistik — Lumina Chronica</PageTitle>

<div class="stats-header">
    <h1>Statistik</h1>
    <p class="stats-subtitle">Deine Lesereise in Zahlen.</p>
</div>

```

with:

```razor
@page "/statistics"
@attribute [Authorize]
@using System.Globalization
@using Microsoft.AspNetCore.Authorization
@using LuminaChronica.Client.Components
@using LuminaChronica.Client.Models
@using LuminaChronica.Client.Services
@inject ApiClient ApiClient
@inject IJSRuntime JsRuntime

<PageTitle>Statistik — Lumina Chronica</PageTitle>

<div class="stats-hero-sentinel" @ref="_heroSentinelRef" aria-hidden="true"></div>
<div class="stats-hero" @ref="_heroRef">
    <img src="images/statistics-hero-layer1-background.webp" alt="" class="stats-hero-layer stats-hero-layer-1" fetchpriority="high" />
    <img src="images/statistics-hero-layer2-moonlight.webp" alt="" class="stats-hero-layer stats-hero-layer-2" fetchpriority="low" decoding="async" />
    <img src="images/statistics-hero-layer3-armillary.webp" alt="" class="stats-hero-layer stats-hero-layer-3" fetchpriority="low" decoding="async" />
    <div class="stats-hero-scrim"></div>
    <div class="stats-hero-content">
        <h1>Statistik</h1>
        <p class="stats-subtitle">Deine Lesereise in Zahlen.</p>
    </div>
</div>

```

The hero renders unconditionally, above the `@if (_stats is null)` loading/empty/content branches below it — same shape as the Dashboard hero relative to `Home.razor`'s own conditional content.

- [ ] **Step 2: Add `_heroRef`/`_heroSentinelRef`/`_motionModule` fields to the `@code` block**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, find the `@code` block's existing field declarations:

```razor
@code {
    private StatisticsResponse? _stats;
    private int? _goalInput;
    private List<List<CalendarCell>> _calendarWeeks = [];
```

Replace with:

```razor
@code {
    private ElementReference _heroRef;
    private ElementReference _heroSentinelRef;
    private IJSObjectReference? _motionModule;

    private StatisticsResponse? _stats;
    private int? _goalInput;
    private List<List<CalendarCell>> _calendarWeeks = [];
```

(Task 3 adds the `OnAfterRenderAsync`/`DisposeAsync` methods that use these fields — this step only declares them so Task 1's markup/`@ref` bindings compile.)

- [ ] **Step 3: Create `Statistics.razor.css` with the static hero structure**

Create `frontend/LuminaChronica.Client/Pages/Statistics.razor.css`:

```css
.stats-hero {
    position: relative;
    height: 38vh;
    min-height: 260px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin-bottom: var(--space-3);
    box-shadow: var(--shadow-card);
    background-color: var(--color-bg-dark);
    transition: height var(--motion-standard) var(--ease-standard);
}

/* Three depth layers (Statistics Rework Phase 2), same technique as the
   Dashboard hero (Home.razor.css). Each layer is sized larger than its
   container (inset: -10% 0 -> 120% height) so Task 2's parallax
   translateY can move it without ever exposing empty space at the top/
   bottom edge. Note translateY(%) resolves against the layer's OWN
   height (120% of the container), not the container's — layer-3's
   translateY(9%) is actually a 10.8%-of-container shift, slightly past
   this 10% overhang. No empty space is exposed in practice: layer-1 (the
   only fully opaque layer) only moves 2% (2.4% of container, well inside
   the margin), and layer-3 is mostly transparent, so its edge crossing
   the container bound has no visible effect. */
.stats-hero-layer {
    position: absolute;
    inset: -10% 0;
    width: 100%;
    height: 120%;
    object-fit: cover;
}

.stats-hero-layer-1 {
    z-index: 1;
}

.stats-hero-layer-2 {
    z-index: 2;
}

.stats-hero-layer-3 {
    z-index: 3;
}

.stats-hero-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(10, 14, 24, 0.35) 0%, rgba(10, 14, 24, 0.2) 45%, rgba(6, 9, 16, 0.75) 100%);
    z-index: 4;
}

.stats-hero-content {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: var(--space-3);
    z-index: 5;
}

.stats-hero-content h1 {
    font-family: var(--font-family-display);
    color: var(--color-text-on-dark);
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
    margin: 0;
}

.stats-hero-content .stats-subtitle {
    color: var(--color-text-on-dark);
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
    opacity: 0.85;
    margin: 0;
}

/* Sentinel for Task 3's motion.js initHeaderCompact call — placed BEFORE
   .stats-hero in Statistics.razor, not after. .stats-hero is a normal,
   non-sticky block; a sentinel placed after it would only leave the
   viewport once the hero itself had already fully scrolled away — the
   compaction would apply to an element the user can no longer see (the
   bug the Dashboard hero shipped and only caught via its final review).
   Placing the sentinel first means it clears the viewport (just below
   the app header) while the hero is still mostly on screen. */
.stats-hero-sentinel {
    height: 1px;
}

/* Toggled by motion.js's initHeaderCompact once .stats-hero-sentinel
   scrolls out of view — same mechanism, transition tokens, and compact
   dimensions as the Dashboard hero's .home-hero.is-compact.
   .stats-hero's base rule has min-height: 260px, which would otherwise
   clamp this compact state's height: 22vh on typical viewport heights —
   this second, more specific min-height overrides that floor for the
   compact state only. */
.stats-hero.is-compact {
    height: 22vh;
    min-height: 160px;
}

@media (prefers-reduced-motion: reduce) {
    .stats-hero {
        transition: none;
    }
}
```

Note the scrim uses a cool dark-blue tint (`rgba(10, 14, 24, ...)`) rather than the Dashboard hero's warm brown (`rgba(20, 12, 6, ...)`) — matching the Reading Observatory's cooler moonlit palette from the design spec, not a copy-paste of Dashboard's exact values.

- [ ] **Step 4: Remove the now-dead `.stats-header`/`.stats-subtitle` rules from `app.css`**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, replace:

```css
/* Statistics page (v1.5 extended stats): header, stat-tile row reuse
   .dashboard-overview/.dashboard-stat as-is, then two side-by-side panels
   (goal ring + reading calendar), then a yearly-overview list reusing the
   same bar-track/bar-fill visual as the genre breakdown below it. */
.stats-header {
    margin-bottom: var(--space-2);
}

.stats-subtitle {
    color: var(--color-text-secondary);
}

.stats-overview .dashboard-stat {
    min-width: 8rem;
}
```

with:

```css
/* Statistics page (v1.5 extended stats): stat-tile row reuses
   .dashboard-overview/.dashboard-stat as-is, then two side-by-side panels
   (goal ring + reading calendar), then a yearly-overview list reusing the
   same bar-track/bar-fill visual as the genre breakdown below it. The
   page's header moved into the hero (Statistics.razor.css, Statistics
   Rework Phase 2) — .stats-header/.stats-subtitle's old plain-page
   styling no longer applies. */
.stats-overview .dashboard-stat {
    min-width: 8rem;
}
```

- [ ] **Step 5: Write the failing bUnit tests**

Add to `tests/frontend/StatisticsPageTests.cs`, after the existing `Statistics_ShowsEmptyState_WhenNoReadingHistoryExists` test:

```csharp
    [Fact]
    public void Statistics_Hero_RendersAllThreeParallaxLayers()
    {
        UseApiResponse(EmptyStatisticsJson);

        var cut = Render<Statistics>();

        var layers = cut.FindAll("img.stats-hero-layer");
        Assert.Equal(3, layers.Count);
        Assert.Contains("statistics-hero-layer1-background.webp", layers[0].GetAttribute("src"));
        Assert.Contains("statistics-hero-layer2-moonlight.webp", layers[1].GetAttribute("src"));
        Assert.Contains("statistics-hero-layer3-armillary.webp", layers[2].GetAttribute("src"));
    }

    [Fact]
    public void Statistics_Hero_SentinelRendersBeforeHero()
    {
        UseApiResponse(EmptyStatisticsJson);

        var cut = Render<Statistics>();

        var sentinelIndex = cut.Markup.IndexOf("stats-hero-sentinel", StringComparison.Ordinal);
        var heroIndex = cut.Markup.IndexOf("\"stats-hero\"", StringComparison.Ordinal);
        Assert.True(sentinelIndex >= 0, "Sentinel element not found in markup.");
        Assert.True(heroIndex >= 0, "Hero element not found in markup.");
        Assert.True(sentinelIndex < heroIndex, "Sentinel must render before .stats-hero in document order.");
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~StatisticsPageTests"`

Expected: all tests PASS, including the two new ones — the markup already has the sentinel-before-hero order and all three layers from Step 1, so these should pass immediately (not TDD-red-then-green, since this task is markup/CSS, not behavior).

- [ ] **Step 7: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS (confirms `app.css`'s edit didn't break anything elsewhere, and the new `IAsyncDisposable`/field declarations compile even though nothing calls them yet).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Statistics.razor frontend/LuminaChronica.Client/Pages/Statistics.razor.css frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/StatisticsPageTests.cs
git commit -m "feat: replace Statistics header with three-layer parallax hero markup"
```

---

### Task 2: CSS scroll-driven parallax

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor.css`

**Interfaces:**
- Consumes: `.stats-hero-layer-1/2/3` classes from Task 1.
- Produces: nothing consumed by later tasks — Task 3 touches compaction, a separate concern.

Pure CSS, no test changes (no existing or new test asserts on `animation`/`animation-timeline` — that's the same established convention Dashboard's own Task 2 followed; behavior is left to live verification in Task 4).

- [ ] **Step 1: Add the parallax `@supports` block and keyframes**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor.css`, add this block immediately after the `.stats-hero-layer-3 { z-index: 3; }` rule and before `.stats-hero-scrim`:

```css
/* Scroll-driven parallax (Statistics Rework Phase 2) — pure CSS, no JS
   scroll listener, same technique as the Dashboard hero. Background
   moves least, foreground moves most — standard parallax depth
   ordering. All three keyframes start at the layer's own neutral
   transform (translateY(0), implicit "from"), so removing the animation
   entirely (the @supports/prefers-reduced-motion fallback below) leaves
   every layer in exactly the same resting position as the animated
   case's starting point.

   Browser support note: animation-timeline: view() shipped in Chromium
   115+ (2023) and Firefox 144+ (2026); Safari does not support it as of
   this writing. The @supports gate means unsupported browsers receive
   none of these rules at all and simply show the static layered hero. */
@supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
        .stats-hero-layer-1 {
            animation: stats-hero-parallax-layer-1 linear both;
            animation-timeline: view();
            animation-range: cover;
        }

        .stats-hero-layer-2 {
            animation: stats-hero-parallax-layer-2 linear both;
            animation-timeline: view();
            animation-range: cover;
        }

        .stats-hero-layer-3 {
            animation: stats-hero-parallax-layer-3 linear both;
            animation-timeline: view();
            animation-range: cover;
        }
    }
}

@keyframes stats-hero-parallax-layer-1 {
    to {
        transform: translateY(2%);
    }
}

@keyframes stats-hero-parallax-layer-2 {
    to {
        transform: translateY(5%);
    }
}

@keyframes stats-hero-parallax-layer-3 {
    to {
        transform: translateY(9%);
    }
}
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS (CSS-only change).

- [ ] **Step 3: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Statistics.razor.css
git commit -m "feat: add CSS scroll-driven parallax to the Statistics hero layers"
```

---

### Task 3: Hero compaction on scroll

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor` (add `OnAfterRenderAsync`/`DisposeAsync`)

**Interfaces:**
- Consumes: `_heroRef`/`_heroSentinelRef`/`_motionModule` fields from Task 1; `wwwroot/js/motion.js`'s existing `initHeaderCompact(headerEl, sentinelEl)` export (unmodified, already generic over any element pair).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add `@implements IAsyncDisposable`**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, find the top-of-file directives:

```razor
@page "/statistics"
@attribute [Authorize]
@using System.Globalization
```

Replace with:

```razor
@page "/statistics"
@attribute [Authorize]
@implements IAsyncDisposable
@using System.Globalization
```

- [ ] **Step 2: Add `OnAfterRenderAsync` and `DisposeAsync` to the `@code` block**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, find the end of `OnInitializedAsync` (it ends with `BuildCalendarWeeks();` followed by a closing `}`), and insert immediately after that closing brace, before the `BuildCalendarWeeks` method:

```razor
    // Reuses motion.js's initHeaderCompact for the hero itself (already
    // generic over any header/sentinel element pair, not app-header- or
    // Home-page-specific). Wrapped in try/catch matching every other
    // motion.js call site in this codebase — a blocked/failed module load
    // just leaves the hero uncompacted, same "progressive enhancement"
    // shape as everywhere else this module is used.
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        try
        {
            _motionModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/motion.js");
            await _motionModule.InvokeVoidAsync("initHeaderCompact", _heroRef, _heroSentinelRef);
        }
        catch (Exception)
        {
        }
    }

```

Then, at the very end of the `@code` block (after the `CalendarCell` record's closing brace, before the final `}` that closes the `@code` block itself), add:

```razor

    public async ValueTask DisposeAsync()
    {
        if (_motionModule is not null)
        {
            try
            {
                await _motionModule.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
    }
```

- [ ] **Step 3: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS. bUnit's default (unconfigured) JSInterop throw is silently swallowed by the `try/catch (Exception)` around the `initHeaderCompact` call, matching this codebase's established convention that motion.js JS-interop wiring is never tested via JSInterop mocking — only the markup hooks (already covered by Task 1's tests) are asserted; the actual runtime behavior is left to live browser verification in Task 4.

- [ ] **Step 4: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Statistics.razor
git commit -m "feat: compact the Statistics hero on scroll via motion.js initHeaderCompact"
```

---

### Task 4: Live verification and Roadmap update

**Files:**
- Modify: `documentation/Roadmap.md` (append a new entry)

**Interfaces:**
- Consumes: the running local dev stack (`dotnet run --urls http://localhost:5289` in `frontend/LuminaChronica.Client`), per [[project-lumina-chronica-local-dev]]'s established workaround for this session's WASM-fetch environment defect if it recurs.
- Produces: nothing — this is the terminal task of Phase 2.

- [ ] **Step 1: Run the full frontend test suite one final time**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS (confirms the cumulative result of Tasks 1-3 together).

- [ ] **Step 2: Live-verify the parallax effect**

Log in, navigate to `/statistics`. Confirm the three layers are visible and correctly stacked (domed observatory background, moonlight/dust shaft, armillary sphere foreground silhouette) in both Classic Library and Dark Library themes. Confirm the `.stats-hero-scrim` keeps the "Statistik"/"Deine Lesereise in Zahlen." text legible against the busier background. Scroll slowly and confirm the three layers visibly move at different rates (foreground fastest, background slowest) — or, more precisely, read each layer's live `getComputedStyle(...).transform` at two or more scroll positions via the browser console/devtools and confirm distinct, changing `translateY` values per layer (this is how the Dashboard hero's parallax was actually confirmed — screenshot comparison alone is unreliable for a subtle multi-pixel effect).

- [ ] **Step 3: Live-verify hero compaction — check ACTUAL VISIBILITY, not just the CSS class**

Scroll down using real scroll-wheel input (not `window.scrollTo()` — this session's browser-automation environment has a documented quirk where programmatic `scrollTo()`/freshly-created `IntersectionObserver`s don't reliably trigger real compositor updates; only genuine OS-level scroll-wheel simulation does, see [[project-lumina-chronica-local-dev]]). Confirm `.stats-hero` gains the `is-compact` class at some scroll position. Critically — **do not stop at confirming the class applied.** Also read `.stats-hero`'s live `getBoundingClientRect()` at that same scroll position and confirm the hero element is still substantially on-screen (not scrolled fully past the viewport) when the class applies. This exact "class applies correctly, but to something invisible" gap is what the Dashboard hero's sentinel-placement bug produced, and a class-only check on that phase's Task 4 initially and incorrectly reported it as "confirmed working."

- [ ] **Step 4: Regression pass**

Confirm the `StatCard` row, Goal Ring (including its brass-dial bevel/texture from Phase 1), calendar heatmap (including its Phase 1 accessibility `role`/`aria-label` and level-2/3/4 glow), Yearly Overview, Genre Breakdown, and Recent Activity all still render and behave exactly as after Phase 1, alongside the new hero.

- [ ] **Step 5: Append the Roadmap.md entry**

Add to `documentation/Roadmap.md`, following the exact structure and honesty conventions of the Dashboard Rework Phase 2 and Statistics Rework Phase 1 entries immediately above it — bullet list of what shipped, test count, an honest verification note stating plainly what was and wasn't independently confirmed (e.g. via `getComputedStyle`/`getBoundingClientRect()`, not just visual impression), and whether the WASM-fetch environment defect recurred.

- [ ] **Step 6: Commit**

```bash
git add documentation/Roadmap.md
git commit -m "docs: add Statistics Rework Phase 2 entry to Roadmap.md"
```
