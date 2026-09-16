# Library Shelf Rework Phase A: 3D Transform Fix & Reveal State Machine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the shelf-book reveal's transform architecture (splitting rotation and translation onto two separate nested elements, isolating rotation as its own animatable channel) and fix reveal-tracking correctness (replace the ad-hoc `currentlyRevealed` DOM-reference tracking with a single shared, ID-based `revealedBookId` state machine, with a DOM-mutation guard so a book removed from the DOM mid-reveal never leaves a phantom parted-neighbor or stuck state behind). Also fix the actual root cause of the reported sideways-slide (Task 5 — see below), once identified.

**Correction (added after this plan's tasks 1-4 were implemented and independently re-verified, before merge):** this plan's original text below claimed the sideways-slide bug was caused by CSS transform function ORDER (rotateY applied before translateZ, in the "already-rotated local frame"). That mechanism is mathematically impossible for the transform order the shipped code actually used (`translateY(...) translateZ(...) rotateY(...) scale(...)` — the translations are written to the LEFT of the rotation, meaning `transform: A B C` composes as matrix `A·B·C` applied to a point as `A·(B·(C·point))`, so a translation written left of a rotation is applied AFTER rotation in the point-transform sense, adding its offset in the parent/world frame regardless of rotation angle). This was confirmed two independent ways after Tasks 1-4 shipped: a direct matrix derivation, and an empirical A/B measurement showing old (single combined transform) and new (split across `.shelf-book`/`.shelf-book-rotator`) code produce near-identical horizontal shift for a book at a fixed shelf position. Tasks 1-4 below are still worth doing (the state-machine fix in Task 3 is a real, independent bug fix), but they do NOT fix the user's originally-reported visual bug. **Task 5 identifies and fixes the actual cause**: `perspective-origin` defaults to 50%/50% of `.shelf-books` (the whole shelf row), so `translateZ` on a revealed book causes radial parallax AWAY from the row's horizontal center — magnitude scales with distance from center, which is exactly why the bug reads as "gets pushed to the right" (most affected books sit right of a row's center once the row is wider than its content, which is the normal case in the real app).

**Architecture:** `.shelf-book` (the `<a>`) originally carried a combined `rotateY(...)` (rest angle or reveal angle) together with `translateY`/`translateZ`/`scale` in one CSS `transform` string. Tasks 1-2 give rotation its own nested element: `.shelf-book` keeps only translate/scale, and a new child `.shelf-book-rotator` carries only `rotateY` — `shelf-physics.js` writes its per-frame spring values to these two elements separately. This isolates rotation as an independently-animatable channel (useful in its own right for Task 3's state machine and any future per-channel tuning) but — per the correction above — does not change which direction `translateZ` points. Task 3 replaces the touch module's local `currentlyRevealed` (a DOM element reference, which can go stale if Blazor removes that element from the DOM during a filter/sort re-render) with a module-level `revealedBookId` (a string ID, looked up live via `data-book-id` whenever needed) shared between the hover/focus path and the touch path, so both paths enforce the same "at most one book revealed" invariant and a `MutationObserver` cleans up if the tracked book vanishes from the DOM without a normal collapse ever firing. Task 5 moves `perspective` from `.shelf-books` (the row) onto each `.shelf-book-slot` (per book) — the standard technique for a grid/row of independently-animated 3D objects, giving each book its own perspective vanishing point centered on itself rather than sharing one vanishing point across the whole row.

**Tech Stack:** Blazor WebAssembly (.razor components), vanilla JS (`shelf-physics.js`, ES module), CSS (`app.css`), bUnit for component tests.

## Global Constraints

- No functional regression: search/filter/sort/pagination/favorites/borrowed-badge/progress-bar/cover-tint/textures/reduced-motion/touch two-tap all keep working exactly as today — this phase only touches *how* the reveal is structured and tracked, not any of that.
- All 364 existing frontend tests (`dotnet test` under `tests/frontend`) must stay green throughout; this phase adds tests, never removes coverage.
- Spring physics constants (`STIFFNESS = 210`, `DAMPING = 26`), the `REVEALED_ROTATE_Y_DEG`/`REVEALED_TRANSLATE_Y_REM`/`REVEALED_TRANSLATE_Z_REM`/`REVEALED_SCALE` values, and the neighbor-parting distance-decay values (`partOffsetForDistance`) are unchanged by this phase — only *which element* each value is applied to changes, never the values or the easing feel.
- No new JS test infrastructure — this project has zero automated tests for any `wwwroot/js/*.js` module (established pattern across every prior Library Rework phase); JS changes are verified by live browser observation in Task 4, exactly like Phase 1-3.
- No new CSS custom properties or color tokens.
- `/library/shelves` (the separate custom-Shelf-collection feature) is untouched by this phase — nothing here overlaps it.

---

### Task 1: Split rotation onto a new `.shelf-book-rotator` element

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css:1290-1545` (the `.shelf-book`/`.shelf-book-spine`/`.shelf-book-cover`/hover-fallback/reduced-motion rules)
- Test: `tests/frontend/ShelfBookTests.cs`

**Interfaces:**
- Produces: a `data-book-id` attribute on `a.shelf-book` (its value is `Book.Id.ToString()`), and a new `.shelf-book-rotator` wrapper element between `a.shelf-book` and the existing `.shelf-book-spine`/`.shelf-book-cover` spans. Task 2 (`shelf-physics.js`) and Task 3 (state machine) both depend on both of these existing exactly as described.
- Consumes: nothing new — `Book.Id`, `RestRotation`, and every existing parameter/field on `ShelfBook.razor`/`ShelfBook.razor.cs` are unchanged.

**Context:** Today `.shelf-book-spine`/`.shelf-book-cover` are direct children of `a.shelf-book`, and `a.shelf-book` itself carries the resting `rotateY(var(--shelf-book-rest))` transform plus (via the Phase 1 CSS fallback and Phase 2 JS) the combined hover/reveal transform. This task only changes *which element* carries which transform — no visual/behavioral change is expected from this task alone until Task 2 updates the JS to match (Task 1 alone, run through the *existing* Phase 1 CSS-only fallback path, must still look and behave identically to today, since the fallback path is exercised whenever JS hasn't taken over yet, e.g. immediately after page load before `OnAfterRenderAsync` completes).

- [ ] **Step 1: Write the failing structural tests**

Add to `tests/frontend/ShelfBookTests.cs` (inside the `ShelfBookTests` class, after the existing `ShelfBook_LinksToBookDetailPage` test):

```csharp
    [Fact]
    public void ShelfBook_RootAnchor_HasDataBookIdAttribute()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("1", cut.Find("a.shelf-book").GetAttribute("data-book-id"));
    }

    [Fact]
    public void ShelfBook_SpineAndCover_AreWrappedInRotator()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        var rotator = cut.Find(".shelf-book-rotator");
        Assert.NotNull(rotator.QuerySelector(".shelf-book-spine"));
        Assert.NotNull(rotator.QuerySelector(".shelf-book-cover"));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test tests/frontend --filter "FullyQualifiedName~ShelfBookTests"`
Expected: the two new tests FAIL (`data-book-id` attribute not found / `.shelf-book-rotator` not found); all pre-existing `ShelfBookTests` still PASS (nothing else changed yet).

- [ ] **Step 3: Update `ShelfBook.razor`**

Current file (for reference — do not copy verbatim, this is the *before* state):

```razor
<a class="shelf-book shelf-book-palette-@(Book.Id % 5)"
   style="--shelf-book-rest: @(RestRotation.ToString(System.Globalization.CultureInfo.InvariantCulture))deg"
   href="@(Href ?? $"library/books/{Book.Id}")"
   aria-label="@AccessibleLabel">
    <span class="shelf-book-spine @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle">
        <span class="shelf-book-spine-title" aria-hidden="true">@Book.Title</span>
    </span>
    <span class="shelf-book-cover @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle">
        @if (_coverObjectUrl is not null)
        {
            <img src="@_coverObjectUrl" alt="" aria-hidden="true" />
        }
        else
        {
            <span class="shelf-book-cover-placeholder" aria-hidden="true"></span>
        }
        <span class="shelf-book-cover-title" aria-hidden="true">@Book.Title</span>
        @if (!string.IsNullOrWhiteSpace(Book.Author))
        {
            <span class="shelf-book-cover-author" aria-hidden="true">@Book.Author</span>
        }
        @if (ShowFavorite)
        {
            <button type="button" class="shelf-book-favorite @(_isFavorite ? "is-favorite" : "")"
                    title="@(_isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen")"
                    @onclick="ToggleFavoriteAsync" @onclick:stopPropagation="true" @onclick:preventDefault="true">
                @(_isFavorite ? "★" : "☆")
            </button>
        }
        @if (OwnerUsername is { } ownerUsername)
        {
            <span class="shelf-book-borrowed-badge" title="@($"Geteiltes Buch von {ownerUsername}")">Geliehen von @ownerUsername</span>
        }
        @if (ProgressPercentage is { } progress)
        {
            <span class="shelf-book-progress">
                <span class="shelf-book-progress-bar" style="width: @(progress)%"></span>
            </span>
        }
    </span>
</a>
```

Replace with (only two changes: the new `data-book-id` attribute on the `<a>`, and a new `<span class="shelf-book-rotator">` wrapping the spine and cover spans — every other line is byte-for-byte identical to the original):

```razor
<a class="shelf-book shelf-book-palette-@(Book.Id % 5)"
   style="--shelf-book-rest: @(RestRotation.ToString(System.Globalization.CultureInfo.InvariantCulture))deg"
   href="@(Href ?? $"library/books/{Book.Id}")"
   aria-label="@AccessibleLabel"
   data-book-id="@Book.Id">
    <span class="shelf-book-rotator">
        <span class="shelf-book-spine @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle">
            <span class="shelf-book-spine-title" aria-hidden="true">@Book.Title</span>
        </span>
        <span class="shelf-book-cover @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle">
            @if (_coverObjectUrl is not null)
            {
                <img src="@_coverObjectUrl" alt="" aria-hidden="true" />
            }
            else
            {
                <span class="shelf-book-cover-placeholder" aria-hidden="true"></span>
            }
            <span class="shelf-book-cover-title" aria-hidden="true">@Book.Title</span>
            @if (!string.IsNullOrWhiteSpace(Book.Author))
            {
                <span class="shelf-book-cover-author" aria-hidden="true">@Book.Author</span>
            }
            @if (ShowFavorite)
            {
                <button type="button" class="shelf-book-favorite @(_isFavorite ? "is-favorite" : "")"
                        title="@(_isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen")"
                        @onclick="ToggleFavoriteAsync" @onclick:stopPropagation="true" @onclick:preventDefault="true">
                    @(_isFavorite ? "★" : "☆")
                </button>
            }
            @if (OwnerUsername is { } ownerUsername)
            {
                <span class="shelf-book-borrowed-badge" title="@($"Geteiltes Buch von {ownerUsername}")">Geliehen von @ownerUsername</span>
            }
            @if (ProgressPercentage is { } progress)
            {
                <span class="shelf-book-progress">
                    <span class="shelf-book-progress-bar" style="width: @(progress)%"></span>
                </span>
            }
        </span>
    </span>
