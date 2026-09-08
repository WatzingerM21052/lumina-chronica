# Statistics Polish Phase C: Calendar Redesign ("Sternenkarte") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the reading-calendar heatmap on the Statistics page from flat colored squares into a "star chart" — circular glowing star-points on a dark night-sky field — without touching the C# data model, grid structure, or accessibility markup.

**Architecture:** Pure CSS change in `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`. The existing `.calendar-cell` / `.calendar-cell--level-0` through `-4` classes stay as the activity-level selectors the Razor markup already emits; only their visual treatment changes. Each cell becomes a small dark circular "sky patch" containing a `::before` pseudo-element star-point whose size, opacity, and glow scale with activity level. The `.calendar-heatmap` container gets a dark radial-gradient "night sky" background. The `.calendar-legend` swatches reuse the same `.calendar-cell`/`.calendar-cell--level-N` classes already in the Razor markup, so they pick up the new look for free.

**Tech Stack:** Blazor WebAssembly (.NET 10), plain CSS (`color-mix()`, `radial-gradient()`, CSS custom properties). No new C# code, no new bUnit tests (see Global Constraints).

## Global Constraints

- **No C#/Razor changes.** `CalendarCell` record, `BuildCalendarWeeks()`, and the `Statistics.razor` markup emitting `calendar-cell calendar-cell--level-@day.Level` plus the Phase 1 `role="img"`/`aria-label` accessibility attributes (gated on `day.Count > 0`) are unchanged. This phase is CSS-only.
- **No new C#/bUnit tests.** Markup structure and class names are unchanged, so the existing `Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel`, `Statistics_CalendarCell_ZeroActivityDay_HasNoRoleOrAriaLabel`, and `Statistics_RendersCalendarHeatmap_WithTodayAsAFullIntensityCell` tests in `tests/frontend/StatisticsPageTests.cs` must continue to pass unmodified — do not edit that file.
- **No new CSS custom properties / color tokens.** Every color value must derive from the existing tokens already defined per-theme: `--color-primary`, `--color-bg-dark`, `--color-border`. Use `color-mix(in srgb, ...)` to derive shades, exactly like the existing calendar CSS and the Goal Ring CSS already do (`app.css:1037-1038`).
- **The uniform grid must not change.** Every `.calendar-cell` keeps the same `0.7rem` × `0.7rem` footprint regardless of level, so columns/rows/weeks stay pixel-aligned with each other. Apparent "size" differences between activity levels come from an inner `::before` dot sized as a percentage of that fixed footprint — never from resizing `.calendar-cell` itself.
- **The brass-texture panel frame (Phase 1) is not removed.** `.stats-panel.calendar-card` and its `::before` brass-texture overlay (`app.css:998-1013`) stay exactly as they are. Deliberate design choice for this phase: the new dark "night sky" background painted onto `.calendar-heatmap` will visually sit on top of the texture within the heatmap's own bounds, while the texture remains visible everywhere else in the panel (the `<h2>` header row and the padding around the heatmap/legend). This reads as a brass-framed window looking onto a starfield, not as the texture being disabled — mention this explicitly in code comments so it isn't mistaken for a regression later.
- **Verify all four themes**, not just two: Classic Library, Dark Library, Modern Light, and System (which resolves to Modern Light's palette in light mode and Dark Library's in dark mode — see `themes/system.css`). `--color-bg-dark` is a genuinely dark color in all four (`#241a12` Classic Library, `#1f2328` Modern Light, `#1f2328`/`#120d09` System light/dark, `#120d09` Dark Library) — confirmed by grep before writing this plan — so the night-sky effect is expected to read correctly everywhere, but this must be confirmed visually, especially for Modern Light where a dark panel sits inside an otherwise light page.
- **The calendar legend needs its own fix.** The five legend swatches (`Statistics.razor`, inside `<div class="calendar-legend">`) sit *outside* `.calendar-heatmap`, directly on the panel's normal (light-in-light-themes) background — they do NOT inherit the heatmap's dark backdrop. Because every `.calendar-cell` (see below) now always paints its own small dark circular base regardless of context, the star-point dots stay legible in the legend too, without any markup change and without wrapping the legend in a new element.

---

