# Library Shelf Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Library page's shelf so the multiple genre/date groups read as one continuous wooden cabinet with several shelf levels inside it, instead of several independent floating boxes — per `docs/superpowers/specs/2026-09-16-library-shelf-cabinet-design.md`.

**Architecture:** A new `.shelf-cabinet` wrapper (added once in `Library.razor`, around the existing `@foreach` of `ShelfRow`s) owns the cabinet's external silhouette: rounded corners, side posts (via `::before`/`::after`), and a crown/base trim (via inset box-shadow). Individual `.shelf-compartment` rules (one per `ShelfRow`, unchanged component structure) lose their own external rounding and become flat internal "shelf levels" — the existing `.shelf-lip` element (already rendered at the bottom of each compartment) becomes the sole visual divider between levels once the gap between them is removed, and only the last level's lip keeps bottom rounding to match the cabinet's own external shape. The genre/date plaque (`.shelf-plaque`, no class rename) gets the exact established `brass-texture.webp` compositing technique already used on Statistics' Goal Ring, making it read as a mounted brass plate instead of a plain colored pill. All changes are CSS plus one new wrapper `<div>` in Razor — no JS, no changes to `ShelfBook`/`shelf-physics.js`/the reveal animation/state machine.

**Tech Stack:** Blazor WebAssembly (.razor), CSS (`app.css`), bUnit.

## Global Constraints

- No new CSS custom properties or color tokens — every new rule uses existing `--color-*`/`--space-*`/`--radius*`/`--font-family-display` tokens and existing texture assets (`shelf-wood-texture.webp`, `brass-texture.webp`) only.
- No JS changes anywhere in this plan.
- `.shelf-book`, `.shelf-book-rotator`, `.shelf-book-slot` (including its `perspective` rule from Phase A Task 5), `.shelf-books`, and every other rule inside the `ShelfBook`/reveal-animation area are **not modified** by this plan — verify this explicitly in each task's diff.
- `/library/shelves` (the separate custom-Shelf-collection feature, `Shelves.razor`/`ShelfDetail.razor`) is untouched.
- All existing frontend tests (`dotnet test tests/frontend`, currently 366 passing) must stay green throughout; this plan adds tests, never removes coverage.
- No decorative imagery (candle/globe/ivy/busts/carved ornaments) — explicitly out of scope per the design spec.

---

### Task 1: `.shelf-cabinet` wrapper — outer silhouette, posts, crown/base

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (new `.shelf-cabinet` rule, added near the existing `.shelf-compartment`/`.shelf-books` rules — search for `.shelf-compartment {` to find the right spot)
- Test: `tests/frontend/LibraryPageTests.cs`

**Interfaces:**
- Produces: a `.shelf-cabinet` wrapper `<div>` inside the existing `.library-shelf` element, containing all rendered `ShelfRow`s. `.library-shelf` itself (the `@ref="_shelfRef"` target `shelf-physics.js` attaches to) is structurally unaffected — `.shelf-cabinet` is a new child, not a replacement.
- Consumes: nothing new.

**Context:** Today, `Library.razor`'s Grid-view branch renders `ShelfRow`s directly inside `.library-shelf`, with no shared visual frame around the whole set. This task adds that frame.

- [ ] **Step 1: Write the failing test**

Add to `tests/frontend/LibraryPageTests.cs` (find an existing test that renders the Grid view with items — e.g. near the test at line ~46 that asserts `a.shelf-book` count — and add a new test near it):

```csharp
    [Fact]
    public void Library_GridViewMode_WrapsShelfRowsInACabinet()
    {
        UseApiResponse("""
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","coverUrl":null,"genre":"scifi","language":"en","visibility":"PRIVATE","createdAt":"2026-01-01"}
            ],"total":1,"page":1,"pageSize":20}}
            """);

        var cut = Render<Library>();

        var cabinet = cut.Find(".shelf-cabinet");
        Assert.NotEmpty(cabinet.QuerySelectorAll(".shelf-row-group"));
    }
```