</a>
```

**Note (added after the fact): this step's comment text below describes a transform-order bug theory that was later found to be incorrect — see the plan header's "Correction" section and Task 5. It's left as originally written here since Task 1's actual code change (the DOM/CSS split itself) is still correct and this note is just to stop a future reader from copying stale reasoning.**

- [ ] **Step 4: Update `app.css`'s `.shelf-book` rule and add `.shelf-book-rotator`**

Find the `.shelf-book` rule (around line 1324, immediately after the comment block explaining the two load-bearing 3D rules):

```css
.shelf-book {
    display: block;
    width: 3.25rem;
    height: 9.5rem;
    position: relative;
    text-decoration: none;
    cursor: pointer;
    transform-style: preserve-3d;
    transform-origin: bottom center;
    transform: rotateY(var(--shelf-book-rest));
    transition: transform var(--motion-reveal) var(--ease-standard);
}
```

Replace with (rotation moves entirely to the new `.shelf-book-rotator` rule below; `.shelf-book` itself now starts with no transform at all — it only ever receives translate/scale, applied later by the hover-fallback rule in Step 5 or by `shelf-physics.js` in Task 2):

```css
.shelf-book {
    display: block;
    width: 3.25rem;
    height: 9.5rem;
    position: relative;
    text-decoration: none;
    cursor: pointer;
    transform-style: preserve-3d;
    transform-origin: bottom center;
    transition: transform var(--motion-reveal) var(--ease-standard);
}

