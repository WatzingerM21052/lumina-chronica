# Dashboard Rework — Phase 2 (Parallax Hero) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's single flat hero image with the three delivered depth layers (background/lights/foreground), add a CSS-only scroll-driven parallax effect and scroll-based compaction, matching the design spec's Phase 2 section.

**Architecture:** Three stacked `<img>` elements (already-optimized WebP layers) inside the existing `.home-hero` container, replacing the current single `.home-hero-image`. Parallax motion is pure CSS (`animation-timeline: view()`), gated behind `@supports` and `prefers-reduced-motion: no-preference` so unsupported/reduced-motion cases simply render the layers static — never JS-driven, no scroll-event listener. Hero compaction on scroll reuses the existing `motion.js` `initHeaderCompact` helper as-is (already generic over any header/sentinel element pair), wired from `Home.razor`'s own `OnAfterRenderAsync`, wrapped in the same try/catch-and-ignore pattern `Discover.razor`/`PublicProfile.razor` already use for their own motion.js wiring.

**Tech Stack:** Blazor WebAssembly (.NET), CSS Scroll-Driven Animations (`animation-timeline: view()`), existing `wwwroot/js/motion.js` module, bUnit for component tests.

## Global Constraints

- No new CSS color tokens — reuse `--color-bg-dark` etc. exactly as already defined; this plan adds no new colors at all (the art itself carries the palette).
- No new motion timing tokens — hero compaction reuses `--motion-standard`/`--ease-standard` (the exact tokens `.app-header.is-compact`'s transition already uses in `Layouts/MainLayout.razor.css:21`).
- `prefers-reduced-motion: reduce` must leave the layers in their static, neutral position — never hide them. The parallax `@keyframes` rules must live inside `@media (prefers-reduced-motion: no-preference)` so a reduced-motion user's browser never even evaluates them (not merely a `transition: none` override).
- Browsers without `animation-timeline: view()` support (all except Chromium 115+/Firefox 144+ at time of writing) must see the layers in their static position too — gate the animation rules behind `@supports (animation-timeline: view())`, not a JS feature-detect.
- No JS scroll-event listener of any kind, for either the parallax or the compaction — parallax is pure CSS; compaction reuses the existing `IntersectionObserver`-based `initHeaderCompact`.
- Layer 1 (background) must stay LCP-safe: a plain `<img>` with no JS dependency for its own paint, matching how `.home-hero-image` already renders today.
- `main` is protected — every change goes out via branch + PR + squash merge.

---

## Task 1: Three-layer hero markup + static layout CSS

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor:12-18`
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor.css`
- Modify: `tests/frontend/HomePageTests.cs`

**Interfaces:**
- Consumes: the three delivered WebP assets at `frontend/LuminaChronica.Client/wwwroot/images/dashboard-hero-layer1-background.webp`, `dashboard-hero-layer2-lights.webp`, `dashboard-hero-layer3-foreground.webp` (already committed, already optimized — no further asset work needed).
- Produces: `.home-hero-layer` / `.home-hero-layer-1` / `.home-hero-layer-2` / `.home-hero-layer-3` CSS classes, consumed by Task 2's parallax rules.

- [ ] **Step 1: Write the failing test**

Add to `tests/frontend/HomePageTests.cs` a new test method (place it near the top, after the existing `Home_RendersWithoutThrowing_AndShowsWelcomeHeading` test):

```csharp
[Fact]
public void Home_Hero_RendersAllThreeParallaxLayers()
{
    UseHandler(new RoutedFakeHttpMessageHandler()
        .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
        .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}""")
        .WhenPathEndsWith("/api/projects", EmptyProjectsJson)
        .WhenPathEndsWith("/api/dashboard", EmptyDashboardJson));

    var cut = Render<Home>();

    var layers = cut.FindAll("img.home-hero-layer");
    Assert.Equal(3, layers.Count);
    Assert.Contains("dashboard-hero-layer1-background.webp", layers[0].GetAttribute("src"));
    Assert.Contains("dashboard-hero-layer2-lights.webp", layers[1].GetAttribute("src"));
    Assert.Contains("dashboard-hero-layer3-foreground.webp", layers[2].GetAttribute("src"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests/frontend --filter Home_Hero_RendersAllThreeParallaxLayers`
Expected: FAIL — today's markup has a single `img.home-hero-image`, not three `img.home-hero-layer` elements.

- [ ] **Step 3: Update `Home.razor`'s hero markup**

Replace lines 12-18 of `frontend/LuminaChronica.Client/Pages/Home.razor`:

```razor
<div class="home-hero">
    <img src="images/home-hero.jpg" alt="" class="home-hero-image" />
    <div class="home-hero-scrim"></div>
    <div class="home-hero-content">
        <h1>Willkommen zurück</h1>
    </div>
</div>
```

with:

```razor
<div class="home-hero" @ref="_heroRef">
    <img src="images/dashboard-hero-layer1-background.webp" alt="" class="home-hero-layer home-hero-layer-1" fetchpriority="high" />
    <img src="images/dashboard-hero-layer2-lights.webp" alt="" class="home-hero-layer home-hero-layer-2" />
    <img src="images/dashboard-hero-layer3-foreground.webp" alt="" class="home-hero-layer home-hero-layer-3" />
    <div class="home-hero-scrim"></div>
    <div class="home-hero-content">
        <h1>Willkommen zurück</h1>
    </div>
</div>
<div class="home-hero-sentinel" @ref="_heroSentinelRef" aria-hidden="true"></div>
```

`@ref="_heroRef"` and `_heroSentinelRef` are consumed by Task 3 — declare both fields now (empty-bodied, unused until Task 3) so this compiles:

In the `@code` block, add near the top (after the existing field declarations):

```csharp
    private ElementReference _heroRef;
    private ElementReference _heroSentinelRef;
```

`ElementReference` is in `Microsoft.AspNetCore.Components`, already available without a new `@using` (Razor components implicitly have this namespace).

- [ ] **Step 4: Replace the hero CSS in `Home.razor.css`**

Replace the `.home-hero-image` rule:

```css
.home-hero-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
```

with:

```css
/* Three depth layers (Dashboard Rework Phase 2) replace the old single
   .home-hero-image. Each layer is sized larger than its container
   (inset: -10% 0 -> 120% height) so Task 2's parallax translateY can move
   it without ever exposing empty space at the top/bottom edge — the
   largest layer (layer-3) moves up to 9%, well inside this 10% margin. */
.home-hero-layer {
    position: absolute;
    inset: -10% 0;
    width: 100%;
    height: 120%;
    object-fit: cover;
}

.home-hero-layer-1 {
    z-index: 1;
}

.home-hero-layer-2 {
    z-index: 2;
}

.home-hero-layer-3 {
    z-index: 3;
}
```

Also add a `transition` declaration to the existing `.home-hero` rule at the top of the file (it already has `overflow: hidden`, which is what keeps the oversized layers from spilling outside the rounded hero corners — this task only adds the one new line, Task 3 is what actually needs the transition, declared here since it belongs on the base rule):

```css
.home-hero {
    position: relative;
    height: 38vh;
    min-height: 260px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin-bottom: var(--space-3);
    box-shadow: var(--shadow-card);
    transition: height var(--motion-standard) var(--ease-standard);
}
```

`.home-hero-scrim` and `.home-hero-content` need `z-index` too now that layered `<img>`s with explicit z-index sit between them and `.home-hero`'s own stacking context — add `z-index: 4;` to `.home-hero-scrim` and `z-index: 5;` to `.home-hero-content` (both already exist as rules in the file; add the one new `z-index` declaration line inside each).

- [ ] **Step 5: Add `.home-hero-sentinel` CSS**

Add, near the other hero rules:

```css
/* Sentinel for Task 3's motion.js initHeaderCompact call — same pattern
   as MainLayout.razor.css's .scroll-sentinel, kept local here since this
   sentinel is Home-page-specific, not app-wide. */
.home-hero-sentinel {
    height: 1px;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `dotnet test tests/frontend --filter Home_Hero_RendersAllThreeParallaxLayers`
Expected: PASS

- [ ] **Step 7: Run the full frontend suite to confirm no regression**

Run: `dotnet test tests/frontend`
Expected: all tests pass (317/317 — the 316 from Phase 1 plus this new one).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Home.razor frontend/LuminaChronica.Client/Pages/Home.razor.css tests/frontend/HomePageTests.cs
git commit -m "feat: replace Dashboard hero with three delivered depth layers"
```

---

## Task 2: CSS scroll-driven parallax

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor.css`

**Interfaces:**
- Consumes: `.home-hero-layer-1/2/3` classes from Task 1.
- Produces: nothing consumed by later tasks — this task is CSS-only and self-contained.

This task has no bUnit test — bUnit cannot evaluate CSS `@supports` queries, `animation-timeline`, or `prefers-reduced-motion`, the same limitation documented repeatedly elsewhere in this project (e.g. Task 2 of the Phase 1 plan, and `DiscoverPageTests.cs`'s comment on why scroll-reveal itself isn't bUnit-tested). Covered by Task 4's live verification instead.

- [ ] **Step 1: Add the parallax keyframes and `@supports`/`prefers-reduced-motion` gate**

Add to `frontend/LuminaChronica.Client/Pages/Home.razor.css`, after the `.home-hero-layer-3` rule:

```css
/* Scroll-driven parallax (Dashboard Rework Phase 2) — pure CSS, no JS
   scroll listener. animation-timeline: view() ties each layer's animation
   progress to the hero's own position crossing the viewport (not the
   page's total scroll distance), which is what makes this a "parallax
   while the hero is in view" effect rather than a drift across the whole
   page. Background moves least, foreground moves most — standard parallax
   depth ordering. All three keyframes start at the layer's own neutral
   transform (translateY(0), implicit "from"), so removing the animation
   entirely (the @supports/prefers-reduced-motion fallback below) leaves
   every layer in exactly the same resting position as the animated case's
   starting point — no separate "static" CSS branch needed.

   Browser support note: animation-timeline: view() shipped in Chromium
   115+ (2023) and Firefox 144+ (2026); Safari does not support it as of
   this writing. The @supports gate means unsupported browsers receive
   none of these rules at all and simply show the static layered hero —
   documented, accepted tradeoff for this personal-use app (see the design
   spec's Phase 2 section). */
@supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
        .home-hero-layer-1 {
            animation: hero-parallax-layer-1 linear both;
            animation-timeline: view();
            animation-range: cover;
        }

        .home-hero-layer-2 {
            animation: hero-parallax-layer-2 linear both;
            animation-timeline: view();
            animation-range: cover;
        }

        .home-hero-layer-3 {
            animation: hero-parallax-layer-3 linear both;
            animation-timeline: view();
            animation-range: cover;
        }
    }
}

