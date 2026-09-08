# Statistics Polish — Design Spec

**Date:** 2026-09-08
**Parent:** Follow-up feedback on Statistics Rework (#358's second scoped slice), merged via #411/#413/#414. User feedback after the parallax-timeline defect was fixed: "das licht bei den 3 schichtigen bild ist nicht transparent genug, lesekalender nicht wirklich gut designed und die emojis sehen nicht sehr professionell aus."

## Why three phases, and why split them

Three independent complaints with very different size and risk, following the same shippable-slice discipline Dashboard and Statistics used:

- **Phase A — Hero light transparency**: one CSS property, one file, Statistics only.
- **Phase B — Icon system rollout**: mechanical but touches ~10 files across the app, including the main nav (highest visibility of the three).
- **Phase C — Calendar redesign**: the most visually creative change, CSS-only, but the one most likely to need iteration on "does this actually look right."

Each ships as its own PR so a problem in one doesn't block or get tangled with the others.

## Phase A — Hero light-layer transparency

**Problem**: `statistics-hero-layer2-moonlight.webp`'s light shaft reads as a solid, milky object rather than translucent light, per direct user feedback (confirmed against the current live rendering, not assumed from the source asset alone).

**Fix**: `.stats-hero-layer-2` gains `mix-blend-mode: screen` in `Statistics.razor.css`. `screen` blend treats black pixels as contributing nothing and blends bright pixels additively — exactly the right model for "light shaft over a dark scene," and it requires no new image asset.

**Verified live before writing this spec** (not just asserted): with the blend mode applied, the beam reads as airy light with the background architecture and star-chart windows visible through it, instead of a flat white cone. Screenshotted before/after at the same scroll position. Also checked: the raw source image has a visible red/green/orange generation-artifact stripe on its left edge (more prominent than the design spec's original "small, low-opacity residual tint" note) — confirmed via zoomed screenshot that Layer 3's armillary-sphere silhouette fully covers this region in the live composite, in both the current and blend-mode-applied states, so it does not need a fix in this phase.

**Scope boundary**: Statistics hero only. The Dashboard hero's layers are architectural (columns/shelves), not a light-shaft image, so this specific complaint doesn't apply there — no change to `Home.razor.css` in this phase.

**Testing**: no bUnit coverage is possible or meaningful (this is a rendering/compositing behavior, not markup) — same category as the parallax-timeline fix. Verification is the live before/after screenshot comparison already done for this spec, repeated once more against the final committed CSS during implementation.

## Phase B — Icon system rollout (emoji → `Icon` component)

**Problem**: colored pictographic emoji read as unprofessional in a data/UI context. The existing `Icon` component (`Components/Icon/Icon.razor`) already exists for exactly this reason — its own code comment states it's "used instead of emoji so chrome reads consistently" — and is already used in the nav bell, profile link, search, and toast icons. This phase extends that existing pattern to the emoji still in use, rather than introducing a new system.

**Explicitly not in scope**: Unicode symbols already reading as clean typography, not colorful emoji — star ratings (★☆), checkmarks (✓✕), and the `❦` fleuron used in `EmptyState`'s literary-themed empty states. These are not the "unprofessional emoji" the feedback was about and stay as-is.

**New icon definitions needed** in `Icon.razor`'s existing `switch` (same 24×24 viewBox, `stroke-width: 1.4`, hand-drawn line style as the 7 existing icons — no new component API, `Name`/`Class` parameters are unchanged):

| New icon name | Replaces | Used in |
|---|---|---|
| `home` | 🏠 | `NavMenu.razor` |
| `chart` | 📊, 📈 | `NavMenu.razor` (Statistik), `Statistics.razor` (Jahresübersicht header) |
| `box` | 📦 | `NavMenu.razor` (Offline) |
| `settings` | ⚙ | `NavMenu.razor`, `Reader.razor` |
| `flame` | 🔥 | `Statistics.razor` (Serie StatCard) |
| `trophy` | 🏆 | `Statistics.razor` (Längste Serie StatCard) |
| `target` | 🎯 | `Statistics.razor` (Jahresziel header) |
| `calendar` | 📅 | `Statistics.razor` (Lesekalender header) |
| `discover` | 🌍 | `NavMenu.razor` (Entdecken) |
| `location-pin` | 📍 | `LocationDetail.razor` (cover placeholder), `ProjectDetail.razor` (map pins) |
| `document` | 📄 | `BookDetail.razor`, `BookUpload.razor`, `ProjectDetail.razor` (non-image attachments) |
| `image` | 🖼 | `ProjectDetail.razor` (image attachments) |
| `bookmark` | 🔖 | `Reader.razor` |
| `toc-list` | 📑 | `EpubReader.razor` |

**Reused existing icons** (no new definition needed): `book` already covers 📖/📚 — reused for `NavMenu.razor` (Bibliothek), `BookDetail.razor` and `ShelfDetail.razor` cover placeholders. `project` (existing globe/meridian glyph) already covers 🌎 — reused for `NavMenu.razor` (Projekte) and `ProjectDetail.razor`'s cover placeholder. `person` already covers 🧑 — reused for `CharacterDetail.razor`'s cover placeholder.

Exact SVG path data for the 14 new icons is an implementation detail, drawn during the implementation task in the same hand-drawn style as the existing set — not specified here.

**Testing**: confirmed (not assumed) two existing bUnit test files have real dependencies on the exact emoji text that need updating, not just cosmetic assertions:
- `StatisticsPageTests.cs:136-137` — `Assert.Contains("🔥 4", cut.Markup)` and `Assert.Contains("🏆 9", cut.Markup)` need to become assertions against the new `Icon`-based markup instead.
- `ReaderPageTests.cs` — four call sites select the bookmarks button via `cut.FindAll("button").Single(b => b.TextContent == "🔖 Lesezeichen")` (exact `TextContent` equality, not `Contains`), and one selects the TOC button the same way via `"📑 Inhaltsverzeichnis"`. Replacing the emoji with an `Icon` child changes what `TextContent` resolves to, so these five selectors must be updated in the same commit as the markup change or the test suite breaks immediately — this is a real coupling, not a hypothetical one.

No new component logic otherwise — `Icon.razor` itself is unchanged except its `switch` growing new cases, which is exactly the pattern its 7 existing cases already established.

## Phase C — Calendar redesign ("Sternenkarte")

**Problem**: the current heatmap (`color-mix`-graded squares in a GitHub-contribution-graph layout) reads as a generic, off-the-shelf tracker widget, disconnected from the Reading Observatory's star-chart/astrolabe visual language already established by the hero art and the Goal Ring's "Brass Reading Dial."

**What stays unchanged**: the C# data model and grid structure entirely — `CalendarCell` record, `BuildCalendarWeeks()`, the `calendar-cell--level-0` through `-4` classes, and Phase 1's `role="img"`/`aria-label` accessibility fix (gated on `day.Count > 0`). This phase is a CSS-only visual reskin of the existing, already-correct data and accessibility layer — no risk of regressing the Phase 1 a11y fix.

**Visual change**: each `.calendar-cell` keeps its current uniform grid footprint (so columns/rows stay aligned and the "unlabeled" bug fixed in Phase 1 doesn't need retesting), but the visible mark inside it becomes a circular "star point" (`border-radius: 50%`) instead of a rounded square, sized and glowing (`box-shadow`) in proportion to its activity level — level 0 nearly invisible, level 4 a bright glowing point — rather than today's flat color fill. The `.calendar-heatmap` container's background gains a subtle dark radial-gradient "night sky" treatment, built from existing theme tokens (`color-mix` against `--color-bg-dark`/`--color-primary`, no new color tokens per the project's standing guardrail from #358) so it stays correct across all four existing themes rather than a fixed dark color that could clash with light themes.

**Rejected alternative**: a radial 52-week spiral dial matching the Goal Ring's circular form. Visually the most distinctive option, but introduces day-to-angle placement math, harder scanability (a git-style grid is immediately legible; a spiral requires learning to read), and meaningfully more implementation/testing surface for a "polish" pass. Not recommended — the star-chart reskin gets most of the thematic win at a fraction of the risk.

**Testing**: no new C#/bUnit tests — the underlying markup structure and classes are unchanged, so Phase 1's existing `Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel`/`Statistics_CalendarCell_ZeroActivityDay_HasNoRoleOrAriaLabel` tests continue to cover the a11y behavior without modification. Verification is live-visual: confirm the star-point sizing/glow reads correctly across activity levels and across all four themes, same rigor as Phase 1/2's own live-verification passes.

## Guardrails carried over from #358 and prior phases

- No new color tokens (Phase C's night-sky background is derived from existing tokens via `color-mix`).
- No functional/data regression — calendar tooltips, `role`/`aria-label`, Goal Ring, StatCards, Yearly Overview, Genre Breakdown, Recent Activity all keep working exactly as today across all three phases.
- Icon replacements (Phase B) are visual-only — no navigation behavior, routing, or `href` changes.
- Each phase ships as its own PR; live verification in both a light and a dark theme is required before any phase is considered done, per this project's standing honesty convention (never claim "live-verified" without an actual browser check).

## Explicitly out of scope for this spec

- Any change to the Dashboard hero's own layers (Phase A's transparency complaint is Statistics-specific).
- Regenerating the moonlight source image — the CSS blend-mode fix resolves the complaint without it; image regeneration stays available as a fallback if `mix-blend-mode: screen` turns out insufficient once seen in more themes/conditions during implementation.
- Any other page's emoji not enumerated in Phase B's table (this list was produced by an app-wide search for pictographic emoji; if implementation turns up additional instances, they should be flagged, not silently left out or silently added beyond this list without a quick check-in).
- The remaining pages named in #358 (Library/Offline/Settings/Profile), the two new themes, and `app.css` sectioning cleanup all stay explicitly out of scope, unchanged from every prior phase's spec.