/* Carries ONLY the rotation (rest angle, or the reveal rotation on hover/
   focus/touch) -- .shelf-book itself carries only translate/scale (see
   its own rule above and the hover-fallback rule below). This split is
   the fix for a real, previously-shipped bug: when a single element
   combined `translateZ(...) rotateY(...)` in one transform, CSS's
   rightmost-function-first evaluation rotated the book FIRST, so the
   `translateZ` meant to push it toward the viewer was then applied in
   the book's own already-rotated local frame -- at angles near 90 deg
   that local "forward" axis points sideways in the viewer's frame, so
   the book visibly slid sideways instead of pulling toward the viewer.
   Splitting rotation onto this dedicated child means .shelf-book's own
   local frame is NEVER rotated, so translateZ on .shelf-book always
   means "toward the viewer" regardless of how far this child has
   rotated. Needs its own transform-style: preserve-3d (same "every
   ancestor in the chain" rule noted on .shelf-book above) and its own
   copy of the bottom-center transform-origin, since it's now the element
   that actually rotates -- .shelf-book keeps that same origin too
   (updated above), since .shelf-book still receives `scale(...)` on
   reveal (see the hover-fallback rule below) and must keep anchoring
   that scale at the book's base, not its center, to look identical to
   today. position: absolute; inset: 0 makes it fill
   .shelf-book's box exactly as .shelf-book-spine/.shelf-book-cover did
   when they were direct children of .shelf-book (their own `position:
   absolute; inset: 0` rule, unchanged, now resolves against this
   element instead). */
.shelf-book-rotator {
    display: block;
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transform-origin: bottom center;
    transform: rotateY(var(--shelf-book-rest));
    transition: transform var(--motion-reveal) var(--ease-standard);
}
```

- [ ] **Step 5: Update the Phase 1 CSS hover-fallback rule**

Find (around line 1522):

```css
.shelf-book:hover,
.shelf-book:focus-visible,
.shelf-book:has(:focus-visible) {
    transform: translateY(-1.4rem) translateZ(3.6rem) rotateY(-88deg) scale(1.08);
}
```

Replace with (the translate/scale part stays on `.shelf-book`; a second rule targets the child rotator for the rotation part — this is the CSS-only fallback, used when `shelf-physics.js` hasn't initialized yet or `prefers-reduced-motion` is set, so it must produce the exact same final visual result as before, just via two elements instead of one):

```css
.shelf-book:hover,
.shelf-book:focus-visible,
.shelf-book:has(:focus-visible) {
    transform: translateY(-1.4rem) translateZ(3.6rem) scale(1.08);
}

