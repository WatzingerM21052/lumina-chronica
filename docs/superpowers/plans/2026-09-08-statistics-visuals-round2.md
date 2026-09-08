# Statistics Visuals Round 2 & App-Wide Input Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent visual fixes surfaced after the Statistics Polish round: (A) app-wide base styling for form inputs, which currently render on raw browser defaults everywhere in the app; (B1) replace the flat "just a line" bar in Genre Breakdown and Yearly Overview with a small reusable "Mini Brass Dial" component; (B2) tighten the reading-calendar's star-point density so all 52 weeks fit in its existing column without a horizontal scrollbar.

**Architecture:** Three self-contained tasks touching disjoint files, no task depends on another's output. A and B2 are pure CSS changes in `app.css`. B1 adds one small new Blazor component (`MiniDial`) plus two call-site swaps in `Statistics.razor`.

**Tech Stack:** Blazor WebAssembly (.NET 10), plain CSS (`color-mix()`, `conic-gradient()`, CSS custom properties). No new C# data model, no new backend calls.

## Global Constraints

- **No new CSS custom properties / color tokens anywhere.** Every color derives from existing theme tokens (`--color-primary`, `--color-border`, `--color-bg-card`, `--color-text-primary`, `--color-text-muted`) via `var()` or `color-mix(in srgb, ...)`, exactly like the rest of the codebase.
- **No C#/data-model changes in any task.** Task 3 (B2) does not touch `CalendarCell`, `BuildCalendarWeeks()`, or the Phase 1 accessibility markup (`role="img"`/`aria-label`) — same rule Phase C followed. Task 2 (B1) does not change how `genre.Count`/`year.BooksFinished` are computed — only how they're rendered.
- **Verify all four themes**: Classic Library, Dark Library, Modern Light, System. Confirmed via the theme files that `--color-primary`/`--color-border`/`--color-bg-card` are real, distinct, legible values in each — this is a live-verification requirement, not just a code-review one.
- **Live-visual verification is required, not optional**, using the established technique from this session: register/inject a JWT into `localStorage`, monkey-patch `window.fetch` for the relevant endpoint(s) with realistic data, navigate via SPA-internal link clicks (not full page reloads, which lose the patched `fetch`), and use `element.scrollLeft = element.scrollWidth` / DOM measurement (`getBoundingClientRect()`, `scrollWidth` vs `clientWidth`) to check for unwanted scrollbars directly rather than eyeballing screenshots alone.
- **Document verification honestly in `documentation/Roadmap.md`**, in the same style as the Statistics Polish Phase A/B/C entries — what was checked, in which themes, and any open concern, never a blanket "verified" claim that outstrips what was actually checked.

---

### Task 1: App-Wide Base Input Styling

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (add a new rule block; suggested location: immediately after the existing `.btn` rule block, which currently ends around line 276 — read the file first to confirm the exact current line, it may have shifted since this plan was written)

**Interfaces:**
- Consumes: existing tokens `--radius`, `--color-border`, `--color-bg-card`, `--color-text-primary`, `--space-1`, `--space-2` (all already defined per-theme / as base tokens in `app.css` — do not redefine them).
- Produces: nothing consumed by later tasks — this task is fully independent.

**Context:** grepping the whole codebase for `^input\b`, `^input\[type`, `^textarea\b`, `^select\b` in `app.css` found nothing except the existing `:focus-visible` rule (see below) — there is currently no base visual styling for these elements anywhere in the project. Every form field in the app (login, register, library search, book upload, settings, the Statistics goal input) renders on unstyled browser defaults.

The existing `.btn` rule (`app.css`, search for `.btn {`) is the reference pattern to match:
```css
.btn {
    font-family: inherit;
    font-size: var(--font-size-body);
    font-weight: 500;
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-card);
    color: var(--color-text-primary);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    transition: background-color var(--motion-micro) var(--ease-standard), border-color var(--motion-micro) var(--ease-standard), transform var(--motion-micro) var(--ease-standard);
}
```