(If `UseApiResponse` isn't the exact existing helper name in this file, use whatever helper the neighboring tests in this file already use to stub the books API response — check the top of the file/an existing test for the established pattern before writing this one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/frontend --filter "FullyQualifiedName~Library_GridViewMode_WrapsShelfRowsInACabinet"`
Expected: FAIL (`.shelf-cabinet` not found).

- [ ] **Step 3: Add the wrapper in `Library.razor`**

Find:
```razor
        <div class="library-shelf" @ref="_shelfRef">
            @foreach (var group in LibraryShelfGrouping.Group(_result.Items, _sort, _genreFilters, _tagFilters))
            {
                <ShelfRow @key="group.Label" Label="@group.Label" Books="group.Books" />
            }
        </div>
```

Replace with:
```razor
        <div class="library-shelf" @ref="_shelfRef">
            <div class="shelf-cabinet">
                @foreach (var group in LibraryShelfGrouping.Group(_result.Items, _sort, _genreFilters, _tagFilters))
                {
                    <ShelfRow @key="group.Label" Label="@group.Label" Books="group.Books" />
                }
            </div>
        </div>
```

- [ ] **Step 4: Add the `.shelf-cabinet` CSS rule**

Find the `.shelf-compartment` rule in `app.css` (search for `.shelf-compartment {`) and add this new rule immediately **before** it:

```css
/* Wraps all of a Grid-view page's ShelfRows in one continuous cabinet
   silhouette (Library Shelf Cabinet phase) -- individual .shelf-compartment
   rows (below) lose their own external rounding/shadow and become flat
   internal "shelf levels" inside this one frame instead of independent
   floating boxes. isolation: isolate scopes the ::before/::after posts'
   z-index: 1 so they paint above this element's own background but stay
   correctly ordered relative to this element's own stacking context, not
   some ancestor's. */
.shelf-cabinet {
    position: relative;
    isolation: isolate;
    border-radius: var(--radius-lg, var(--radius));
    padding: 0.6rem 1.6rem;
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-dark) 88%, black), color-mix(in srgb, var(--color-bg-dark) 96%, black));
    /* The two inset shadows (no blur, 6px offset) read as solid trim
       bands across the full width -- a plain-CSS stand-in for a crown
       moulding at the top and a base moulding at the bottom, without any
       new image asset. */
    box-shadow:
        0 10px 24px rgba(0, 0, 0, 0.45),
        inset 0 6px 0 color-mix(in srgb, var(--color-primary) 30%, var(--color-bg-dark)),
        inset 0 -6px 0 color-mix(in srgb, var(--color-primary) 30%, var(--color-bg-dark));
}

/* Left/right posts. Two background layers on the same pseudo-element
   (a gradient bevel + the existing wood-grain texture asset, blended
   together via background-blend-mode) rather than a third element --
   :before/:after are the only two pseudo-elements available per real
   element, and this cabinet needs exactly two posts. z-index: 1 (not the
   more common -1) since these must paint ABOVE .shelf-cabinet's own
   background/box-shadow trim, not behind it -- they're a foreground
   architectural feature, unlike the low-opacity texture overlays used
   elsewhere on this page (.shelf-compartment::before,
   .shelf-book-spine::before) which sit behind their host's content. */
.shelf-cabinet::before,
.shelf-cabinet::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1.4rem;
    background-image:
        linear-gradient(90deg,
            color-mix(in srgb, var(--color-bg-dark) 55%, black) 0%,
            color-mix(in srgb, var(--color-primary) 25%, var(--color-bg-dark)) 45%,
            color-mix(in srgb, var(--color-bg-dark) 55%, black) 100%),
        url("../images/library/shelf-wood-texture.webp");
    background-size: cover, cover;
    background-blend-mode: overlay;
    box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.6);
    z-index: 1;
    pointer-events: none;
}
.shelf-cabinet::before {
    left: 0;
    border-radius: var(--radius-lg, var(--radius)) 0 0 var(--radius-lg, var(--radius));
}
.shelf-cabinet::after {
    right: 0;
    border-radius: 0 var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius)) 0;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `dotnet test tests/frontend --filter "FullyQualifiedName~Library_GridViewMode_WrapsShelfRowsInACabinet"`
Expected: PASS.

- [ ] **Step 6: Run the full frontend test suite**

Run: `dotnet test tests/frontend`
Expected: PASS, 367/367 (366 existing + 1 new).

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Library.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/LibraryPageTests.cs
git commit -m "Add .shelf-cabinet wrapper: outer silhouette, side posts, crown/base trim"
```

---

### Task 2: Flatten per-level compartments into internal shelf levels

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`

**Interfaces:** None — pure CSS, no new classes, no Razor/JS changes. No new bUnit coverage (nothing new to assert structurally; this task changes only computed style values on already-tested elements).

**Context:** With Task 1's `.shelf-cabinet` now owning the outer rounded silhouette, each `ShelfRow`'s own `.shelf-compartment` no longer needs its own external rounding/shadow — keeping both would look like nested boxes-within-a-box. This task removes the now-redundant external styling from `.shelf-compartment` and closes the gap between consecutive levels, so the existing `.shelf-lip` element (already rendered at the bottom of every compartment) becomes the sole visual divider between shelf levels.

- [ ] **Step 1: Remove `.shelf-compartment`'s external rounding and update its texture overlay to match**

Find:
```css
.shelf-compartment {
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-dark) 90%, black), var(--color-bg-dark));
    border-radius: var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius)) 0.15rem 0.15rem;
    box-shadow: inset 0 10px 18px rgba(0, 0, 0, 0.5), inset 0 -2px 0 rgba(0, 0, 0, 0.3);
    padding: var(--space-3) var(--space-3) 0;
    position: relative;
    /* Establishes its own stacking context so the ::before wood-texture
       overlay's z-index: -1 (below) scopes to this element and paints
       behind its own children, instead of escaping to the nearest
       positioned ancestor and painting in the wrong place. */
    isolation: isolate;
}
```

Replace with (the *inset* shadows stay — those are the per-level recessed-depth effect, correct as-is; only the *external* rounding is removed, since each level is now a flat internal shelf inside `.shelf-cabinet`'s one external silhouette):
```css
.shelf-compartment {
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-dark) 90%, black), var(--color-bg-dark));
    box-shadow: inset 0 10px 18px rgba(0, 0, 0, 0.5), inset 0 -2px 0 rgba(0, 0, 0, 0.3);
    padding: var(--space-3) var(--space-3) 0;
    position: relative;
    /* Establishes its own stacking context so the ::before wood-texture
       overlay's z-index: -1 (below) scopes to this element and paints
       behind its own children, instead of escaping to the nearest
       positioned ancestor and painting in the wrong place. */
    isolation: isolate;
}
```

Find (a few lines below, the matching texture overlay):
```css
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