### Task 1: Calendar Star-Chart CSS Reskin

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css:1108-1150` (the `.calendar-heatmap`, `.calendar-week`, `.calendar-cell`, `.calendar-cell--level-0` through `-4`, and `.calendar-legend*` rules — read the current file to confirm exact current line numbers before editing, they may have shifted slightly since this plan was written)

**Interfaces:**
- Consumes: existing CSS custom properties `--color-primary`, `--color-bg-dark`, `--space-1`, `--space-2`, `--radius` (all already defined per-theme / in `app.css`'s base tokens — do not redefine them).
- Consumes: the existing Razor markup in `Statistics.razor` (already committed, unchanged by this task) — `.calendar-heatmap` > `.calendar-week` > `.calendar-cell.calendar-cell--level-N` grid, and `.calendar-legend` > label spans + `.calendar-cell.calendar-cell--level-N` swatch spans.
- Produces: nothing consumed by later tasks — this is the only task in this plan.

**Current CSS being replaced** (for reference — locate the equivalent block in the live file, since line numbers may have drifted):

```css
.calendar-heatmap {
    display: flex;
    gap: 3px;
    overflow-x: auto;
    padding-bottom: var(--space-1);
    max-width: 100%;
}
.calendar-week {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.calendar-cell {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 3px;
    background-color: var(--color-bg-paper);
    border: 1px solid var(--color-border);
}
.calendar-cell--level-1 {
    background-color: color-mix(in srgb, var(--color-primary) 25%, var(--color-bg-paper));
    border-color: transparent;
}
.calendar-cell--level-2 {
    background-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-bg-paper));
    border-color: transparent;
    box-shadow: 0 0 3px color-mix(in srgb, var(--color-primary) 40%, transparent);
}
.calendar-cell--level-3 {
    background-color: color-mix(in srgb, var(--color-primary) 75%, var(--color-bg-paper));
    border-color: transparent;
    box-shadow: 0 0 4px color-mix(in srgb, var(--color-primary) 55%, transparent);
}
.calendar-cell--level-4 {
    background-color: var(--color-primary);
    border-color: transparent;
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-primary) 70%, transparent);
}
.calendar-legend { display: flex; align-items: center; gap: 4px; }
.calendar-legend-label { font-size: 0.75rem; color: var(--color-text-muted); }
```

**New CSS to write in its place:**

```css
/* "Sternenkarte" (Statistics Polish Phase C): star-point reskin of the
   reading calendar. Each .calendar-cell keeps the same fixed 0.7rem
   footprint at every activity level -- the grid must stay pixel-aligned --
   so "size" differences between levels come from an inner ::before dot
   sized as a percentage of that fixed box, never from resizing the cell
   itself. Every cell (including the legend swatches, which reuse these
   same classes outside .calendar-heatmap) always paints its own small dark
   circular base, so the star-point stays legible whether it's sitting on
   the heatmap's night-sky background or directly on the panel's normal
   background in the legend row.

   The night-sky background on .calendar-heatmap intentionally paints over
   the Phase 1 brass-texture panel background (.stats-panel.calendar-card
   ::before) within the heatmap's own bounds -- this is a brass-framed
   window onto a starfield, not the texture being disabled. The texture
   remains visible in the surrounding header/padding/legend area. */
