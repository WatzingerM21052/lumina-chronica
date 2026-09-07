# Statistics Rework Phase 1 (Dial/Calendar/Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `Statistics.razor`'s stat row, Goal Ring, and calendar heatmap per the "Brass Reading Dial"/"Illuminated Reading Calendar" design (design spec: `docs/superpowers/specs/2026-09-07-statistics-rework-design.md`), including a real accessibility fix for the calendar heatmap, without touching the hero (Phase 2, gated on separate image assets not yet delivered).

**Architecture:** `Statistics.razor`'s five-stat overview row switches from hand-rolled markup to the existing `StatCard` component (pure extraction). The Goal Ring and calendar heatmap keep their exact current data mechanisms (`--goal-pct` conic-gradient, `color-mix` level scale) — both are already theme-correct via `--color-primary`, not a rainbow palette — and gain CSS-only bevel/texture treatments plus, for the heatmap, a genuine accessibility fix (`role="img"`/`aria-label` per cell, since the current `title`-only attribute is not screen-reader accessible on a non-focusable `div`).

**Tech Stack:** Blazor WebAssembly (.NET 10), plain CSS in `wwwroot/Styles/app.css` (no CSS isolation file exists for this page), bUnit for tests.

## Global Constraints

- No new color tokens — reuse existing custom properties only (`--color-primary`, `--color-bg-card`, `--color-bg-paper`, `--color-border`, `--radius-lg`/`--radius`).
- No new motion durations — the Goal Ring's existing `transition: background 0.3s ease` stays unchanged; no new transitions are added in this phase.
- No fake statistics — this phase changes visual treatment only, never the data shown.
- No functional regression — Goal Ring set/clear, heatmap tooltips, Yearly Overview, Genre Breakdown, and Recent Activity must keep working exactly as today. All 13 existing tests in `tests/frontend/StatisticsPageTests.cs` must keep passing unmodified through every task in this plan (none of their assertions target anything this plan changes at the string level — the StatCard swap produces byte-identical `.dashboard-stat-value`/`.dashboard-stat-label` markup, and the CSS-only tasks don't touch class names the tests check).
- The brass-texture image (`wwwroot/images/statistics/brass-texture.webp`) does not exist yet at the time this plan is written (image generation in progress in parallel) — every CSS rule referencing it must degrade silently if the file is missing (a `background-image: url(...)` that 404s simply shows nothing; this requires no conditional logic, but every step in Tasks 3-4 must not assume the file exists when verifying that step's specific CSS change).

---

### Task 1: StatCard extraction for the stats overview row

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor:27-48`
- Test: `tests/frontend/StatisticsPageTests.cs` (no new test — existing tests verify this task; see Step 2)

**Interfaces:**
- Consumes: `StatCard` component (`frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor`), parameters `Value` (`string`, required) and `Label` (`string`, required). Already imported in this file via the existing `@using LuminaChronica.Client.Components` on line 5 — no using-directive change needed.
- Produces: nothing new consumed by later tasks in this plan.

- [ ] **Step 1: Replace the hand-rolled stat row with `StatCard`**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, replace lines 27-48:

```razor
    <div class="dashboard-overview stats-overview">
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_stats.BooksRead</span>
            <span class="dashboard-stat-label">Gelesene Bücher</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_stats.BooksInProgress</span>
            <span class="dashboard-stat-label">In Arbeit</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">@_stats.PagesRead</span>
            <span class="dashboard-stat-label">Gelesene Seiten</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">🔥 @_stats.Streaks.CurrentStreak</span>
            <span class="dashboard-stat-label">Serie (Tage)</span>
        </div>
        <div class="dashboard-stat">
            <span class="dashboard-stat-value">🏆 @_stats.Streaks.LongestStreak</span>
            <span class="dashboard-stat-label">Längste Serie</span>
        </div>
    </div>
```

with:

```razor
    <div class="dashboard-overview stats-overview">
        <StatCard Value="@_stats.BooksRead.ToString()" Label="Gelesene Bücher" />
        <StatCard Value="@_stats.BooksInProgress.ToString()" Label="In Arbeit" />
        <StatCard Value="@_stats.PagesRead.ToString()" Label="Gelesene Seiten" />
        <StatCard Value="@($"🔥 {_stats.Streaks.CurrentStreak}")" Label="Serie (Tage)" />
        <StatCard Value="@($"🏆 {_stats.Streaks.LongestStreak}")" Label="Längste Serie" />
    </div>
```

`StatCard` renders `<div class="dashboard-stat"><span class="dashboard-stat-value">@Value</span><span class="dashboard-stat-label">@Label</span></div>` — identical markup shape to what it replaces, just with `Value` pre-converted to `string` since `StatCard.Value` is typed `string`, not a generic/object.

- [ ] **Step 2: Run the existing Statistics test suite to confirm no regression**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~StatisticsPageTests"`

Expected: all 13 tests still PASS, including `Statistics_ShowsOverviewCounts_FromStatisticsEndpoint` (checks `dashboard-stat-value">3<` etc.) and `Statistics_ShowsStreaks_FromStatisticsEndpoint` (checks `🔥 4`/`🏆 9`) — both assert on the rendered HTML string, which is unchanged by this swap.

- [ ] **Step 3: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Statistics.razor
git commit -m "refactor: use StatCard for the Statistics overview row"
```

---

### Task 2: Calendar heatmap accessibility fix

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor:87-109` (the `calendar-card` section)
- Test: `tests/frontend/StatisticsPageTests.cs`

**Interfaces:**
- Consumes: `CalendarCell` record (already defined at the bottom of `Statistics.razor`, unchanged by this task) — `Tooltip` property (`string`, empty for future days, otherwise `"{Date:dd.MM.yyyy}: {Count} Aktivität(en)"`).
- Produces: nothing consumed by later tasks.

This is the "most important fix" from the design spec: `title` alone on a non-interactive `<div>` is not exposed to screen readers and has no keyboard path. `role="img"` plus `aria-label` makes the same text genuinely accessible.

- [ ] **Step 1: Write the failing test**

Add to `tests/frontend/StatisticsPageTests.cs`, after the existing `Statistics_RendersCalendarHeatmap_WithTodayAsAFullIntensityCell` test (after line 189, before the blank line preceding `Statistics_SavingGoal_PutsToGoalEndpoint_AndShowsUpdatedRing`):

```csharp
    [Fact]
    public void Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel()
    {
        const string template = """
            {"success":true,"data":{"booksRead":1,"booksInProgress":0,"pagesRead":10,"genreBreakdown":[],
             "recentActivity":[],"readingCalendar":[{"date":"__DATE__","count":3}]}}
            """;
        var today = DateTime.UtcNow;
        var json = template.Replace("__DATE__", today.ToString("yyyy-MM-dd"));
        UseApiResponse(json);

        var cut = Render<Statistics>();

        var expectedLabel = $"{today:dd.MM.yyyy}: 3 Aktivität(en)";
        Assert.Contains($"role=\"img\" aria-label=\"{expectedLabel}\"", cut.Markup);
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel"`

Expected: FAIL — the current markup only has `title="..."`, no `role`/`aria-label`, so the exact `role="img" aria-label="..."` substring is absent.

- [ ] **Step 3: Add `role`/`aria-label` to the calendar cell markup**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, find this line inside the `calendar-card` section's inner `@foreach (var day in week)` loop:

```razor
                            <div class="calendar-cell calendar-cell--level-@day.Level" title="@day.Tooltip"></div>
```

Replace with:

```razor
                            <div class="calendar-cell calendar-cell--level-@day.Level" title="@day.Tooltip" role="img" aria-label="@day.Tooltip"></div>
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~StatisticsPageTests"`

Expected: all tests PASS, including the new one and the 13 pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Statistics.razor tests/frontend/StatisticsPageTests.cs
git commit -m "fix: make calendar heatmap cells screen-reader accessible"
```

---

### Task 3: Goal Ring "Brass Reading Dial" CSS treatment

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css:997-1007` (the `.goal-ring` rule)

**Interfaces:**
- Consumes: `--color-primary`, `--color-border` (existing tokens). References `images/statistics/brass-texture.webp` (does not exist yet — see Global Constraints; this task's CSS must not error or break anything while the file is missing).
- Produces: nothing consumed by later tasks — Task 4 touches a different rule block.

CSS-only task, no test changes (no existing test asserts on `.goal-ring`'s `box-shadow`/`border`/pseudo-element, and none should — those aren't behavior). Verification is visual/live, in Task 5.

- [ ] **Step 1: Add the bevel, border, and texture pseudo-element**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, replace the `.goal-ring` rule (lines 997-1007):

```css
.goal-ring {
    --goal-pct: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 8rem;
    height: 8rem;
    border-radius: 50%;
    background: conic-gradient(var(--color-primary) calc(var(--goal-pct) * 1%), var(--color-border) 0);
    transition: background 0.3s ease;
}
```

with:

```css
/* "Brass Reading Dial" (Statistics Rework Phase 1): the conic-gradient
   mechanism above is untouched -- it still carries 100% of the actual
   data meaning. This adds a metallic bevel (box-shadow) and a low-opacity
   brass texture on a ::before pseudo-element, since CSS opacity applies to
   a whole element and can't fade just one layer of a multi-background
   stack -- the pseudo-element is the only way to fade only the texture
   while the conic-gradient stays at full strength. */
.goal-ring {
    --goal-pct: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 8rem;
    height: 8rem;
    border-radius: 50%;
    background: conic-gradient(var(--color-primary) calc(var(--goal-pct) * 1%), var(--color-border) 0);
    border: 1px solid color-mix(in srgb, var(--color-primary) 60%, black);
    box-shadow:
        inset 2px 2px 4px color-mix(in srgb, white 25%, transparent),
        inset -2px -2px 4px color-mix(in srgb, black 25%, transparent);
    transition: background 0.3s ease;
}

.goal-ring::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-image: url("images/statistics/brass-texture.webp");
    background-size: cover;
    opacity: 0.15;
    pointer-events: none;
}
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS (CSS-only change, no markup touched — this step exists to catch any accidental syntax mistake in a preceding step, not because CSS is unit-tested).

- [ ] **Step 3: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "style: brass-dial bevel and texture treatment for the Goal Ring"
```

---

### Task 4: Illuminated Reading Calendar CSS treatment

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css:978-987` (the `.stats-panel` rule, scoped addition)
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css:1067-1094` (`.calendar-cell` and its level rules)

**Interfaces:**
- Consumes: `--color-primary`, `--color-bg-paper` (existing tokens). References the same `images/statistics/brass-texture.webp` as Task 3.
- Produces: nothing consumed by later tasks.

CSS-only task, same verification shape as Task 3.

- [ ] **Step 1: Add the container texture pseudo-element**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, replace the `.stats-panel` rule (lines 978-987):

```css
.stats-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, var(--radius));
    background-color: var(--color-bg-card);
}
```

with:

```css
.stats-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, var(--radius));
    background-color: var(--color-bg-card);
}

/* "Illuminated Reading Calendar" (Statistics Rework Phase 1): the same
   low-opacity brass-texture technique as the Goal Ring (Task 3), applied
   once to the whole calendar panel rather than per-cell (364+ repeated
   background images would be wasteful). position: relative + overflow:
   hidden keep the texture inside the panel's own rounded corners; child
   content (h2, .calendar-heatmap, .calendar-legend) paints after this
   pseudo-element in normal flow, so it naturally sits on top without
   needing z-index. */
.stats-panel.calendar-card {
    position: relative;
    overflow: hidden;
}

.stats-panel.calendar-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: url("images/statistics/brass-texture.webp");
    background-size: cover;
    opacity: 0.15;
    pointer-events: none;
}
```

- [ ] **Step 2: Add the border-radius bump and level-2/3/4 glow**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, replace the `.calendar-cell` through `.calendar-cell--level-4` rules (lines 1067-1094):

```css
.calendar-cell {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 2px;
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
}

.calendar-cell--level-3 {
    background-color: color-mix(in srgb, var(--color-primary) 75%, var(--color-bg-paper));
    border-color: transparent;
}

.calendar-cell--level-4 {
    background-color: var(--color-primary);
    border-color: transparent;
}
```

with:

```css
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

/* Levels 2-4 get a glow that intensifies with the underlying activity
   level ("earned illumination") -- levels 0-1 stay flat on purpose, so
   the effect reads as a reward for real reading activity, not decoration
   applied uniformly regardless of the data. */
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
```

- [ ] **Step 3: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "style: illuminated-calendar texture and level glow for the heatmap"
```

---

### Task 5: Live verification and Roadmap update

**Files:**
- Modify: `documentation/Roadmap.md` (append a new entry)

**Interfaces:**
- Consumes: the running local dev stack (`dotnet run --urls http://localhost:5289` in `frontend/LuminaChronica.Client`), per [[project-lumina-chronica-local-dev]]'s established workaround for this session's WASM-fetch environment defect if it recurs (real JWT + `window.fetch` intercept + SPA-internal navigation).
- Produces: nothing — this is the terminal task of Phase 1.

- [ ] **Step 1: Run the full frontend test suite one final time**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`

Expected: all tests PASS (this confirms the cumulative result of Tasks 1-4 together, not just each task individually).

- [ ] **Step 2: Live-verify against the real backend in both themes**

Log in (or reuse an existing session), navigate to `/statistics` with a real account that has reading history (a goal set, at least one calendar day with activity, at least two genres). Confirm, in both Classic Library and Dark Library themes:
- The five `StatCard`s render with correct values and labels, visually identical in layout to before this phase (only the underlying component changed).
- The Goal Ring shows the metallic bevel (visible highlight/shadow edge) and, once the brass-texture image exists on disk, a faint brass texture within the ring band; if the texture file is still missing at verification time, confirm the ring still renders correctly with just the bevel/border (the graceful-degradation case) and note this explicitly rather than blocking on it.
- The calendar heatmap's higher-activity cells (level 2-4) show a visible glow that increases with level; level 0-1 cells stay flat.
- Using the browser's accessibility inspector (or reading the rendered HTML directly), confirm a calendar cell has both `role="img"` and a populated `aria-label` matching its `title`.
- Goal Ring set/clear, Yearly Overview, Genre Breakdown, and Recent Activity all still work exactly as before — no functional regression.

- [ ] **Step 3: Append the Roadmap.md entry**

Add to `documentation/Roadmap.md`, following the exact structure and honesty conventions of the two Dashboard Rework entries immediately above it (bullet list of what shipped, test count, an honest verification note — state plainly whether the brass-texture image was available at verification time or not, and whether the WASM-fetch environment defect from the Dashboard entries recurred).

- [ ] **Step 4: Commit**

```bash
git add documentation/Roadmap.md
git commit -m "docs: add Statistics Rework Phase 1 entry to Roadmap.md"
```
