# Dashboard Rework — Design Spec

**Date:** 2026-09-07
**Parent:** Backlog issue #358 ("Core App Experience Rework — Dashboard/Library/Statistics/Offline/Settings/Profile"), which is explicitly unscoped and not a start signal. This spec scopes exactly one slice of it: the Dashboard (`/`, `Home.razor`).

## Why this slice, and why split it

#358 covers six pages. Following the same pattern as the completed epic #349 (Living Library Feedback System), work is scoped one page at a time rather than as one large rework. Dashboard was chosen first because it's the highest-immersion page in #358's own gradient ("The Great Reading Hall").

Within Dashboard, the work splits into two phases because the Hero redesign depends on artwork that doesn't exist yet:

- **Phase 1 — Layout**: buildable immediately, no new assets needed.
- **Phase 2 — Hero**: gated on new illustration assets (see below), same gate pattern as #349's Phase D/E (mascot asset pipeline).

Two items from #358 are explicitly **out of scope** for this slice and stay separate, later efforts:
- The two new themes ("Verlorene Bibliothek von Alexandria", "Hängende Gärten von Babylon").
- The optional `app.css` (~2000 lines) sectioning cleanup.

## Current state (for reference)

`Home.razor` (121 lines) currently renders: a static hero (`home-hero.jpg` + scrim + `<h1>`), a "Weiterlesen" grid (plain `BookCard`s, blue progress bar), a 4-box stat row (`dashboard-stat` divs), the recent-books grid, a "Empfehlungen" grid, and an "Aktuelle Projekte" section that **always renders `EmptyState`, regardless of real data** — it was never wired to the Projects API that has existed since v2.0 (epic #9; Roadmap.md explicitly notes this was left untouched at the time).

## Phase 1 — Dashboard Layout

### Weiterlesen: Featured + grid layout

The first `ContinueReading` entry renders as a larger "featured" card; up to 4 more render at normal size alongside it (the backend already caps `ContinueReading` at 5, so no extra client-side truncation is needed). Correction after checking the actual component: `BookCardSize.Large` and its `.book-card-large` CSS already exist (added at some point, never wired to a real caller) — no new size needs adding, just a real usage. Reading progress on the featured card switches from `book-card-progress-bar`'s current `--color-secondary` fill (oxblood/gray depending on theme, not blue as first assumed) to a thin gold line using `--color-accent-text` — the same accessible gold token the #341 a11y pass introduced for rating stars/focus rings (`--color-gold-accent` itself fails the 3:1 non-text contrast floor). Scoped to `.book-card-large` only, so Library/Reader's existing `Normal`/`Small` cards are untouched.

### Stat row → `StatCard` primitive

The four `dashboard-stat` value/label pairs (Bücher/Regale/Favoriten/Gelesen) become a new `StatCard` component. This is the only new shared primitive introduced in this phase — justified because it replaces 4 already-duplicated instances on this page alone (not a speculative abstraction for hypothetical future reuse, though `StatCard` was named as a candidate in #358 and may get a second real caller later on Statistics).

### Aktuelle Projekte: wire to real data

Fetch real projects (`GET /api/projects`, same request-shape pattern already used for books in `Home.razor`'s `OnInitializedAsync`) and render a small grid of recent projects, falling back to `EmptyState` only when the user genuinely has none. This is **not new functionality** — the Projects API and its CRUD have been live since v2.0 — it's connecting an existing, always-on placeholder to data that already exists. In scope specifically because Phase 1 is redesigning this exact section's visual treatment, and shipping a redesigned section that still always shows "no projects" regardless of truth would be worse than not touching it.

### Guardrails carried over from #358 (apply to all of Phase 1)

- No new color tokens — reuse existing (`--color-bg-paper`, `--color-primary`, `--color-gold-accent`, etc.), functional across all 4 existing themes.
- No new motion durations — reuse `--motion-micro` (130ms) / `--motion-standard` (200ms) / `--motion-reveal` (320ms) from #351.
- No fake statistics — only render what the API actually returns.
- No functional regression — Continue Reading, Recommendations, and the `ownerUsername` "Geliehen von"-badge on shared books must keep working exactly as today.
- Accessibility: `StatCard` values and the gold progress line need non-color-only meaning (e.g. `aria-label`/text equivalent), consistent with the accessibility pass already done for Statistics' Goal Ring/Heatmap in #341.

## Phase 2 — Three-layer parallax Hero (assets delivered, ready to build)

### Assets — delivered 2026-09-07

Three real, separately-generated layers now exist at `frontend/LuminaChronica.Client/wwwroot/images/Layerimage/` (PNG masters, gitignored, 3360×1440) and have been optimized to WebP (2400×1029, quality 82, committed):
- `dashboard-hero-layer1-background.webp` (302KB) — fully opaque grand hall interior: columns, bookshelves, marble floor, warm light, distant statue.
- `dashboard-hero-layer2-lights.webp` (528KB) — hanging lanterns + light shafts/dust, with **genuine alpha transparency** (~42% of pixels fully transparent, not a flat black plate).
- `dashboard-hero-layer3-foreground.webp` (92KB) — column silhouette (left) + bookshelf edge (right), **genuine alpha transparency** in the center (~70% of pixels fully transparent).

This is better than the original brief assumed: the brief's fallback compositing instructions (pure-black plate + `Screen` blend for the light layer, magenta chroma-key for the foreground layer) are **not needed** — all three layers already carry real per-pixel alpha and can be stacked with plain `<img>`/`background-image` alpha compositing, no blend-mode or color-keying logic required.

### Behavior

- **Parallax mechanism — CSS Scroll-Driven Animations (`animation-timeline: scroll()`), not a scroll-event listener.** This is a genuinely zero-JS way to move each layer at a different rate as the hero scrolls past — `animation-timeline: scroll(nearest block)` drives a `@keyframes` translateY per layer, with the three layers using three different distances (background moves least, foreground moves most, matching real-world parallax). This satisfies the guardrail more strongly than a scroll listener would (nothing runs on the main thread at all, vs. even a passive/rAF-throttled listener). **Documented tradeoff**: Baseline browser support for scroll-driven animations landed in Chrome/Edge 115+ (2023) and Firefox 144 (2026); Safari remains unsupported as of this writing. Un-supporting browsers simply see the layers in their static, non-parallaxed position — a real but graceful degradation (same "worst case is static, never broken" shape as `initReveal`'s own fallback), acceptable for this personal-use app. `@supports` gates the animation rules so unsupported browsers never receive them at all.
- Hero compaction on scroll reuses the existing `motion.js` `initHeaderCompact` pattern as-is (sentinel `IntersectionObserver` toggling `.is-compact`), applied to the hero element instead of `.app-header`.
- `prefers-reduced-motion`: the scroll-driven `@keyframes` rules are wrapped in `@media (prefers-reduced-motion: no-preference)` — under reduced motion, layers render in their static base position (no parallax offset), never hidden.
- Performance: Layer 1 (background) loads as a plain `<img>`/CSS background with no JS dependency, so it's never blocked by animation-timeline support detection or module loading — keeps it LCP-safe per #352's precedent. Total payload for all three layers (~920KB) is a real increase over the single `home-hero.jpg` it replaces (164KB, ~5.6×) — not comparable in size, an accepted tradeoff for the added depth given this is a personal-use app, not a payload-parity claim.

### Scope boundary

Phase 2 ships as its own issue/PR, separate from Phase 1 (already merged).

## New/changed components summary

| Component | Change |
|---|---|
| `StatCard` | New primitive (Phase 1) |
| `BookCard` | Wire up existing (unused) `Large` size + gold progress line for it (Phase 1) |
| `Home.razor` | Weiterlesen featured layout, `StatCard` row, real Projects fetch (Phase 1) |
| Dashboard hero markup/CSS | Three-layer parallax + compaction (Phase 2, gated) |

## Verification approach

Consistent with every prior phase in this project: bUnit coverage for new/changed components (`StatCard`, `BookCard`'s new size, the Projects-fetch branch including its empty/error states) plus live verification against the real deployed backend and D1 — real project data in both themes, `prefers-reduced-motion` on/off for Phase 2's parallax, and a regression check of Continue Reading/Recommendations/the borrowed-book badge per the guardrail above.

## Explicitly out of scope for this spec

- Library, Statistics, Offline, Settings, Profile reworks (separate future slices of #358).
- The two new themes.
- `app.css` sectioning cleanup.
- Any new backend endpoints or schema changes — Phase 1's Projects wiring uses the existing API as-is.