Replace with (removed the now-inapplicable `border-radius` line — the overlay must match its parent's new flat-rectangular shape):
```css
.shelf-compartment::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: url("../images/library/shelf-wood-texture.webp");
    background-size: cover;
    opacity: 0.15;
    pointer-events: none;
}
```

- [ ] **Step 2: Close the gap between levels and fix the lip's rounding**

Find:
```css
.shelf-row-group {
    margin-top: var(--space-3);
}
.shelf-row-group:first-child {
    margin-top: 0;
}
```

Replace with (no gap between levels at all now — the `.shelf-lip` element below is what visually separates one level from the next, reading as the physical shelf board's front edge):
```css
.shelf-row-group {
    margin-top: 0;
}
```

Find:
```css
.shelf-lip {
    height: 1rem;
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 85%, white) 0%, var(--color-primary) 45%, color-mix(in srgb, var(--color-primary) 70%, black) 100%);
    border-radius: 0 0 var(--radius) var(--radius);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
```

Replace with (the bottom rounding moves to a `:last-child`-scoped rule below — an internal level's lip, between two shelf levels, must be flat/square, not rounded; only the very last level's lip sits at the cabinet's own external bottom edge and needs to match its rounding):
```css
.shelf-lip {
    height: 1rem;
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 85%, white) 0%, var(--color-primary) 45%, color-mix(in srgb, var(--color-primary) 70%, black) 100%);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

/* Only the last shelf level's lip sits at .shelf-cabinet's own external
   bottom edge and needs matching rounding -- every other level's lip is
   now an internal divider between two levels (see .shelf-row-group's
   margin-top: 0 above) and must stay flat/square, not rounded. */
.shelf-row-group:last-child .shelf-lip {
    border-radius: 0 0 var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius));
}
```

- [ ] **Step 3: Run the full frontend test suite (regression check)**

Run: `dotnet test tests/frontend`
Expected: PASS, 367/367 — unchanged from Task 1's count, since this task is pure CSS with no new/changed assertions.

- [ ] **Step 4: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Flatten per-level shelf compartments into internal cabinet levels"
```

---

### Task 3: Restyle the genre/date plaque as a mounted brass plate

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`

**Interfaces:** None — the `.shelf-plaque` class name and its position in `ShelfRow.razor`'s markup are unchanged (no Razor edit in this task), so the existing bUnit tests (`ShelfRowTests.cs`'s `ShelfRow_WithLabel_RendersPlaque`/`ShelfRow_WithoutLabel_RendersNoPlaque`) keep passing unmodified — they assert on `.shelf-plaque`'s presence/text/absence, not its visual styling.

**Context:** `.shelf-plaque` currently renders as a colored pill-shaped badge, reading as a UI chip rather than part of the furniture. This task applies the same `brass-texture.webp` compositing technique already established on Statistics' Goal Ring (`.goal-ring::before` in this same file) to make it read as a small mounted brass plate instead — reusing an existing, already-generated texture asset cross-feature, not adding anything new. The plaque's position in the DOM/layout is unchanged (it still renders above its `ShelfRow`'s compartment, in normal document flow) — only its own visual styling changes.

- [ ] **Step 1: Update the `.shelf-plaque` rule**

Find:
```css
.shelf-plaque {
    display: inline-block;
    background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 85%, white), color-mix(in srgb, var(--color-primary) 75%, black));
    color: var(--color-bg-dark);
    font-family: var(--font-family-display);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.8rem;
    border-radius: 0.15rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    margin-bottom: var(--space-2);
    letter-spacing: 0.03em;
}
```

Replace with:
```css
.shelf-plaque {
    position: relative;
    /* Establishes its own stacking context so the ::before brass-texture
       overlay's z-index: -1 (below) scopes to this element, matching the
       same technique already used by .goal-ring (Statistics) and
       .shelf-compartment (Library Rework Phase 3) elsewhere in this file. */
    isolation: isolate;
    display: inline-block;
    background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary) 88%, white), color-mix(in srgb, var(--color-primary) 70%, black));
    color: var(--color-bg-dark);
    font-family: var(--font-family-display);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.3rem 0.9rem;
    border-radius: 0.1rem;
    border: 1px solid color-mix(in srgb, var(--color-primary) 40%, black);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1px 0 rgba(0, 0, 0, 0.25);
    margin-top: var(--space-2);
    margin-bottom: var(--space-2);
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

/* Reuses the exact established brass-texture.webp compositing technique
   from .goal-ring::before (Statistics) -- cross-feature reuse of an
   existing generic texture asset, not Statistics-specific content. If
   the asset is ever missing, this simply fails to paint and the plain
   gradient background above still renders correctly with no layout
   break, same fallback behavior as every other texture overlay on this
   page. */
.shelf-plaque::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: url("../images/statistics/brass-texture.webp");
    background-size: cover;
    opacity: 0.2;
    pointer-events: none;
}
```

(`margin-top` is new — the plaque no longer has a `.shelf-row-group` gap above it after Task 2 closed that gap, so this keeps a little breathing room between one level's `.shelf-lip` and the next level's plaque above it. `:first-child`'s plaque, if the very first group has a label, sits right under `.shelf-cabinet`'s own top trim — verify this looks correct in Task 4's live check, adjust `margin-top` if it looks cramped.)

- [ ] **Step 2: Run the full frontend test suite (regression check)**

Run: `dotnet test tests/frontend`
Expected: PASS, 367/367 — unchanged, since `ShelfRowTests.cs`'s existing plaque tests assert presence/text only.

- [ ] **Step 3: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Restyle the genre/date plaque as a mounted brass plate"
```

---

### Task 4: Live verification and Roadmap entry

**Files:**
- Modify: `documentation/Roadmap.md`

**Interfaces:** None — this task verifies Tasks 1-3's combined visual result and documents completion.

**Context:** This entire plan is CSS/markup restyling with no automated way to verify actual visual correctness — bUnit renders markup, not layout or painted pixels. Per this project's established pattern for every prior CSS-heavy phase, verification happens live in a browser. Use the direct-DOM-construction technique established in Phase 2/3/A: build a synthetic multi-group shelf (at least 2-3 `ShelfRow`-shaped groups, at least one with a `Label`) matching the real markup/classes, load the real `app.css`, and look at it.

- [ ] **Step 1: Start the dev server and build the synthetic harness**

Start this project's local dev server (check prior phase notes for the exact command/port). In a browser tab pointed at it, construct DOM matching `.shelf-cabinet` > multiple `.shelf-row-group` (at least one with a `.shelf-plaque`) > `.shelf-compartment` > `.shelf-books` > a few `.shelf-book-slot`/`.shelf-book` (using the real classes/structure established in Phases 1-A, including `.shelf-book-rotator`, `data-book-id`, `--shelf-book-rest`), each followed by `.shelf-lip`.

- [ ] **Step 2: Visually confirm the cabinet reads as one piece of furniture**

Screenshot the result. Confirm: one continuous rounded silhouette (not one rounded box per level), visible left/right posts with a wood-grain look, a visible crown/base trim top and bottom, brass-plated genre labels (not colored pills) sitting cleanly above each level, and a clean divider (the `.shelf-lip` band) between consecutive levels with no double-gap or overlap. If anything looks cramped, doubled-up, or visually broken (e.g. the plaque's `margin-top` from Task 3 looking too tight or too loose against the previous level's lip), adjust the specific CSS value and re-screenshot — this is exactly the kind of tuning that's expected to need a look-and-adjust pass, not a sign the plan is wrong.

- [ ] **Step 3: Confirm Phase A's reveal animation, neighbor-parting, and touch/keyboard behavior are unaffected**

Import the real `shelf-physics.js` against this harness (same technique as Phase A's Task 4) and confirm: hovering a book still reveals it correctly (rotator rotates, book translates/scales, no sideways drift — Phase A's Task 5 perspective-per-slot fix is untouched by this plan), neighbor-parting still displays symmetric offsets, and a real keyboard Tab still triggers `:focus-visible` reveal. This plan didn't touch any of `.shelf-book`/`.shelf-book-rotator`/`.shelf-book-slot`'s rules, so this should need no fixes — but confirm directly rather than assuming, since `.shelf-cabinet`'s new `isolation: isolate` and its posts' `z-index: 1` are new stacking-context-adjacent CSS in the same general area, and a stacking-context regression would not be caught by any bUnit test.

- [ ] **Step 4: Confirm all 4 themes render correctly**

Check Classic Library, Dark Library, Modern Light, and System — confirm the cabinet frame, posts, and brass plaque all render with sensible contrast/colors in each (all new rules use existing `--color-primary`/`--color-bg-dark` tokens, which are already theme-aware, but confirm directly rather than assuming, per this project's standing verification convention).

- [ ] **Step 5: Run the full test suite one final time**

Run: `dotnet test tests/frontend`
Expected: PASS, 367/367.

- [ ] **Step 6: Write the Roadmap entry**

Read `documentation/Roadmap.md`'s "Library Shelf Rework — Phase A" and "Library 'Liste' → 'Raster'" entries (the two most recent Library entries) for the established style, then append a new "Library Shelf Cabinet" entry immediately after them: what changed (cabinet wrapper, flattened per-level compartments, brass plaque restyle), what's reused vs. new (no new assets/tokens, `brass-texture.webp` reused cross-feature from Statistics for the first time on Library), the live-verification evidence from Steps 2-4, and explicitly note what's still deferred (decorative set-dressing, carved post ornaments — per the design spec's "Explicitly Out of Scope"/"Optional Future Asset" sections).

- [ ] **Step 7: Commit**

```bash
git add documentation/Roadmap.md
git commit -m "Document Library Shelf Cabinet completion"
```
