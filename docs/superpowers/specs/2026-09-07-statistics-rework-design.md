# Statistics Rework — Design Spec

**Date:** 2026-09-07
**Parent:** Backlog issue #358 ("Core App Experience Rework"), second scoped slice after Dashboard (Phase 1+2, merged via #405-#408). This spec scopes exactly one slice of it: Statistics (`/statistics`, `Statistics.razor`).

## Why this slice, and why split it

Following the same pattern established by Dashboard: work is scoped one page at a time, not as one large rework. Statistics was chosen next per #358's own Immersion Gradient ordering (Dashboard → Statistics → Library → Offline → Settings → Profile) — "The Reading Observatory": stark inszeniert, aber datenorientiert.

Like Dashboard, this splits into two phases because the hero redesign depends on artwork that doesn't exist yet at spec-writing time (prompts written and image generation in progress in parallel with this spec):

- **Phase 1 — Dial/Calendar/Layout**: buildable immediately, no new image assets needed (uses a small brushed-brass CSS texture tile, not a hero).
- **Phase 2 — Three-layer parallax Hero**: gated on new illustration assets, same gate pattern as Dashboard's own Phase 1/Phase 2 split.

## Current state (for reference)

`Statistics.razor` (246 lines) currently renders: a plain text header (no hero), a 5-box stat row (`dashboard-stat` divs, hand-rolled — **not** using the `StatCard` component Dashboard Phase 1 introduced), a Goal Ring (`.goal-ring`, a plain CSS `conic-gradient` driven by a `--goal-pct` custom property, already themed via `--color-primary` — not a rainbow palette, contrary to what #358's text assumes), a calendar heatmap (`.calendar-heatmap`, plain colored `div`s per day scaled via `color-mix(in srgb, var(--color-primary) N%, var(--color-bg-paper))` — also already theme-correct, not rainbow), a yearly overview list, a genre breakdown list, and a recent-activity book grid.

**A real accessibility gap, found while reading the current code**: #358's guardrails claim the Goal Ring/Heatmap accessibility pass was "already done… in #341", but the current code shows only a `title="@day.Tooltip"` attribute on each heatmap `<div>` — `title` on a non-interactive, non-focusable element is not exposed to screen readers and has no keyboard path at all. Whatever #341 actually covered, this specific claim does not match the current code. This is treated as a real, in-scope defect for Phase 1, not a historical footnote.

## Phase 1 — Dial, Calendar, and Layout

### StatCard reuse

The five `dashboard-stat` value/label pairs (Gelesene Bücher/In Arbeit/Gelesene Seiten/🔥 Serie/🏆 Längste Serie) switch from hand-rolled markup to the existing `StatCard` component (`Components/StatCard/StatCard.razor`, `Value`/`Label` string parameters) — the second real caller #358 itself named as a candidate when `StatCard` was introduced in Dashboard Phase 1. Pure extraction: `StatCard` already renders the exact same `.dashboard-stat`/`.dashboard-stat-value`/`.dashboard-stat-label` classes this page's markup uses today, so this is zero CSS/behavior change, same as the original Dashboard extraction.

### Goal Ring → "Brass Reading Dial"

The ring keeps its existing mechanism (`--goal-pct` custom property driving a `conic-gradient(var(--color-primary) …)`) — no new color tokens, no new JS. It gains a metallic bevel treatment: a layered `box-shadow` (inset light-catch on the upper-left edge, inset shadow on the lower-right, matching a physical embossed-dial look) and a thin outer ring border in a slightly darker shade of the same primary color (`color-mix`). The new brushed-brass texture (`wwwroot/images/statistics/brass-texture.webp`) sits behind the ring on a `::before` pseudo-element (`position: absolute; inset: 0; z-index: -1; background: url(...); opacity: 0.15`) rather than as a second `background-image` layer on `.goal-ring` itself — CSS's `opacity` property applies to a whole element, not to one layer of a multi-background stack, so a pseudo-element is the only way to fade just the texture while the `conic-gradient` (which still carries 100% of the actual data meaning) stays at full strength. Missing texture image degrades silently either way — the pseudo-element simply shows nothing, the ring itself is unaffected. **Correction found during Phase 1's final whole-branch review**: `z-index: -1` alone is not sufficient — `.goal-ring` also needs `isolation: isolate` so it establishes its own stacking context; without it, a negative-z-index child hoists behind whatever ancestor *does* establish one (or behind the page itself), not just behind `.goal-ring`'s own background, and can disappear entirely. Both properties together are required. `url()` paths inside `app.css` must also be written relative to `/Styles/` (the stylesheet's own location, e.g. `../images/statistics/brass-texture.webp`), not relative to the site root — the initial implementation used a root-relative-looking path that silently 404'd.