.shelf-book:hover .shelf-book-rotator,
.shelf-book:focus-visible .shelf-book-rotator,
.shelf-book:has(:focus-visible) .shelf-book-rotator {
    transform: rotateY(-88deg);
}
```

- [ ] **Step 6: Update the `shelf-physics-active` transition-disable rule and the reduced-motion rule**

Find (around line 1535):

```css
.shelf-physics-active .shelf-book,
.shelf-physics-active .shelf-book-slot {
    transition: none;
}
```

Replace with (Task 2's `shelf-physics.js` will write directly to the rotator's inline `transform` every animation frame too, so its CSS transition must also be disabled while the JS module is active, exactly like `.shelf-book` already is):

```css
.shelf-physics-active .shelf-book,
.shelf-physics-active .shelf-book-rotator,
.shelf-physics-active .shelf-book-slot {
    transition: none;
}
```

Find (around line 1540):

```css
@media (prefers-reduced-motion: reduce) {
    .shelf-book {
        transition: none;
    }
}
```

Replace with:

```css
@media (prefers-reduced-motion: reduce) {
    .shelf-book,
    .shelf-book-rotator {
        transition: none;
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test tests/frontend --filter "FullyQualifiedName~ShelfBookTests"`
Expected: all tests PASS, including the two new ones from Step 1.

- [ ] **Step 8: Run the full frontend test suite**

Run: `dotnet test tests/frontend`
Expected: PASS, 366 tests (364 existing + 2 new from this task).

- [ ] **Step 9: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/ShelfBookTests.cs
git commit -m "Split shelf-book rotation onto a dedicated .shelf-book-rotator element"
```

---

### Task 2: Update `shelf-physics.js` to drive rotation and translation on separate elements

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`

**Interfaces:**
- Consumes: Task 1's `.shelf-book-rotator` child element and `data-book-id` attribute (queried, not yet used for tracking — that's Task 3).
- Produces: no exported function signature changes — `initShelfPhysics(root)` and `initShelfTouch(root)` keep the exact same signatures Task 4 (via `Library.razor`, already wired up in the existing Phase 2 integration) calls today. Only the internal `applyTransform` function's behavior changes (still module-private, not exported).

**Context:** `applyTransform(book, progress)` currently writes one combined `transform` string (`translateY(...) translateZ(...) rotateY(...) scale(...)`) to `book.style.transform`. With Task 1's DOM split, it must instead write `translateY(...) translateZ(...) scale(...)` to `book.style.transform` and `rotateY(...)` to the rotator child's `style.transform` separately — same computed values as before (this task changes *where* the numbers go, not the numbers themselves), so the settle timing and easing feel are completely unaffected.

- [ ] **Step 1: Update `applyTransform`**

Find (around line 87):

```javascript
function applyTransform(book, progress) {
    const restDeg = getRestDeg(book);
    const { y: revealedY, z: revealedZ } = getRevealedTranslatePx();
    const rotateY = lerp(restDeg, REVEALED_ROTATE_Y_DEG, progress);
    const translateY = lerp(0, revealedY, progress);
    const translateZ = lerp(0, revealedZ, progress);
    const scale = lerp(1, REVEALED_SCALE, progress);
    book.style.transform = `translateY(${translateY}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
}
```

Replace with:

```javascript
// .shelf-book itself only ever needs translate/scale -- rotation lives on
// the nested .shelf-book-rotator (see app.css comment on that class for
// why: keeping .shelf-book's own local frame un-rotated is what makes
// translateZ here always mean "toward the viewer", regardless of how far
// the rotator has turned). `:scope > .shelf-book-rotator` is a direct-
// child query -- the rotator is always exactly one level below .shelf-book,
// see ShelfBook.razor.
function getRotator(book) {
    return book.querySelector(":scope > .shelf-book-rotator");
}

function applyTransform(book, progress) {
    const restDeg = getRestDeg(book);
    const { y: revealedY, z: revealedZ } = getRevealedTranslatePx();
    const rotateY = lerp(restDeg, REVEALED_ROTATE_Y_DEG, progress);
    const translateY = lerp(0, revealedY, progress);
    const translateZ = lerp(0, revealedZ, progress);
    const scale = lerp(1, REVEALED_SCALE, progress);
    book.style.transform = `translateY(${translateY}px) translateZ(${translateZ}px) scale(${scale})`;
    const rotator = getRotator(book);
    if (rotator) rotator.style.transform = `rotateY(${rotateY}deg)`;
}
```

- [ ] **Step 2: Update the main tick loop's resting-cleanup branch**

Find (around line 190, inside `tick(now)`):

```javascript
        if (isSettled(state)) {
            state.value = state.target;
            state.velocity = 0;
            applyTransform(book, state.value);
            if (state.value === 0) {
                book.style.removeProperty("transform");
            }
            active.delete(book);
        } else {
```

Replace with (once fully settled back at rest, remove BOTH elements' inline `transform` so `app.css`'s resting rules — `.shelf-book` with no transform, `.shelf-book-rotator { transform: rotateY(var(--shelf-book-rest)); }` — take back over cleanly, exactly mirroring the existing single-element cleanup pattern):

```javascript
        if (isSettled(state)) {
            state.value = state.target;
            state.velocity = 0;
            applyTransform(book, state.value);
            if (state.value === 0) {
                book.style.removeProperty("transform");
                const rotator = getRotator(book);
                if (rotator) rotator.style.removeProperty("transform");
            }
            active.delete(book);
        } else {
```

- [ ] **Step 3: Update `initShelfTouch`'s reduced-motion instant-snap branch**

Find (around line 251, inside `initShelfTouch`):

```javascript
    function setRevealedState(book, revealed) {
        if (!reducedMotion) {
            setRevealTarget(book, revealed);
            return;
        }
        // Reduced motion: snap instantly, no rAF loop. Reuses the same
        // spring-state object (via getOrCreateSpring) purely as storage for
        // the current value, so a later non-reduced-motion interaction
        // (e.g. this device also has a mouse) starts from a consistent
        // state rather than an untouched spring.
        const state = getOrCreateSpring(book);
        state.target = revealed ? 1 : 0;
        state.value = state.target;
        state.velocity = 0;
        applyTransform(book, state.value);
        if (state.value === 0) {
            book.style.removeProperty("transform");
        }
    }
```

Replace with:

```javascript
    function setRevealedState(book, revealed) {
        if (!reducedMotion) {
            setRevealTarget(book, revealed);
            return;
        }
        // Reduced motion: snap instantly, no rAF loop. Reuses the same
        // spring-state object (via getOrCreateSpring) purely as storage for
        // the current value, so a later non-reduced-motion interaction
        // (e.g. this device also has a mouse) starts from a consistent
        // state rather than an untouched spring.
        const state = getOrCreateSpring(book);
        state.target = revealed ? 1 : 0;
        state.value = state.target;
        state.velocity = 0;
        applyTransform(book, state.value);
        if (state.value === 0) {
            book.style.removeProperty("transform");
            const rotator = getRotator(book);
            if (rotator) rotator.style.removeProperty("transform");
        }
    }
```

- [ ] **Step 4: Manual sanity check (no automated JS tests exist in this project)**

This module has zero automated coverage (consistent with every other `wwwroot/js/*.js` file) — the bUnit suite from Task 1 already confirms the DOM structure `shelf-physics.js` now depends on (`.shelf-book-rotator` present, `data-book-id` present). Live verification of the actual pull-toward-viewer fix and the settle feel happens in Task 4, once Task 3's state-machine changes are also in place. Confirm right now only that the file has no syntax errors: run `node --check frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js` (or open it in an editor and confirm no red-squiggle syntax errors) before moving on.

- [ ] **Step 5: Run the full frontend test suite (regression check)**

Run: `dotnet test tests/frontend`
Expected: PASS, 366 tests — unchanged from Task 1's count, since this task touches only JS with no bUnit coverage of its own.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js
git commit -m "Drive shelf-book rotation and translation on separate elements in shelf-physics.js"
```

---

### Task 3: Unified `revealedBookId` state machine with a DOM-removal guard

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`

**Interfaces:**
- Consumes: Task 1's `data-book-id` attribute (read via `book.dataset.bookId`).
- Produces: no exported signature changes. Internally replaces `initShelfTouch`'s local `let currentlyRevealed = null` (a DOM element reference) with a module-level `let revealedBookId = null` (a string ID) shared by `initShelfPhysics`'s hover/focus handlers too, so both input paths enforce one shared "at most one book revealed" invariant. Adds a `MutationObserver`-based guard so a book removed from the DOM while revealed (e.g. a filter/sort change while hovering) cannot leave a stuck neighbor-parting offset or a stale `revealedBookId` behind.

**Context:** Today, `initShelfPhysics` (hover/focus) has no shared "currently revealed" tracking at all — each `mouseenter`/`mouseleave`/`focusin`/`focusout` acts only on the specific book it targets, relying on the browser to fire a `mouseleave` on the old book before/around a `mouseenter` on the new one. `initShelfTouch` has its own separate `currentlyRevealed` DOM-reference variable. Neither path has any defense against Blazor removing the tracked book from the DOM entirely (e.g. the user is hovering a book when a filter/sort change removes it from the result set) — the neighbor-parting offsets applied to that book's siblings are plain inline `style.transform` that nothing will ever reset once the revealed book itself is gone, since every reset path (`collapse`/`mouseleave`/`focusout`/tap-elsewhere) needs to find that book element first.

- [ ] **Step 1: Add the shared state and helpers**

Find (around line 97, just before `const springs = new WeakMap();`):

```javascript
// One spring-state object per book, keyed by element -- garbage collected
```

Insert immediately before that comment (new module-level state, shared by both `initShelfPhysics` and `initShelfTouch`):

```javascript
// Single source of truth for "which book is currently revealed", shared
// between the hover/focus path (initShelfPhysics) and the two-tap touch
// path (initShelfTouch) -- guarantees at most one book is ever logically
// revealed regardless of which input triggered it. Tracked by ID (the
// data-book-id attribute set in ShelfBook.razor), not by DOM element
// reference, specifically so a stale reference can never linger: if
// Blazor removes the revealed book from the DOM (a filter/sort change
// while it's revealed), the ID becomes simply un-findable rather than
// pointing at a detached element, and the MutationObserver guard below
// (installed by whichever init function runs first) notices and resets
// cleanly.
let revealedBookId = null;
let shelfRoot = null;
let revealGuardObserver = null;

function bookId(book) {
    return book.dataset.bookId ?? null;
}

function findBookById(root, id) {
    if (!root || id === null) return null;
    return root.querySelector(`.shelf-book[data-book-id="${CSS.escape(id)}"]`);
}

// All slots (.shelf-book-slot) currently parted away from their resting
// translateX position, whether still mid-spring-animation or already
// settled at a non-zero offset. Needed because activeParts (below) only
// tracks slots that still need per-frame work -- a slot that finished
// settling at a non-zero parted offset is correctly removed from
// activeParts (nothing left to animate) but must stay discoverable here
// so resetAllParts (the DOM-removal guard's cleanup) can still find and
// un-part it later even though it long ago stopped animating.
const partedSlots = new Set();

// One shared instance per shelf root (installed by whichever of
// initShelfPhysics/initShelfTouch runs first against a given root --
// re-entrant calls against the SAME root, e.g. both init functions
// running back-to-back in Library.razor's OnAfterRenderAsync, correctly
// no-op below). Watches for the currently-revealed book's element
// disappearing from the DOM without a normal collapse ever firing -- the
// only way that can happen is a Blazor re-render (filter/sort/search
// change) removing it while it's still revealed. When that happens, any
// of its neighbors that were parted away are reset back to resting
// (there is no other way to find "which slots were parted by this
// now-gone book" once it's gone, so this resets every currently-parted
// slot rather than trying to recompute which ones belonged to it) and
// revealedBookId is cleared so the state machine's invariant (0 or 1
// revealed) stays true.
//
// Root-aware, not a one-shot flag: Library.razor tears down and rebuilds
// the ENTIRE .library-shelf element (a new ElementReference) whenever the
// shelf reappears after not being rendered -- a Grid<->List view-mode
// toggle, or the shelf temporarily replaced by a loading/error/empty
// state -- and re-calls initShelfPhysics/initShelfTouch on that new root
// each time. A one-shot "already installed, ever" flag would leave the
// observer forever attached to the first, now-detached root, silently
// going inert for the rest of the session on every later root -- exactly
// the failure this guard exists to prevent. So: if `root` differs from
// the previously-observed `shelfRoot`, disconnect the old observer (it
// can never fire again anyway, its root is detached) and attach a fresh
// one to the new root. Any revealedBookId/partedSlots state tracked
// against the old root is meaningless once that root is gone (nothing in
// the new root corresponds to it), so both are cleared on migration too
// -- this also prevents a reveal left active at teardown from leaking
// into the freshly-initialized shelf and desyncing its first hover/tap.
function ensureRevealGuard(root) {
    if (root === shelfRoot) return;
    if (revealGuardObserver) revealGuardObserver.disconnect();
    revealedBookId = null;
    partedSlots.clear();
    shelfRoot = root;
    revealGuardObserver = new MutationObserver(() => {
        if (revealedBookId === null) return;
        if (findBookById(shelfRoot, revealedBookId)) return;
        resetAllParts();
        revealedBookId = null;
    });
    revealGuardObserver.observe(root, { childList: true, subtree: true });
}

function resetAllParts() {
    for (const slot of partedSlots) {
        const state = partSprings.get(slot);
        if (!state) {
            partedSlots.delete(slot);
            continue;
        }
        state.target = 0;
        activeParts.add(slot);
    }
    ensureLoopRunning();
}

```

- [ ] **Step 2: Track `partedSlots` alongside `activeParts`**

Find `setPartTargets` (around line 134):

```javascript
        const direction = i < revealedIndex ? -1 : 1;
        const state = getOrCreatePartSpring(slots[i]);
        state.target = revealed ? magnitude * direction : 0;
        activeParts.add(slots[i]);
    }
```

Replace with:

```javascript
        const direction = i < revealedIndex ? -1 : 1;
        const state = getOrCreatePartSpring(slots[i]);
        state.target = revealed ? magnitude * direction : 0;
        activeParts.add(slots[i]);
        if (revealed) partedSlots.add(slots[i]);
    }
```

Find the tick loop's part-settling branch (around line 209, added in Task 2's context but unchanged by Task 2 — this is the original code):

```javascript
        if (isSettled(state)) {
            state.value = state.target;
            state.velocity = 0;
            if (state.value === 0) {
                slot.style.removeProperty("transform");
            } else {
                slot.style.transform = `translateX(${state.value}px)`;
            }
            activeParts.delete(slot);
        } else {
```

Replace with (once a part fully settles back at 0, it's no longer parted, so remove it from `partedSlots` too — this is what lets `resetAllParts` above eventually stop needing to touch it again):

```javascript
        if (isSettled(state)) {
            state.value = state.target;
            state.velocity = 0;
            if (state.value === 0) {
                slot.style.removeProperty("transform");
                partedSlots.delete(slot);
            } else {
                slot.style.transform = `translateX(${state.value}px)`;
            }
            activeParts.delete(slot);
        } else {
```

- [ ] **Step 3: Rewrite `initShelfTouch` to use the shared `revealedBookId`**

Find the entire `initShelfTouch` function (from `export function initShelfTouch(root) {` to its closing `}`, around lines 245-316):

```javascript
export function initShelfTouch(root) {
    if (!root || !isTouchPrimary()) return;

    const reducedMotion = prefersReducedMotion();
    let currentlyRevealed = null;

    function setRevealedState(book, revealed) {
        if (!reducedMotion) {
            setRevealTarget(book, revealed);
            return;
        }
        // Reduced motion: snap instantly, no rAF loop. Reuses the same
        // spring-state object (via getOrCreateSpring) purely as storage for
        // the current value, so a later non-reduced-motion interaction
        // (e.g. this device also has a mouse) starts from a consistent
        // state rather than an untouched spring.
        const state = getOrCreateSpring(book);
        state.target = revealed ? 1 : 0;
        state.value = state.target;
        state.velocity = 0;
        applyTransform(book, state.value);
        if (state.value === 0) {
            book.style.removeProperty("transform");
            const rotator = getRotator(book);
            if (rotator) rotator.style.removeProperty("transform");
        }
    }

    function collapse(book) {
        setRevealedState(book, false);
        book.classList.remove("is-revealed");
        if (reducedMotion) return; // no neighbor-parting motion under reduced motion
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, false);
    }

    function reveal(book) {
        setRevealedState(book, true);
        book.classList.add("is-revealed");
        if (reducedMotion) return; // no neighbor-parting motion under reduced motion
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, true);
    }

    root.addEventListener("click", (e) => {
        // A tap on the favorite button must never touch the two-tap state
        // machine below. @onclick:stopPropagation on the button (ShelfBook.razor)
        // does NOT protect this listener -- this listener sits on an
        // ancestor closer to the target than Blazor's own delegated
        // dispatch listener, so it fires first in the bubble phase, before
        // Blazor's later stopPropagation() call can have any effect. Bail
        // out here instead, before currentlyRevealed/collapse/reveal are
        // touched, so Blazor's own click handling for the favorite toggle
        // runs completely independent of this state machine.
        if (e.target.closest?.(".shelf-book-favorite")) return;

        const book = e.target.closest?.(".shelf-book");

        if (!book || !root.contains(book)) {
            // Tapped outside any book -- collapse whatever's open.
            if (currentlyRevealed) {
                collapse(currentlyRevealed);
                currentlyRevealed = null;
            }
            return;
        }

        if (book === currentlyRevealed) {
            // Second tap on the already-revealed book -- let the click
            // proceed to navigation (don't preventDefault).
            currentlyRevealed = null;
            return;
        }

        // First tap on a not-yet-revealed book (or a different book while
        // another was open): reveal this one, collapse any other, and
        // swallow this tap instead of navigating.
        e.preventDefault();
        if (currentlyRevealed) collapse(currentlyRevealed);
        reveal(book);
        currentlyRevealed = book;
    });
}
```

Replace with (same two-tap behavior, same reduced-motion handling, now tracking via the shared `revealedBookId`/`findBookById` instead of a local DOM reference):

```javascript
export function initShelfTouch(root) {
    if (!root || !isTouchPrimary()) return;
    ensureRevealGuard(root);

    const reducedMotion = prefersReducedMotion();

    function setRevealedState(book, revealed) {
        if (!reducedMotion) {
            setRevealTarget(book, revealed);
            return;
        }
        // Reduced motion: snap instantly, no rAF loop. Reuses the same
        // spring-state object (via getOrCreateSpring) purely as storage for
        // the current value, so a later non-reduced-motion interaction
        // (e.g. this device also has a mouse) starts from a consistent
        // state rather than an untouched spring.
        const state = getOrCreateSpring(book);
        state.target = revealed ? 1 : 0;
        state.value = state.target;
        state.velocity = 0;
        applyTransform(book, state.value);
        if (state.value === 0) {
            book.style.removeProperty("transform");
            const rotator = getRotator(book);
            if (rotator) rotator.style.removeProperty("transform");
        }
    }

    function collapse(book) {
        setRevealedState(book, false);
        book.classList.remove("is-revealed");
        if (reducedMotion) return; // no neighbor-parting motion under reduced motion
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, false);
    }

    function reveal(book) {
        setRevealedState(book, true);
        book.classList.add("is-revealed");
        if (reducedMotion) return; // no neighbor-parting motion under reduced motion
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, true);
    }

    root.addEventListener("click", (e) => {
        // A tap on the favorite button must never touch the two-tap state
        // machine below. @onclick:stopPropagation on the button (ShelfBook.razor)
        // does NOT protect this listener -- this listener sits on an
        // ancestor closer to the target than Blazor's own delegated
        // dispatch listener, so it fires first in the bubble phase, before
        // Blazor's later stopPropagation() call can have any effect. Bail
        // out here instead, before revealedBookId/collapse/reveal are
        // touched, so Blazor's own click handling for the favorite toggle
        // runs completely independent of this state machine.
        if (e.target.closest?.(".shelf-book-favorite")) return;

        const book = e.target.closest?.(".shelf-book");

        if (!book || !root.contains(book)) {
            // Tapped outside any book -- collapse whatever's open.
            if (revealedBookId !== null) {
                const previous = findBookById(root, revealedBookId);
                if (previous) collapse(previous);
                revealedBookId = null;
            }
            return;
        }

        if (bookId(book) === revealedBookId) {
            // Second tap on the already-revealed book -- let the click
            // proceed to navigation (don't preventDefault).
            revealedBookId = null;
            return;
        }

        // First tap on a not-yet-revealed book (or a different book while
        // another was open): reveal this one, collapse any other, and
        // swallow this tap instead of navigating.
        e.preventDefault();
        if (revealedBookId !== null) {
            const previous = findBookById(root, revealedBookId);
            if (previous) collapse(previous);
        }
        reveal(book);
        revealedBookId = bookId(book);
    });
}
```

- [ ] **Step 4: Wire `initShelfPhysics`'s hover/focus handlers into the same `revealedBookId`**

Find the entire `initShelfPhysics` function (from `export function initShelfPhysics(root) {` to the end of the file):

```javascript
export function initShelfPhysics(root) {
    if (!root || prefersReducedMotion()) return;

    root.classList.add("shelf-physics-active");

    root.addEventListener("mouseenter", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        setRevealTarget(book, true);
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, true);
    }, true);

    root.addEventListener("mouseleave", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        if (e.relatedTarget && book.contains(e.relatedTarget)) return;
        setRevealTarget(book, false);
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, false);
    }, true);

    root.addEventListener("focusin", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        setRevealTarget(book, true);
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, true);
    });

    root.addEventListener("focusout", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        if (e.relatedTarget && book.contains(e.relatedTarget)) return;
        setRevealTarget(book, false);
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, false);
    });
}
```

Replace with (introduces `revealHoverBook`/`hideHoverBook` helpers so `mouseenter`/`focusin` hand off from whatever was previously revealed — including a book revealed via the *touch* path, since both paths now share the same `revealedBookId` — and `mouseleave`/`focusout` only ever collapse the book they're tracked as having revealed, never a book some other, later event already superseded):

```javascript
export function initShelfPhysics(root) {
    if (!root || prefersReducedMotion()) return;
    ensureRevealGuard(root);

    root.classList.add("shelf-physics-active");

    function revealHoverBook(book) {
        const id = bookId(book);
        if (id !== null && id === revealedBookId) return;
        if (revealedBookId !== null) {
            const previous = findBookById(root, revealedBookId);
            if (previous && previous !== book) hideHoverBook(previous);
        }
        setRevealTarget(book, true);
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, true);
        revealedBookId = id;
    }

    function hideHoverBook(book) {
        setRevealTarget(book, false);
        // Unconditional, not conditional on how it got revealed: since
        // revealedBookId is now shared with the touch path, the book this
        // hides might have been revealed by a tap (which adds
        // "is-revealed" for its own CSS pointer-events rule, see
        // app.css), and this hover-side path is what ends up closing it
        // if the same device also has a mouse and it leaves the book.
        // Removing a class that was never added is a harmless no-op, so
        // this is safe to call unconditionally rather than checking first.
        book.classList.remove("is-revealed");
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, false);
    }

    // Only collapses if `book` is still the one this state machine
    // believes is revealed -- guards against a stale mouseleave/focusout
    // (e.g. fast pointer movement) firing after some other event has
    // already handed the reveal off to a different book.
    function closeIfCurrentlyRevealed(book) {
        const id = bookId(book);
        if (id === null || id !== revealedBookId) return;
        hideHoverBook(book);
        revealedBookId = null;
    }

    root.addEventListener("mouseenter", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        revealHoverBook(book);
    }, true);

    root.addEventListener("mouseleave", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        if (e.relatedTarget && book.contains(e.relatedTarget)) return;
        closeIfCurrentlyRevealed(book);
    }, true);

    root.addEventListener("focusin", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        revealHoverBook(book);
    });

    root.addEventListener("focusout", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        if (e.relatedTarget && book.contains(e.relatedTarget)) return;
        closeIfCurrentlyRevealed(book);
    });
}
```

- [ ] **Step 5: Run the full frontend test suite (regression check)**

Run: `dotnet test tests/frontend`
Expected: PASS, 366 tests — unchanged from Task 2's count, since this task also touches only JS with no bUnit coverage of its own (the state-machine invariants are verified live in Task 4, matching this project's established pattern for anything requiring real browser DOM events/timing).

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js
git commit -m "Unify hover and touch reveal tracking into a shared revealedBookId state machine"
```

---

### Task 4: Live verification and Roadmap entry

**Files:**
- Modify: `documentation/Roadmap.md`

**Interfaces:** None — this task verifies Tasks 1-3's combined behavior and documents completion; it does not change application code.

**Context:** Per this project's established pattern (every prior Library Rework phase), no automated test can verify a live 3D transform's visual correctness, a spring's settle feel, or DOM-mutation-driven state cleanup timing — these need direct browser observation. Use the same technique established in Phase 2/3: construct the real `ShelfRow`/`ShelfBook` markup directly in a browser tab and import the actual shipped `shelf-physics.js` from a locally running dev server, rather than routing through Blazor's full data layer (this avoids the documented WASM-fetch-interop blocker noted in project memory).

- [ ] **Step 1: Start the dev server and open a browser tab**

Run the frontend dev server for this worktree (matching the project's established local-dev port/setup — check `documentation/` or prior phase notes if the exact command isn't already known) and open a blank tab pointed at it, so `shelf-physics.js` is servable via `import(...)`.

- [ ] **Step 2: Build a synthetic shelf and import the real module**

In the browser, construct a DOM fragment matching `ShelfRow`/`ShelfBook`'s real classes and structure (`.shelf-books` > several `.shelf-book-slot` > `.shelf-book[data-book-id]` > `.shelf-book-rotator` > `.shelf-book-spine`/`.shelf-book-cover`, each `.shelf-book` carrying a distinct `--shelf-book-rest` custom property), append it into the page, then `import("http://localhost:<port>/js/shelf-physics.js")` and call `initShelfPhysics(root)` against it.

- [ ] **Step 3: Verify the transform-order bug is actually fixed**

Dispatch a synthetic `mouseenter` on one book and sample `getComputedStyle`/`getBoundingClientRect` on it across several animation frames. Confirm the book's on-screen horizontal (`x`) position stays essentially unchanged throughout the reveal (allowing only the small incidental shift from `scale`/its own width) while its apparent depth/size increases — i.e., it visibly grows/lifts toward the viewer, not slides sideways. This is the concrete regression test for the bug reported by the user ("wird nach rechts geschoben statt rausgezogen").

- [ ] **Step 4: Verify the state-machine invariants from the design doc's edge-case section**

Using the same synthetic harness:
- Hover book A, then (without leaving A first) dispatch `mouseenter` directly on book B — confirm A eases back to resting and B reveals, and confirm at every sampled frame that at most one book has `is-revealed`-equivalent non-zero spring progress significantly greater than the other (no double-reveal).
- While book A is revealed, remove book A's DOM node entirely (simulating a filter/sort change) — confirm, after a short wait for the `MutationObserver` callback to fire, that any parted neighbor slots have their `transform` removed (back to resting) and that a subsequent hover on a different book works correctly (no stuck `revealedBookId` blocking it).
- Rapidly hover across 4-5 adjacent books in sequence — confirm no book gets stuck mid-rotation and the final hovered book ends up correctly revealed.

- [ ] **Step 5: Verify touch two-tap and reduced motion still work**

Re-run the touch two-tap and `prefers-reduced-motion` checks from the Phase 2/3 Roadmap entries (first tap reveals without navigating, second tap navigates, tap-elsewhere collapses; reduced motion snaps instantly with no spring/parting) — these must be unaffected by the `revealedBookId` refactor. Also confirm the reduced-motion snap branch removes the rotator's inline transform correctly (Task 2 Step 3) by checking `getComputedStyle` on the rotator falls back to the CSS resting rule after a collapse.

- [ ] **Step 6: Verify keyboard focus parity and existing functionality**

Tab onto a book (confirm reveal via `focusin`), tab onto its favorite button (confirm it stays revealed via the `relatedTarget` containment check), tab away (confirm it eases back). Confirm search/filter/sort/pagination/favorites/borrowed-badge/progress-bar/cover-tint/textures are all visually unaffected (this phase changed only the reveal's internal transform structure and reveal-tracking, not any of that).

- [ ] **Step 7: Run the full test suite one final time**

Run: `dotnet test tests/frontend`
Expected: PASS, 366/366.

- [ ] **Step 8: Write the Roadmap entry**

Read `documentation/Roadmap.md`'s existing "Library Rework — Phase 3" entry for the established style, then append a new "Library Rework — Phase A (3D Transform Fix & Reveal State Machine)" entry immediately after it, following the same structure (what changed, what review/live-verification found, what's confirmed vs. not independently re-verified). Include: the transform-order bug and its fix (rotation split onto `.shelf-book-rotator`), the `revealedBookId` unification and `MutationObserver` guard, and the concrete live-verification evidence gathered in Steps 3-6 above.

- [ ] **Step 9: Commit**

```bash
git add documentation/Roadmap.md
git commit -m "Document Library Shelf Rework Phase A completion"
```

---

### Task 5: Fix the actual sideways-slide bug (per-slot `perspective`)

**Added after Tasks 1-4 shipped and went through a final whole-branch review**, which found that Tasks 1-4 do not fix the user's originally-reported bug (see the plan header's "Correction" section). This task fixes the real cause.

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (move `perspective` from `.shelf-books` to `.shelf-book-slot`)

**Interfaces:** None — pure CSS, no new classes, no JS or Razor changes. `shelf-physics.js` and `ShelfBook.razor`/`ShelfRow.razor` are untouched by this task.

**Context — the actual bug, confirmed empirically**: `.shelf-books` (the flex row containing all books in one shelf group) currently has `perspective: 60rem`. CSS `perspective` establishes a 3D viewing frustum whose vanishing point (`perspective-origin`, defaulting to `50% 50%`) is the CENTER of the element that has the `perspective` property — here, the center of the ENTIRE ROW, not any individual book. When a book's `translateZ` pushes it toward the viewer under this shared perspective, every point on that book is projected through a formula that scales apparent position OUTWARD from the row's center as depth increases (`screenX = originX + (trueX - originX) * perspective / (perspective - z)`) — a book sitting far from the row's horizontal center visibly shifts sideways, AWAY from center, as it comes forward. A book near center shows almost no shift. This was confirmed by direct measurement in a browser harness: a book 424px left of a 900px-wide row's center shifted ~31px further left on reveal; a book 424px right of center shifted ~23px further right; a book near center shifted under 1px. This exactly matches the user's complaint ("wird nach rechts geschoben") for books that happen to sit right of their row's center — which, in the real app, is most books in a typical row, since `.shelf-books`' width comes from the page layout, not from how many books happen to be in a given group, so groups usually don't fill the row edge-to-edge symmetrically.

**The fix**: give each book its OWN perspective context, centered on itself, instead of sharing one context (and one off-center-for-most-books vanishing point) across the whole row. This is the standard technique for any grid/row of independently-animated 3D objects — each object gets `perspective` on its own immediate container, so its own vanishing point is always its own center, and `translateZ` on it always means "toward the viewer, with zero position-dependent skew" regardless of where that object sits in the larger layout.

- [ ] **Step 1: Write a live-verification harness script BEFORE changing the CSS, to see the bug**

This is CSS-only work with no bUnit coverage possible (bUnit doesn't render real layout/3D transforms) — verification is entirely live-browser, both before (confirming the bug reproduces) and after (confirming the fix). Start the dev server for this worktree (check `documentation/` or prior phase notes for the exact command/port if not already known) and, in a browser tab pointed at it, run a script that:
1. Builds a synthetic `.shelf-books` row at a realistic width (at least 800-900px, matching the real app's typical content width — NOT shrunk to fit its books, since the bug's whole mechanism depends on the row being wider than its content) containing at least 3 books, with at least one positioned clearly left of the row's horizontal center and one clearly right of it.
2. Imports the real `shelf-physics.js` from the dev server and calls `initShelfPhysics` on the row.
3. For each test book, records `getBoundingClientRect()` before reveal, dispatches a `mouseenter`, drives the spring to full settle (drive `requestAnimationFrame` manually with a hand-incremented fake timestamp rather than real timers — a real-timer-based approach in this environment's automation tooling has previously caused background-tab timer throttling severe enough to blow past the tool's own call-timeout budget and contaminate later measurements with stale state from an abandoned run; see this plan's own Task 4 verification notes for why), then records the rect again.
4. Confirms the CURRENT (unfixed) code shows a shift that increases with distance from the row's horizontal center, in the direction AWAY from center (negative shift for a book left of center, positive for a book right of center).

Expected result at this step: reproduces the bug (confirms the harness itself is valid before you rely on it to confirm the fix).

- [ ] **Step 2: Move `perspective` from `.shelf-books` to `.shelf-book-slot`**

Find in `app.css`:
```css
.shelf-books {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding-bottom: var(--space-2);
    perspective: 60rem;
}

.shelf-book-slot {
    transform-style: preserve-3d;
}
```

Replace with:
```css
.shelf-books {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding-bottom: var(--space-2);
}

/* perspective lives here, per book, NOT on .shelf-books (the whole row) --
   see the corrected comment on .shelf-book (above, near the top of this
   file's ShelfBook rules) for the full story. In short: perspective's
   vanishing point (perspective-origin, default 50% 50%) is the center of
   whichever element carries the perspective property. Sharing one
   perspective across the whole row means every book's translateZ push
   toward the viewer gets radially projected away from the ROW's center,
   not its own -- a book far from the row's center visibly shifts
   sideways on reveal, proportional to that distance. Giving each slot
   its own perspective makes each book's own center its vanishing point,
   so translateZ always means "toward the viewer" with zero position-
   dependent skew, regardless of where the book sits in the row. */
.shelf-book-slot {
    transform-style: preserve-3d;
    perspective: 60rem;
}
```

- [ ] **Step 3: Re-run the live-verification harness from Step 1 against the fixed CSS**

Reload the dev server (or just re-run the harness script against the now-changed `app.css` — restart `dotnet run` if it doesn't hot-reload CSS automatically) and re-run the exact same measurement. Expected result: all three test books (left/center/right of row center) now show approximately the SAME small residual shift (a few px at most, from `scale`'s composition — NOT scaling with distance from row center at all). If any book still shows a shift that grows with distance from center, the fix did not fully land — check for a leftover `perspective` declaration elsewhere (e.g. an inline style, or a `!important` rule) before concluding the CSS change was applied correctly.

- [ ] **Step 4: Confirm the 3D fan-rotation and existing reveal behavior are unaffected**

Using the same or a fresh harness: confirm a book's resting-state fan rotation (`--shelf-book-rest`) still renders correctly (a non-identity `matrix3d(...)` on the rotator, not flattened to 2D) — moving `perspective` to a lower level in the DOM tree (from `.shelf-books` to `.shelf-book-slot`, which is a child of `.shelf-books` and a parent of `.shelf-book`) must not break the `preserve-3d` chain, since `.shelf-book-slot` already had `transform-style: preserve-3d` and now ALSO establishes the perspective — both properties can coexist on the same element without conflict, but confirm it directly rather than assuming. Confirm neighbor-parting (`.shelf-book-slot`'s `translateX` on hover of an adjacent book) still displays correctly — parting is a 2D `translateX` on the slot itself, unaffected by whether perspective lives on the slot or its parent, but do a live look to be sure nothing about the slot's own 3D projection changed unexpectedly now that IT is the perspective root instead of a plain 3D participant.

- [ ] **Step 5: Run the full test suite**

Run: `dotnet test tests/frontend`
Expected: PASS, 366/366 (this task makes no C#/Razor changes, so the count is unchanged from Task 4).

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Fix shelf-book sideways-shift on reveal: move perspective to per-book slot"
```

- [ ] **Step 7: Correct the Roadmap entry**

Task 4's Roadmap entry (written before this bug was found) claims the transform-order fix resolved the user-reported sideways-slide and calls it "confirmed visually." That claim was wrong. Edit `documentation/Roadmap.md`'s "Library Shelf Rework — Phase A" entry (written by Task 4) to:
- Correct the transform-order explanation to match this plan's header "Correction" section (translations were already unrotated/outermost in the old code; the split doesn't change translateZ's direction).
- Note plainly that Tasks 1-4 alone did not fix the reported bug, and that Task 5 (this task) found and fixed the actual cause (`perspective-origin` scoped to the row instead of per-book).
- Add the concrete measurement evidence from Steps 1 and 3 above (shift-vs-distance-from-center, before and after).
- Keep the parts of the Task 4 entry that remain true and valuable as-is (the state-machine fix, the DOM-removal guard, the touch two-tap and keyboard-focus verification) — this correction is additive/corrective, not a full rewrite.

- [ ] **Step 8: Commit the Roadmap correction**

```bash
git add documentation/Roadmap.md
git commit -m "Correct Phase A Roadmap entry: sideways-slide was a perspective-origin bug, not transform order"
```