.calendar-heatmap {
    display: flex;
    gap: 3px;
    overflow-x: auto;
    padding: var(--space-2);
    max-width: 100%;
    background: radial-gradient(
        ellipse at center,
        color-mix(in srgb, var(--color-bg-dark) 85%, black 15%) 0%,
        var(--color-bg-dark) 100%
    );
    border-radius: var(--radius);
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.45);
}
.calendar-week {
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.calendar-cell {
    position: relative;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background-color: color-mix(in srgb, var(--color-bg-dark) 65%, transparent);
}
.calendar-cell::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    width: 15%;
    height: 15%;
    opacity: 0.3;
    background-color: color-mix(in srgb, var(--color-primary) 40%, white 10%);
}
.calendar-cell--level-1::before {
    width: 30%;
    height: 30%;
    opacity: 0.55;
}
.calendar-cell--level-2::before {
    width: 45%;
    height: 45%;
    opacity: 0.8;
    box-shadow: 0 0 3px color-mix(in srgb, var(--color-primary) 60%, transparent);
}
.calendar-cell--level-3::before {
    width: 62%;
    height: 62%;
    opacity: 1;
    background-color: color-mix(in srgb, var(--color-primary) 80%, white 15%);
    box-shadow: 0 0 5px color-mix(in srgb, var(--color-primary) 75%, transparent);
}
.calendar-cell--level-4::before {
    width: 80%;
    height: 80%;
    opacity: 1;
    background-color: var(--color-primary);
    box-shadow:
        0 0 6px color-mix(in srgb, var(--color-primary) 90%, transparent),
        0 0 14px color-mix(in srgb, var(--color-primary) 55%, transparent);
}
.calendar-legend {
    display: flex;
    align-items: center;
    gap: 4px;
}
.calendar-legend-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
}
```

Note: `.calendar-legend` and `.calendar-legend-label` are listed above unchanged from the current file — they are included in the "new CSS" block only so the full replacement region is unambiguous. Do not add, remove, or reformat anything in those two rules beyond what's shown.

- [ ] **Step 1: Locate the current calendar CSS block**

Open `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` and search for `.calendar-heatmap`. Confirm the block matches the "Current CSS being replaced" reference above (values, not necessarily exact line numbers — the file may have shifted slightly since this plan was written). If it does not match, stop and report the discrepancy rather than guessing.

- [ ] **Step 2: Replace the block**

Replace the entire matched block (from `.calendar-heatmap {` through the end of `.calendar-legend-label { ... }`) with the "New CSS to write in its place" block above, verbatim.

- [ ] **Step 3: Build the frontend**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj`
Expected: Build succeeds with 0 errors (CSS files are not compiled/type-checked by this build, but this confirms the change didn't break the project structure).

- [ ] **Step 4: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: All 338 tests pass, including (unmodified) `Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel`, `Statistics_CalendarCell_ZeroActivityDay_HasNoRoleOrAriaLabel`, and `Statistics_RendersCalendarHeatmap_WithTodayAsAFullIntensityCell` in `tests/frontend/StatisticsPageTests.cs`. This is a CSS-only change, so no test count or content change is expected — a difference here means something outside the intended scope broke.

- [ ] **Step 5: Live-visual verification across all four themes**

This cannot be scripted — it requires visually inspecting the rendered Statistics page. For each of the four themes (Classic Library, Dark Library, Modern Light, System — toggle System's OS-level light/dark if feasible, otherwise note which mode was actually exercised):

1. Load the Statistics page for an account with reading-calendar activity at multiple levels (levels 0 through 4 both need to be visible to judge the progression — a synthetic/mocked `readingCalendar` response with varied `count` values per day is the fastest way to get all five levels on screen at once, following this session's established live-verification technique of injecting a JWT into `localStorage` and monkey-patching `window.fetch` for `/api/statistics`).
2. Confirm: level-0 cells read as "nearly invisible" (a faint pinprick, not a visible flat square), level-4 cells read as a "bright glowing point," and the progression between levels 1-3 is visually distinguishable step-by-step.
3. Confirm the `.calendar-heatmap` container reads as a dark "night sky" panel, and that the surrounding panel (header, padding, legend row) still shows the Phase 1 brass texture — i.e. the texture is not fully hidden by the dark heatmap background outside the heatmap's own bounds.
4. Confirm the calendar-legend swatches (the small level-0 through level-4 dots next to "Weniger"/"Mehr") are visible and show the same size/glow progression as the main grid, even though they sit outside the dark heatmap background — this is the point most likely to regress silently (see Global Constraints), check it explicitly rather than assuming the CSS reasoning holds.
5. Confirm the grid stays pixel-aligned — no ragged/staggered rows or columns caused by cells changing footprint size.

Document any theme where the effect doesn't read well (e.g., insufficient contrast, texture fully hidden instead of framed) as a concern in the task report rather than silently proceeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Statistics Polish Phase C: reskin reading calendar as a star chart"
```

- [ ] **Step 7: Add a Roadmap.md entry**

Append a new entry to `documentation/Roadmap.md`, in the same style as the "Statistics Polish — Phase A" and "Phase B" entries immediately above it (find them by searching for "Statistics Polish" in that file). Cover: what changed (flat color squares → circular glowing star-points on a dark night-sky background, same underlying grid/data/accessibility), why (user feedback: calendar "wirkt zu generisch/wie ein Standard-Tracker"), the brass-texture-frame coexistence decision, confirmation that no C#/test changes were needed or made, and the four-theme live-verification result from Step 5 (including any concerns noted there).

```bash
git add documentation/Roadmap.md
git commit -m "Document Statistics Polish Phase C in Roadmap"
```