### Heatmap → "Illuminated Reading Calendar"

Same `color-mix(in srgb, var(--color-primary) N%, var(--color-bg-paper))` level scale (no new tokens), with the same `::before`-pseudo-element brass-texture treatment (same reasoning, and the same `isolation: isolate` + `z-index: -1` requirement, as the Goal Ring above) applied once to the `.stats-panel.calendar-card` container — not per-cell, to avoid 364+ repeated background images — and each cell's `border-radius` increased slightly plus a subtle `box-shadow` inset for a raised/illuminated look on the higher-intensity levels specifically (levels 2-4 get the glow treatment; levels 0-1 stay flat, so the "illumination" reads as an earned visual reward for actual reading activity, not decoration on empty cells).

**Accessibility fix (Critical, in scope regardless of the visual rework)**: each calendar cell gains `role="img"` and `aria-label="@day.Tooltip"` (reusing the exact same tooltip text already computed in `CalendarCell.Tooltip`), so the existing per-day date+count information becomes genuinely available to screen readers, not just a hover-only browser tooltip. `title` stays as well (harmless, still useful for mouse users), but is no longer the only channel. **Correction found during Phase 1's final review**: `role`/`aria-label` must be gated on `day.Count > 0`, not applied unconditionally — `Tooltip` is an empty (not null) string for future days, and Blazor still renders an attribute bound to an empty string (only a literal `null` omits it), so an unconditional binding announces blank/unlabeled images for every future and zero-activity cell.

### Guardrails carried over from #358

