# Statistics Visuals Round 2 & App-Wide Input Styling — Design Spec

## Overview

Follow-up feedback after the Statistics Polish round (#415-#417, all merged). Two independent tracks bundled into one spec/plan/implementation cycle because they surfaced in the same conversation and both touch the Statistics page, but they are genuinely separate concerns with separate risk profiles:

- **Track A** — app-wide base styling for `input`/`select`/`textarea`. Currently there is *no* global styling for these elements anywhere in the codebase (confirmed via grep: the only project-wide rule touching them is a `:focus-visible` outline). Every form field in the app — login, register, library search, book upload, settings, the Statistics goal input — renders on raw browser defaults. The Statistics "Jahresziel" number input is what surfaced this, but the fix is app-wide.
- **Track B** — two Statistics-page visual refinements:
  - **B1**: Genre Breakdown and Yearly Overview both currently render as a flat single-color horizontal bar per row (`.statistics-genre-bar-track`/`.statistics-genre-bar-fill`, reused identically by both sections). User feedback: "bloß eine Linie... ziemlich fad" (just a line, pretty bland).
  - **B2**: the Lesekalender ("Sternenkarte," shipped in Phase C, #417) requires horizontal scrolling to see all 52 weeks, because it shares a 50/50 grid column with the Goal Ring panel and the star-point cell pitch (~14px) needs ~738px for 52 weeks — wider than the ~520-540px column actually available. User feedback: the scrollbar "sieht ned clean aus."

## Track A: App-Wide Input Styling

**Scope:** add base styling for `input` (all common text-like types: `text`, `search`, `number`, `email`, `password`), `select`, and `textarea` to `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`. This is purely additive visual styling — no markup changes anywhere, no behavior changes, no new C# code.

**Design:** match the existing card/panel visual language already established by buttons and dropdowns (`.btn`, `MultiSelectDropdown` — check their exact token usage before implementing, follow the same border/radius/background pattern rather than inventing a new one). Concretely:
- `background-color: var(--color-bg-card)`
- `border: 1px solid var(--color-border)`
- `border-radius: var(--radius)`
- `padding`: consistent with `.btn`'s existing padding scale (reuse `--space-*` tokens, do not invent new spacing values)
- `color: var(--color-text-primary)`
- On `:focus-visible`, layer on top of (not replace) the existing global focus-visible rule at `app.css:396-398` — check that rule's exact declaration before adding anything so the two rules compose correctly instead of one silently overriding the other.
- `select` needs the same treatment; native select-arrow styling is browser-default and out of scope (no custom SVG arrow — that's a bigger undertaking with cross-browser quirks not asked for here).
- Do not touch checkbox/radio inputs (`input[type="checkbox"]`, `input[type="radio"]`) — out of scope, they render fine today and weren't part of the complaint. Scope the selector explicitly (e.g. `input:not([type="checkbox"]):not([type="radio"])` or an explicit list of the text-like types) so this doesn't accidentally restyle checkboxes across the app.

**Verification:** since this touches every form in the app, live-verify a representative sample after implementation — not exhaustively every page, but enough to catch a real regression: the Statistics goal input (motivating case), the Library search box, the Settings page (has both text inputs and the notification checkboxes — confirms checkboxes were correctly excluded), and the Login page (a not-yet-reworked page, to confirm the change doesn't look broken outside the "Living Library" aesthetic pages). Check all 4 themes for at least one of these (the goal input, since it's already the reference case), spot-check the other three in one theme.

## Track B1: Mini Brass Dials

Replace the flat bar in both `.statistics-genre-row` (Genre Breakdown) and `.yearly-overview-row` (Yearly Overview) with a small ring reusing the same visual technique as the existing "Brass Reading Dial" Goal Ring (`app.css:1027-1066`): a `conic-gradient(var(--color-primary) calc(var(--pct) * 1%), var(--color-border) 0)` ring with the value centered inside, at a much smaller scale (roughly 2.5-3rem diameter vs. the Goal Ring's 8rem) — a "mini instrument" rather than a literal shrink of the full component (the Goal Ring's `::before` brass-texture overlay and layered inset/outset box-shadow are visual investments proportional to its 8rem size; at 2.5-3rem those effects would be imperceptible or muddy, so the mini dial should carry only what still reads at that size: the conic-gradient ring, a solid `--color-bg-card` inner circle, and the centered value — no texture overlay, no dual inset+outset shadow).

**Genre Breakdown** (`.statistics-genre-row`, currently `grid-template-columns: 8rem 1fr 2.5rem` for label/bar/count): becomes label + mini-dial, dropping the separate trailing count text since the value now lives inside the dial (matching the Goal Ring's own pattern of centering the number). Percentage for the conic-gradient is the row's share of the section's max count (`genre.Count * 100.0 / maxGenreCount`), exactly the same ratio the current bar's `width` already computes — only the rendering changes, not the underlying math.

**Yearly Overview** (`.yearly-overview-row`, currently `grid-template-columns: 4rem 1fr` for year/bar, with a second full-width detail row below): the mini-dial replaces the bar in the same position; the detail text row (`"@year.BooksFinished Bücher · @year.PagesRead Seiten · @year.ActiveDays aktive Tage"`) is unchanged, still spanning full width below. Percentage: same `year.BooksFinished * 100.0 / maxBooksPerYear` ratio the current bar already uses.

**Shared component or duplicated CSS?** Both sections need the identical mini-dial markup/CSS pattern. Follow the codebase's existing precedent — `StatCard` is already a shared Blazor component reused across Dashboard and Statistics. A small `MiniDial` component (`Value`, `Percentage` or `Current`/`Max` parameters) used by both `Statistics.razor` call sites is more consistent with that precedent than duplicating the same conic-gradient CSS block under two different class names. Keep it minimal: no icon slot, no size variants — YAGNI, this is a two-call-site component solving one specific visual repetition.

**Accessibility:** the current bars have no `aria-label`/`title` beyond the visible text — verify whether that's already a gap (check `StatisticsPageTests.cs` and the live markup) before deciding whether this redesign needs to add one or whether it's carrying forward an existing (out-of-scope-to-fix-here) gap. Do not silently introduce a *new* accessibility regression versus the bar version: if the bar's value was in visible text next to it and the dial keeps that text, no new gap is created either way.

## Track B2: Compact No-Scroll Calendar

**Layout stays as-is**: Goal Ring and Lesekalender remain side-by-side in `.stats-panels`' existing grid (no stacking, no height increase — explicitly rejected during brainstorming as making the page feel taller/less overview-friendly).

**Cell density tightens toward a GitHub-contribution-graph reference point** (~10-11px cell size, ~2px gap, ~12-13px pitch, vs. the current 0.7rem cell + 3px gap ≈ 14.2px pitch) so all 52 weeks fit inside the available column width without triggering `overflow-x` scroll on typical desktop viewports. The brainstorming mockups (approximate, non-DOM-accurate demo container) suggested this direction works, but the **exact final values (cell size, gap, and whether the calendar column needs to become asymmetrically wider than the Goal Ring's column — e.g. `grid-template-columns: 1fr 1.6fr` instead of the current symmetric `auto-fit, minmax(18rem, 1fr)`) must be tuned live against the real rendered column width**, not locked to the mockup's approximate numbers. This is the same live-tuning approach Phase C used for the star-glow values.

**Readability at smaller size**: brainstorming surfaced a real risk — shrinking both the cell AND the inner `::before` star-point dot (currently sized as a percentage of the cell) compounds into a dot that's too small to read the level-0-through-4 progression clearly, worse than GitHub's own flat-filled squares suffer at the same pitch (a percentage-sized dot inside a shrinking cell loses more perceptual area than a cell that's entirely filled with color). When tuning live, prioritize keeping the star-point dot's *glow radius* (the `box-shadow` blur) relatively generous even as the base dot shrinks — blur extends visible presence beyond the literal dot without growing the dot itself, which is cheaper for readability than only scaling the dot's flat size. If tightening the pitch alone doesn't produce an acceptably readable result at the real column width, giving the calendar column more relative width (asymmetric grid, above) is the next lever — try pitch-tightening first since it's lower-risk (doesn't touch the shared grid), fall back to the asymmetric column only if needed.

**No month/weekday labels.** Considered during brainstorming (a real GitHub feature) and explicitly dropped for this round: they add width and height for orientation value the user didn't ask for — the ask was specifically "remove the ugly scrollbar," not "add more chart chrome." Revisit only if a future round asks for it.

**Rejected alternatives** (brainstormed, explicitly decided against — do not revisit without new instruction):
- **Two-row wrap** (26 weeks × 2 rows): avoids scroll but increases panel height, which the user pushed back on ("warum so hoch").
- **Full-width layout** (calendar spans full content width, Goal Ring moves to a compact row above/beside it): solves the fit problem cleanly (this is genuinely how GitHub itself avoids the problem — its graph gets a dedicated wide container) but was rejected for increasing overall page height/reducing "Überblick" by stacking instead of keeping the side-by-side layout.
- **Book-Spine-Shelf** (bars-as-book-spines for B1): visually well-received ("cool") but not chosen — Mini Brass Dials won on readability grounds and for reusing an already-established visual motif (the Goal Ring) instead of introducing a new one.

## Global Constraints

- No new color tokens anywhere in either track — every color derives from existing theme tokens (`--color-primary`, `--color-border`, `--color-bg-card`, `--color-text-primary`, `--color-text-muted`, etc.), verified across all 4 themes (Classic Library, Dark Library, Modern Light, System).
- No C#/data-model changes in either track. Track A touches only CSS. Track B1 touches `Statistics.razor` markup (replacing the bar markup with the new dial component) and adds one small new Blazor component; the underlying percentage math is unchanged, just re-plumbed into the new component's parameters. Track B2 touches only CSS (and possibly `.stats-panels`' grid-template-columns, a CSS-only change) — the calendar's C# data model, grid structure, and Phase 1 accessibility markup (`role="img"`/`aria-label`) from Phase C stay untouched, same constraint as Phase C itself.
- Existing bUnit tests: `StatisticsPageTests.cs` currently asserts `dashboard-stat-value">3<` style exact-value-in-markup patterns and checks for specific class names (`calendar-heatmap`, `calendar-cell--level-4`, etc.) — none of the calendar's existing tests should need changes (Track B2 is CSS-only). Track B1's markup change (bar → dial component) may break any test asserting on `.statistics-genre-bar-fill`/`.yearly-overview-row` structure specifically — grep before implementing and fix any real coupling found, following the same "check don't guess" approach used in Phase B's icon rollout.
- Live-visual verification required across all 4 themes for both Track A (spot-check, see above) and Track B (both B1 and B2), following the established technique (JWT + `window.fetch` intercept against a local dev server). Document results honestly in the Roadmap.md entry, including any theme where something doesn't read as well as intended, same norm as every prior phase this round.

## Testing

- Track A: no new C#/bUnit tests expected (pure CSS). Existing tests that assert on rendered markup structure (not visual styling) should be unaffected.
- Track B1: the new `MiniDial` component gets its own bUnit test (renders value + correct `--pct` custom property from a given current/max pair, matching the pattern of `StatCardTests.cs`). Existing `Statistics_ShowsGenreBreakdown_WhenGenresExist` and `Statistics_ShowsYearlyOverview_WhenPresent` tests in `StatisticsPageTests.cs` (asserting genre/year text appears) should keep passing since the underlying data and its textual representation don't change — verify this rather than assuming it, since the markup structure around that text does change.
- Track B2: no new tests (CSS-only, same reasoning as Phase C).