The existing global focus-visible rule (search for `:focus-visible` — it's a shared selector list) already includes `input`, `textarea`, and `select` directly:
```css
a:focus-visible,
button:focus-visible,
.btn:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
    /* ... existing outline styling using --color-accent-text ... */
}
```
This rule does not need to change — it already applies to the elements this task styles. Just confirm after implementing that the new base rule's `border`/`background-color` don't visually clash with or obscure the existing focus outline (they shouldn't, since the existing rule only adds an `outline`, which paints outside the border box).

**New CSS to add:**

```css
/* App-wide base styling for text-like form fields. Before this rule,
   every input/select/textarea in the app rendered on unstyled browser
   defaults -- there was no project-wide rule for them (confirmed via
   grep), only the shared :focus-visible outline above. Scoped to
   exclude checkbox/radio, which already render fine as native controls
   and were never part of this complaint. */
input:not([type="checkbox"]):not([type="radio"]),
select,
textarea {
    font-family: inherit;
    font-size: var(--font-size-body);
    border-radius: var(--radius);
    border: 1px solid var(--color-border);
    background-color: var(--color-bg-card);
    color: var(--color-text-primary);
    padding: var(--space-1) var(--space-2);
}
```

- [ ] **Step 1: Locate the `.btn` rule and the `:focus-visible` rule**

Open `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, search for `.btn {` and for `:focus-visible`. Confirm both match the reference text above (values may differ slightly if the file has changed since this plan was written — if so, use the live values, not the ones quoted here).

- [ ] **Step 2: Add the new rule**

Insert the "New CSS to add" block above immediately after the `.btn` rule block (or any other sensible nearby location — this is additive, not a replacement of anything).

- [ ] **Step 3: Build the frontend**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj`
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: All existing tests pass unchanged (this is a CSS-only, purely additive change — no test count or content difference is expected).

- [ ] **Step 5: Live-visual verification (spot-check across pages, full check on one)**

Using the established live-verification technique (JWT in `localStorage`, `window.fetch` intercepted for the relevant endpoint(s), SPA-internal navigation to preserve the patched `fetch` across page changes):

1. Load the **Statistics** page (the motivating case — the "Jahresziel" number input) in **all four themes** (Classic Library, Dark Library, Modern Light, System) and confirm the input now has a visible border/background/radius consistent with the surrounding card, and that clicking into it still shows a clear focus outline.
2. In **one theme** (pick Classic Library, since it's the default), spot-check three more pages that were not touched by any earlier Statistics Polish phase: the **Library** search box (`/library`), the **Settings** page (`/settings` — confirm the notification checkboxes still render as normal native checkboxes, unaffected by the `:not([type="checkbox"])` exclusion), and the **Login** page (`/login` — confirms the change reads sensibly even on a page outside the "Living Library" reworked pages).
3. Note any theme or page where the new styling looks wrong (e.g., insufficient contrast, a page that already had its own more specific input styling that now conflicts) as a concern in the task report rather than silently proceeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Add app-wide base styling for input/select/textarea"
```

---

### Task 2: Mini Brass Dial Component (Genre Breakdown + Yearly Overview)

**Files:**
- Create: `frontend/LuminaChronica.Client/Components/MiniDial/MiniDial.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor` (two call sites: the Genre Breakdown loop and the Yearly Overview loop)
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (new `.mini-dial`/`.mini-dial-inner` rules; the old `.statistics-genre-bar-track`/`.statistics-genre-bar-fill`/`.statistics-genre-count` rules can be deleted since after this task nothing references them — confirm via grep before deleting)
- Test: `tests/frontend/MiniDialTests.cs` (new)

**Interfaces:**
- Consumes: the existing `--color-primary`, `--color-border`, `--color-bg-card` tokens; the existing percentage-computation expressions already in `Statistics.razor` (`genre.Count * 100.0 / maxGenreCount`, `year.BooksFinished * 100.0 / maxBooksPerYear`) — unchanged, just passed into the new component instead of into a `width:` style.
- Produces: `MiniDial` component with two required parameters: `int Value` (the number displayed in the dial's center) and `double Percentage` (0-100, the conic-gradient fill amount). No other task depends on this component.

**Context — current markup being replaced.** `Statistics.razor`, Yearly Overview loop (search for `yearly-overview-row`):
```razor
<div class="yearly-overview-row">
    <span class="yearly-overview-year">@year.Year</span>
    <div class="statistics-genre-bar-track">
        <div class="statistics-genre-bar-fill" style="width: @(year.BooksFinished * 100.0 / maxBooksPerYear)%"></div>
    </div>
    <span class="yearly-overview-detail">@year.BooksFinished Bücher · @year.PagesRead Seiten · @year.ActiveDays aktive Tage</span>
</div>
```

`Statistics.razor`, Genre Breakdown loop (search for `statistics-genre-row`):
```razor
<div class="statistics-genre-row">
    <span class="statistics-genre-label">@genre.Genre</span>
    <div class="statistics-genre-bar-track">
        <div class="statistics-genre-bar-fill" style="width: @(genre.Count * 100.0 / maxGenreCount)%"></div>
    </div>
    <span class="statistics-genre-count">@genre.Count</span>
</div>
```

Both use the same `.statistics-genre-bar-track`/`.statistics-genre-bar-fill` classes today (the Yearly Overview section reuses the Genre Breakdown's bar CSS rather than having its own — this is why the plan's global rename below removes those shared classes entirely once both call sites stop using them).

**The reference pattern being reused, in miniature** (from the existing Goal Ring, `app.css`, search for `.goal-ring {` — **do not modify the Goal Ring itself**, it stays exactly as-is; this is a new, separate, smaller component inspired by the same technique):
```css
.goal-ring {
    --goal-pct: 0;
    ...
    background: conic-gradient(var(--color-primary) calc(var(--goal-pct) * 1%), var(--color-border) 0);
    border: 1px solid color-mix(in srgb, var(--color-primary) 60%, black);
    box-shadow:
        inset 2px 2px 4px color-mix(in srgb, white 25%, transparent),
        inset -2px -2px 4px color-mix(in srgb, black 25%, transparent);
    ...
}
```
The Goal Ring is 8rem with a brass-texture `::before` overlay and a dual inset/outset shadow — both are visual investments that only read correctly at that size. `MiniDial` is ~2.5rem-3rem and deliberately drops both: no texture overlay, no dual shadow (a single, lighter shadow at most, only if it still reads clearly at the smaller size when you check it live — it's fine to ship with no shadow at all if a shadow doesn't add anything visible that small).

- [ ] **Step 1: Verify there's no existing test coupling on the bar markup**

Run: `grep -n "statistics-genre-bar\|yearly-overview-row" tests/frontend/*.cs`
Expected: no matches (confirmed at plan-writing time). If this now returns matches, read them and adjust affected tests as part of this task — do not proceed silently if the grep result differs from this expectation.

- [ ] **Step 2: Create the `MiniDial` component**

Create `frontend/LuminaChronica.Client/Components/MiniDial/MiniDial.razor`:

```razor
@namespace LuminaChronica.Client.Components
@using System.Globalization

<div class="mini-dial" style="--mini-dial-pct: @(Percentage.ToString("F0", CultureInfo.InvariantCulture))">
    <div class="mini-dial-inner">@Value</div>
</div>

@code {
    [Parameter, EditorRequired]
    public int Value { get; set; }

    [Parameter, EditorRequired]
    public double Percentage { get; set; }
}
```

No `@using LuminaChronica.Client.Components` is needed anywhere this component is consumed — `_Imports.razor` already provides it project-wide (confirmed: `frontend/LuminaChronica.Client/_Imports.razor` contains `@using LuminaChronica.Client.Components`).

- [ ] **Step 3: Add the `MiniDial` CSS**

Add to `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (near the Goal Ring rules, since they're the same visual technique — search for `.goal-ring-inner {` and add after that block):

```css
/* Mini Brass Dial: the Goal Ring's conic-gradient technique (see
   .goal-ring above) at a much smaller scale for Genre Breakdown and
   Yearly Overview rows. No brass-texture overlay and no dual inset/
   outset shadow -- at ~2.5rem those effects are imperceptible/muddy,
   so this carries only what still reads at that size. */
.mini-dial {
    --mini-dial-pct: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: conic-gradient(var(--color-primary) calc(var(--mini-dial-pct) * 1%), var(--color-border) 0);
    flex-shrink: 0;
}

.mini-dial-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 50%;
    background-color: var(--color-bg-card);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-primary);
}
```

- [ ] **Step 4: Update the Yearly Overview call site**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, replace:
```razor
<div class="yearly-overview-row">
    <span class="yearly-overview-year">@year.Year</span>
    <div class="statistics-genre-bar-track">
        <div class="statistics-genre-bar-fill" style="width: @(year.BooksFinished * 100.0 / maxBooksPerYear)%"></div>
    </div>
    <span class="yearly-overview-detail">@year.BooksFinished Bücher · @year.PagesRead Seiten · @year.ActiveDays aktive Tage</span>
</div>
```
with:
```razor
<div class="yearly-overview-row">
    <span class="yearly-overview-year">@year.Year</span>
    <MiniDial Value="@year.BooksFinished" Percentage="@(year.BooksFinished * 100.0 / maxBooksPerYear)" />
    <span class="yearly-overview-detail">@year.BooksFinished Bücher · @year.PagesRead Seiten · @year.ActiveDays aktive Tage</span>
</div>
```
The `yearly-overview-detail` row is unchanged — it still spans full width below, and still shows `year.BooksFinished` as visible text (in addition to it now also appearing inside the dial), so the existing `Statistics_ShowsYearlyOverview_WhenPresent` test (which asserts on that exact detail string) is unaffected.

`.yearly-overview-row`'s CSS (`grid-template-columns: 4rem 1fr`) currently expects two children (year label + bar). With `MiniDial` replacing the bar, check this grid still looks right — `MiniDial` renders at a fixed 2.75rem width regardless of the `1fr` track it sits in, so it will be left-aligned in that track by default; this is fine and expected, but confirm visually in Step 6 rather than assuming.

- [ ] **Step 5: Update the Genre Breakdown call site**

In the same file, replace:
```razor
<div class="statistics-genre-row">
    <span class="statistics-genre-label">@genre.Genre</span>
    <div class="statistics-genre-bar-track">
        <div class="statistics-genre-bar-fill" style="width: @(genre.Count * 100.0 / maxGenreCount)%"></div>
    </div>
    <span class="statistics-genre-count">@genre.Count</span>
</div>
```
with:
```razor
<div class="statistics-genre-row">
    <span class="statistics-genre-label">@genre.Genre</span>
    <MiniDial Value="@genre.Count" Percentage="@(genre.Count * 100.0 / maxGenreCount)" />
</div>
```
The trailing `.statistics-genre-count` span is removed entirely — its value now lives inside the dial (matching how the Goal Ring itself centers its own number rather than also printing it as separate trailing text). `.statistics-genre-row`'s CSS currently has `grid-template-columns: 8rem 1fr 2.5rem` for three children (label/bar/count); now there are only two children (label/dial) — update this to `grid-template-columns: 8rem 1fr` in the same CSS edit as Step 6 below, since a stale third column-track for a removed third child would leave dead grid space.

The existing `Statistics_ShowsGenreBreakdown_WhenGenresExist` test asserts `Assert.Contains("Fantasy", cut.Markup)` and `Assert.Contains("Unbekannt", cut.Markup)` — both still pass, since the genre label text is unchanged; it does not assert on the count text or bar markup, so removing the separate count span does not break it.

- [ ] **Step 6: Clean up the now-unused bar CSS and fix the Genre row's grid columns**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`:
1. Run `grep -n "statistics-genre-bar-track\|statistics-genre-bar-fill\|statistics-genre-count" frontend/LuminaChronica.Client/Pages/Statistics.razor` — expect no matches after Steps 4-5. If there are matches, something wasn't fully replaced; fix that first.
2. Delete the now-orphaned `.statistics-genre-bar-track`, `.statistics-genre-bar-fill`, and `.statistics-genre-count` rules (search for each by name).
3. Find `.statistics-genre-row` and change `grid-template-columns: 8rem 1fr 2.5rem;` to `grid-template-columns: 8rem 1fr;` (Genre Breakdown now has 2 children, not 3).
4. Leave `.yearly-overview-row`'s `grid-template-columns: 4rem 1fr;` as-is — it already had 2 children (year label + bar) and still has 2 (year label + dial), only the second child's contents changed.

- [ ] **Step 7: Write the `MiniDial` test**

Create `tests/frontend/MiniDialTests.cs`, following the existing pattern in `tests/frontend/StatCardTests.cs`:

```csharp
using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class MiniDialTests : BunitContext
{
    [Fact]
    public void MiniDial_RendersValueAndPercentageCustomProperty()
    {
        var cut = Render<MiniDial>(parameters => parameters
            .Add(p => p.Value, 5)
            .Add(p => p.Percentage, 62.5));

        var root = cut.Find("div.mini-dial");
        Assert.Contains("--mini-dial-pct: 63", root.GetAttribute("style"));
        Assert.Equal("5", root.QuerySelector(".mini-dial-inner")!.TextContent);
    }

    [Fact]
    public void MiniDial_RoundsPercentageToNearestWholeNumber()
    {
        var cut = Render<MiniDial>(parameters => parameters
            .Add(p => p.Value, 1)
            .Add(p => p.Percentage, 33.3));

        var root = cut.Find("div.mini-dial");
        Assert.Contains("--mini-dial-pct: 33", root.GetAttribute("style"));
    }
}
```

- [ ] **Step 8: Run the new test, verify it fails first, then passes**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter MiniDialTests`
Before Step 2 exists, this fails with "type or namespace 'MiniDial' could not be found". After Steps 2-3, run again — expect both tests to pass.

- [ ] **Step 9: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: all tests pass, including the unmodified `Statistics_ShowsGenreBreakdown_WhenGenresExist` and `Statistics_ShowsYearlyOverview_WhenPresent`, plus the 2 new `MiniDialTests`.

- [ ] **Step 10: Live-visual verification across all four themes**

Using the established technique (JWT + `window.fetch` intercept with a `genreBreakdown` array of at least 3 entries with visibly different counts, and a `yearlyOverview` array of at least 2 years with different `booksFinished` values, so the dial-fill percentage differences are visible):

1. In each of the 4 themes, confirm both Genre Breakdown and Yearly Overview render dials (not bars), the fill percentage visually matches each row's relative count, and the number inside each dial matches the underlying data.
2. Confirm `.statistics-genre-row`'s 2-column grid (label + dial) looks correctly aligned, not leaving stray empty grid space from the old 3-column layout.
3. Confirm `.yearly-overview-row`'s dial + detail-text-below layout still reads cleanly.

Document any theme with a legibility or alignment issue as a concern in the task report.

- [ ] **Step 11: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/MiniDial/MiniDial.razor frontend/LuminaChronica.Client/Pages/Statistics.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/MiniDialTests.cs
git commit -m "Replace flat bars with Mini Brass Dial in Genre Breakdown and Yearly Overview"
```

---

### Task 3: Compact No-Scroll Calendar

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (`.calendar-cell`, `.calendar-cell::before`, `.calendar-cell--level-*::before`, `.calendar-week`, `.calendar-heatmap`; possibly `.stats-panels`)

**Interfaces:**
- Consumes: existing `--color-bg-dark`, `--color-primary` tokens (from Phase C, unchanged). Existing markup structure from `Statistics.razor` (`.calendar-heatmap` > `.calendar-week` > `.calendar-cell.calendar-cell--level-N`) — **not modified by this task**.
- Produces: nothing consumed by later tasks — this is the last task in this plan.

**Context.** The current calendar CSS (from Phase C, `app.css`, search for `.calendar-cell {`):
```css
.calendar-cell {
    position: relative;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background-color: color-mix(in srgb, var(--color-bg-dark) 65%, transparent);
}
```
`.calendar-week` uses `gap: 3px` between cells (search for `.calendar-week {`), and `.calendar-heatmap` uses `gap: 3px` between weeks (search for `.calendar-heatmap {`). At `0.7rem` (11.2px) cell + 3px gap = 14.2px pitch, 52 weeks need `52 * 14.2 - 3 ≈ 735px` — wider than the ~520-540px column `.calendar-heatmap` actually gets when it shares `.stats-panels`' grid 50/50 with the Goal Ring panel (`.stats-panels`, search for `grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr))`), which is why it currently needs `overflow-x: auto` to scroll.

**This task's target, per the design spec:** tighten the cell/gap pitch toward a GitHub-contribution-graph reference density (~10-11px cell, ~2px gap, ~12-13px pitch) so 52 weeks fit inside the available column width without a scrollbar, **without increasing panel height** and **without adding month/weekday labels** (both were considered and explicitly rejected during brainstorming — see the design spec's "Rejected alternatives" section). The design spec is explicit that **the exact final cell size, gap, glow-blur values, and whether `.stats-panels` needs an asymmetric column split (e.g. `grid-template-columns: 1fr 1.6fr` favoring the calendar) must be determined live against the real rendered column width — this task is a live-iteration loop, not a single CSS value write.**

- [ ] **Step 1: Set up live verification before touching any CSS**

Using the established technique (JWT + `window.fetch` intercept), load the Statistics page with a `readingCalendar` payload that includes entries spanning activity levels 0 through 4 (reuse the same shape used for Phase C's own verification — at least one entry each at count values that map to levels 1, 2, 3, and 4 relative to the payload's max count, per `BuildCalendarWeeks()`'s existing `Math.Clamp((int)Math.Ceiling(count * 4.0 / maxCount), 1, 4)` logic — unchanged by this task, just needed to get all 5 levels visible for judging readability).

- [ ] **Step 2: Measure the real column width**

With the page loaded, run in the browser console (via the JS execution tool):
```javascript
const el = document.querySelector('.calendar-heatmap');
({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })
```
Record `clientWidth` (the visible column width available) and `scrollWidth` (how wide the content currently renders, pre-change — confirms the current overflow). This is the number the new pitch must fit 52 weeks into: `52 * pitch - gap <= clientWidth`.

- [ ] **Step 3: First-pass CSS tightening**

Starting point (adjust from here based on Step 2's measured `clientWidth` — these are a starting guess, not the final answer):

```css
.calendar-cell {
    position: relative;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background-color: color-mix(in srgb, var(--color-bg-dark) 65%, transparent);
}
```
And reduce the gap in both `.calendar-week` and `.calendar-heatmap` from `3px` to `2px`.

Recompute: `0.65rem` (10.4px) + 2px gap = 12.4px pitch × 52 = 645px − 2px = 643px. Compare against the `clientWidth` measured in Step 2. If still wider than `clientWidth`, reduce further (e.g. `0.6rem`/1px gap); if comfortably narrower, you can afford to go slightly larger for better readability instead of shrinking to the bare minimum.

- [ ] **Step 4: Re-measure and iterate**

Reload with the CSS change applied (SPA-internal navigation away and back to `/statistics`, not a full page reload, to keep the patched `fetch` alive — same technique as Phase C's own verification), re-run the Step 2 measurement:
```javascript
const el = document.querySelector('.calendar-heatmap');
({ clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowing: el.scrollWidth > el.clientWidth + 1 })
```
Repeat Steps 3-4, adjusting cell size and/or gap, until `overflowing` is `false` on a representative desktop viewport width (do this check at at least 1366px and 1920px browser window widths, since `.stats-panels` is a responsive grid and the column width changes with viewport).

- [ ] **Step 5: Check star-point readability at the final size**

Zoom into the rendered calendar (via the screenshot/zoom tool) and visually confirm the level 0→4 progression is still distinguishable step-by-step, not just a uniform blur of indistinct dots. The `::before` dot sizes are percentages of the cell (currently 15%/30%/45%/62%/80% for levels 0-4 — search for `.calendar-cell::before {` and each `.calendar-cell--level-N::before` block) and do not need to change their percentages, but if the smaller absolute cell size makes the dots too small to read clearly, increase the `box-shadow` blur radius on the level 2-4 rules (the glow extends visible presence beyond the dot's literal size without changing the dot's own footprint) rather than only enlarging the dot itself — try this lever first since it's cheaper than a structural layout change.

- [ ] **Step 6: If pitch-tightening alone can't produce both no-scroll AND legible stars, widen the calendar's column**

Only if Step 5 is unsatisfactory after reasonable glow/pitch adjustment: change `.stats-panels`' `grid-template-columns` from `repeat(auto-fit, minmax(18rem, 1fr))` to an asymmetric split favoring the calendar, e.g. `1fr 1.6fr` (Goal Ring gets the narrower first track, calendar gets the wider second track) — confirm in `Statistics.razor` that the Goal Ring panel (`.stats-panel.goal-card`) comes before the calendar panel (`.stats-panel.calendar-card`) in DOM order so the column order matches (search for `<section class="stats-panel goal-card">` and `<section class="stats-panel calendar-card">` to confirm). Re-run Steps 2-5 after this change, since the available `clientWidth` for the calendar column changes.

- [ ] **Step 7: Build and run tests**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success.
Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all tests passing, unchanged (this task is CSS-only; the Phase C calendar tests — `Statistics_RendersCalendarHeatmap_WithTodayAsAFullIntensityCell`, `Statistics_CalendarCell_HasAccessibleRoleAndAriaLabel`, `Statistics_CalendarCell_ZeroActivityDay_HasNoRoleOrAriaLabel` — assert on class names and ARIA attributes, not pixel sizes, and must still pass unmodified).

- [ ] **Step 8: Verify across all four themes**

Repeat Step 4's no-scroll check and Step 5's readability check in Dark Library and Modern Light at minimum (Classic Library was likely already used as the working theme through Steps 1-6; System resolves to one of the other three's token values per `themes/system.css` and does not need independent pixel re-verification, only a quick visual sanity check that it renders using whichever branch — light or dark — the test environment's OS preference resolves to).

- [ ] **Step 9: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Tighten calendar star-point density to fit 52 weeks without horizontal scroll"
```

If Step 6's grid change was needed, it's part of the same commit (same file, same task).

- [ ] **Step 10: Add a combined Roadmap.md entry covering all three tasks**

All three tasks in this plan ship together in one PR, so they get one combined `documentation/Roadmap.md` entry rather than three separate ones — find the existing "Statistics Polish — Phase C" entry (search for "Sternenkarte") and add a new entry immediately after it, in the same style: what changed in each of the three tracks (app-wide input styling; Mini Brass Dial replacing the flat bars in Genre Breakdown and Yearly Overview; the calendar's tightened star-point density and final pitch/gap/glow values reached via the live-iteration loop in this task, including whether Step 6's asymmetric grid split was needed), the bUnit test results (Task 1: unchanged; Task 2: existing tests unchanged + 2 new `MiniDialTests`; Task 3: unchanged), and the live-verification results from every task's own verification step — which themes were checked for which track, and honestly note any concern that came up (e.g., if Step 5/6 of this task left the calendar less than fully satisfying in some theme, say so rather than claiming a clean result it didn't reach).

```bash
git add documentation/Roadmap.md
git commit -m "Document Statistics Visuals Round 2 in Roadmap"
```