- No new color tokens — reuse existing (`--color-primary`, `--color-bg-card`, `--color-bg-paper`, `--color-border`, etc.), functional across all 4 existing themes.
- No new motion durations — reuse existing tokens if any transition is added (the ring's existing `transition: background 0.3s ease` stays as-is, not a new duration).
- No fake statistics — only render what `/api/statistics` actually returns; no new charts (Reading Time Line Chart, Streak graph, Monthly Bar Chart, Favorite Genres, Completion Rate) get built without separate backend-scope approval — same explicit deferral as #358's own text.
- No functional regression — Goal Ring set/clear, Heatmap tooltips, Yearly Overview, Genre Breakdown, and Recent Activity must keep working exactly as today.
- Accessibility: the heatmap fix above; the Goal Ring's value is already real text content (`goal-ring-value`/`goal-ring-of` spans), not color-only — confirmed sufficient as-is, no further change needed there.

## Phase 2 — Three-layer parallax Hero (assets delivered, ready to build)

### Assets — delivered 2026-09-07

Three real, separately-generated layers now exist at `frontend/LuminaChronica.Client/wwwroot/images/Designimages/` (PNG masters, gitignored, 3360×1440) and have been optimized to WebP (2400×1029, quality 82, committed) at `frontend/LuminaChronica.Client/wwwroot/images/`:
- `statistics-hero-layer1-background.webp` (174KB) — fully opaque domed observatory chamber: star-chart shelves, carved stone, distant pedestal, warm lantern glow mixed with cool moonlight.
- `statistics-hero-layer2-moonlight.webp` (296KB) — the moonlight shaft + drifting dust motes through the ceiling oculus, genuine alpha transparency (mostly transparent outside the light shaft; a small, low-opacity residual tint survives in one lower corner from generation but is fully covered by Layer 3 in practice, confirmed via the delivered composite preview).
- `statistics-hero-layer3-armillary.webp` (163KB) — a large brass armillary sphere/astrolabe foreground silhouette (left-weighted composition, unlike Dashboard's two-sided column/shelf framing), genuine alpha transparency across the rest of the frame.

Same technique and technical requirements as the Dashboard hero (`documentation/branding/dashboard-hero-parallax-brief.md`): consistent single-point perspective across all three layers, real per-pixel alpha (no chroma-key/black-plate compositing needed, same as Dashboard's actual delivered assets). Original prompts at `documentation/branding/2026-09-07-speculative-image-prompts.md` §1. The one deliberate palette departure from Dashboard's all-warm grading: a cool moonlight accent on the Background layer only, keeping Statistics visually distinct from a re-skin of the same hall, and setting up the brass/instrument material language the Phase 1 dial already established.

The brushed-brass texture used by Phase 1's Goal Ring/heatmap treatment was delivered in the same batch and is already committed at `frontend/LuminaChronica.Client/wwwroot/images/statistics/brass-texture.webp` (512×512, cropped to remove a generation artifact on the source image's left edge).

### Behavior

Identical mechanism to the Dashboard hero, no new decisions to make here:
- **Parallax** — CSS Scroll-Driven Animations (`animation-timeline: view()`), gated behind `@supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) { … } }`. Same three-layer `translateY` depth ordering (background moves least, foreground moves most).
- **Hero compaction on scroll** — reuses `motion.js`'s `initHeaderCompact` sentinel-`IntersectionObserver` pattern a third time (already used for `.app-header` and the Dashboard hero). **Sentinel placement lesson carried forward from Dashboard Phase 2's final-review finding**: the sentinel goes *before* the hero element in markup order, not after — `.home-hero`/`.stats-hero` are not `position: sticky`, so a sentinel placed after the hero only leaves the viewport once the hero has already scrolled fully out of view, making the compaction class apply to something invisible. Get this right the first time instead of re-discovering it.
- **`prefers-reduced-motion`** — parallax `@keyframes` wrapped in `@media (prefers-reduced-motion: no-preference)`; the height-compaction `transition` itself also disabled under `prefers-reduced-motion: reduce`, same as Dashboard.

### Scope boundary

Phase 2 ships as its own issue/PR, separate from Phase 1 — exact same shape as Dashboard.

## New/changed components summary

| Component | Change |
|---|---|
| `StatCard` | Second real caller (Phase 1) |
| `Statistics.razor` | Goal Ring bevel+texture, Heatmap texture+glow+ARIA fix, hero markup (Phase 2, gated) |

## Verification approach

Same as every prior phase: bUnit coverage for changed markup (StatCard usage, the new `role="img"`/`aria-label` on heatmap cells) plus live verification against the real deployed backend in both themes, `prefers-reduced-motion` on/off for Phase 2's parallax, and a regression check of Goal Ring set/clear + Heatmap tooltips + Yearly Overview + Genre Breakdown + Recent Activity per the guardrail above. Given this session's Dashboard Phase 2 experience, hero-compaction live verification specifically must check the element's actual on-screen visibility at the moment the compaction class applies (`getBoundingClientRect()` against the viewport), not just that the CSS class toggled — a class-only check already produced one false "confirmed working" result on Dashboard that a later whole-branch review had to catch.

## Explicitly out of scope for this spec

- Library, Offline, Settings, Profile reworks (separate future slices of #358).
- The two new themes (Alexandria/Babylon) and the associated 3D-room-navigation idea (captured as a design note in #358 itself, not scoped).
- New backend endpoints, schema changes, or any of the additional chart ideas (Reading Time Line Chart, Streak, Monthly Bar Chart, Favorite Genres, Completion Rate) named in #358 as future enhancements.
- `app.css` sectioning cleanup.