@keyframes hero-parallax-layer-1 {
    to {
        transform: translateY(2%);
    }
}

@keyframes hero-parallax-layer-2 {
    to {
        transform: translateY(5%);
    }
}

@keyframes hero-parallax-layer-3 {
    to {
        transform: translateY(9%);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Home.razor.css
git commit -m "feat: add CSS scroll-driven parallax to the Dashboard hero layers"
```

---

## Task 3: Hero compaction on scroll

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/Home.razor.css`

**Interfaces:**
- Consumes: `wwwroot/js/motion.js`'s existing `initHeaderCompact(headerEl, sentinelEl)` export (unmodified — it's already generic over any element pair, not hardcoded to the app header), and the `_heroRef`/`_heroSentinelRef` fields + markup from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Inject `IJSRuntime` and add the module field**

In `frontend/LuminaChronica.Client/Pages/Home.razor`, add to the injection block at the top (after `@inject NavigationManager NavigationManager`):

```razor
@inject IJSRuntime JsRuntime
```

In the `@code` block, add a field next to `_heroRef`/`_heroSentinelRef`:

```csharp
    private IJSObjectReference? _motionModule;
```

- [ ] **Step 2: Wire `initHeaderCompact` from `OnAfterRenderAsync`**

Add a new `OnAfterRenderAsync` override to `Home.razor`'s `@code` block (place it after `OnInitializedAsync`, before `GoToUpload`):

```csharp
    // Reuses motion.js's initHeaderCompact for the hero itself (already
    // generic over any header/sentinel element pair, not app-header-
    // specific). Wired here rather than in MainLayout because this
    // sentinel is Home-page-only; MainLayout's own OnAfterRenderAsync only
    // ever wires the app-wide header. Wrapped in try/catch matching
    // Discover.razor/PublicProfile.razor's own motion.js wiring — a
    // blocked/failed module load just leaves the hero uncompacted, same
    // "progressive enhancement" shape as everywhere else this module is used.
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

- [ ] **Step 3: Add the compaction CSS**

Add to `frontend/LuminaChronica.Client/Pages/Home.razor.css`, after the `.home-hero-sentinel` rule:

```css
/* Toggled by motion.js's initHeaderCompact once .home-hero-sentinel
   scrolls out of view — same mechanism and transition tokens as
   MainLayout.razor.css's .app-header.is-compact. Subtle on purpose:
   less height, not a layout jump. */
.home-hero.is-compact {
    height: 22vh;
    min-height: 160px;
}
```

`.home-hero`'s existing base rule (Phase 1) has `min-height: 260px`, which would otherwise clamp `.is-compact`'s `height: 22vh` to 260px on typical viewport heights (making the compaction partially or fully invisible below ~1182px viewport height) — this second `min-height` on the more specific `.is-compact` selector overrides that floor for the compact state specifically. 160px is proportional to the base floor at the same 22vh/38vh ≈ 0.58 ratio as the height values themselves (260px × 0.58 ≈ 151px, rounded up).

`Home.razor.css` has no `@media (prefers-reduced-motion: reduce)` block yet (confirmed by reading the current file) — add one at the end of the file:

```css
@media (prefers-reduced-motion: reduce) {
    .home-hero {
        transition: none;
    }
}
```

This removes only the smooth height *transition*; the compaction height change itself (driven by `initHeaderCompact`'s `IntersectionObserver`, not by CSS) still happens under reduced motion — exactly matching `MainLayout.razor.css`'s own `.app-header` reduced-motion handling (a state change, not a decorative animation, so it isn't disabled outright).

- [ ] **Step 4: Run the full frontend suite to confirm no regression**

Run: `dotnet test tests/frontend`
Expected: all 317 tests still pass. No new test is added in this task — bUnit's default JSInterop mode throws for the unconfigured `./js/motion.js` import call, which is caught by this step's own `try/catch (Exception)`, so existing tests are unaffected (identical reasoning to why `DiscoverPageTests.cs`/`PublicProfilePageTests.cs` never needed a `JSInterop.SetupModule("./js/motion.js")` call for their own `initReveal` wiring — grep confirms zero such setups exist anywhere in `tests/frontend/` today, and their tests pass regardless).

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Home.razor frontend/LuminaChronica.Client/Pages/Home.razor.css
git commit -m "feat: compact the Dashboard hero on scroll via motion.js initHeaderCompact"
```

---

## Task 4: Live verification against the real deployed backend

**Files:** none (manual verification pass, matching this project's established pattern — see Phase 1's own Task 4, and every prior phase's Roadmap.md entry).

- [ ] **Step 1: Run the frontend locally against the real backend**

Per `documentation/project_lumina_chronica_local_dev` conventions (also documented inline in this repo's own prior sessions): `dotnet run --urls http://localhost:5289` from `frontend/LuminaChronica.Client` — port 5289 specifically, the only origin the backend's CORS allowlist accepts for local dev (`backend/src/middleware/cors.ts`). `wwwroot/appsettings.json`'s `ApiBaseUrl` already points at the real deployed Cloudflare Worker backend by default.

- [ ] **Step 2: Verify the layered hero renders correctly in both themes**

Log in, land on `/`. Confirm all three layers are visible and correctly stacked (background hall, lights/lanterns, foreground column+shelf silhouettes) in both Classic Library and Dark Library themes. Confirm the `.home-hero-scrim` still keeps the "Willkommen zurück" heading legible against the new, busier background (the scrim was tuned against the old flat `home-hero.jpg`, not this three-layer art — if legibility has visibly regressed, that's a real finding to fix in this task, not a separate one, since it's the same visual element this task is landing).

- [ ] **Step 3: Verify the parallax effect**

In a browser that supports `animation-timeline: view()` (current Chrome/Edge), scroll the Dashboard page slowly from the top and confirm the three layers visibly move at different rates (foreground fastest, background slowest) while the hero is in or near the viewport, and that the effect settles back to neutral once the hero has fully scrolled past. In a browser without support (or via DevTools' "Emulate CSS media feature prefers-reduced-motion: reduce"), confirm the hero still renders correctly with all layers static — no visual breakage, no console errors.

- [ ] **Step 4: Verify hero compaction**

Confirm the hero visibly shrinks in height as the page is scrolled down past the sentinel, and expands back when scrolled to the top, in both themes. Confirm this doesn't fight with or look jarring alongside the existing `.app-header.is-compact` behavior happening at the same time (both compact together as the user scrolls, which is the intended combined effect).

- [ ] **Step 5: Regression pass**

Confirm StatCard row, the featured Weiterlesen card, and Aktuelle Projekte (all from Phase 1) still render and behave exactly as before — this task only touches the hero markup/CSS and adds one new `OnAfterRenderAsync` override, nothing that should affect the rest of the page.

- [ ] **Step 6: Update `documentation/Roadmap.md`**

Add a "Dashboard Rework — Phase 2 (Hero)" entry directly after the existing Phase 1 entry, following the same format: what shipped, test counts, an honest live-verification note (call out explicitly if Safari/non-supporting-browser verification wasn't possible in this environment, same honesty standard as Phase 1's WASM-fetch note). Commit this alongside the PR that merges Phase 2.
