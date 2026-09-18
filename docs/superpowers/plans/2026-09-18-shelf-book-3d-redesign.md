# Shelf Book 3D Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shelf book's 2-face hinge construction (reads as a flat "T") with a true 6-face rigid box, plus hardcover binding details (headband, raised spine bands, gilt frame, ribbon bookmark).

**Architecture:** Pure CSS 3D transforms on `preserve-3d` sibling `<span>` faces inside the existing `.shelf-book-rotator`, using the standard CSS-cube face formula (each face's `translateZ` = half of the dimension it does *not* span). No new DOM ancestor, no new JS beyond rebasing one existing constant, no new dependencies.

**Tech Stack:** Blazor WASM (Razor component `ShelfBook.razor`/`.razor.cs`), plain CSS (`app.css`), vanilla JS spring physics (`shelf-physics.js`), bUnit tests.

## Global Constraints

- Box dimensions are the app's own already-established sizes, not new numbers: **T (thickness) = 3.25rem, W (cover width) = 6.3rem, H (height) = 9.5rem**.
- `.shelf-book-slot`'s `perspective` rule (Phase A) is untouched.
- `STIFFNESS = 210` / `DAMPING = 26` in `shelf-physics.js` are unchanged.
- No new CSS custom properties/color tokens — reuse `--color-gold-accent` (decorative gold) and `--color-accent-text` (accessible-contrast gold, for real text) from the theme files (`wwwroot/Styles/themes/*.css`), same pair already used elsewhere in `app.css` (e.g. line 46, 251).
- `ShelfBook.razor.cs`'s `RestRotation` and `shelf-physics.js`'s `REVEALED_ROTATE_Y_DEG` (plus its CSS fallback rule) must change together in the same task — a mismatch would make the JS-driven and no-JS/reduced-motion resting states visibly disagree.
- All existing frontend tests must stay green; every task adds coverage, never removes it.
- No automated test can verify actual 3D visual correctness (angles, alignment, no z-fighting) — each task that touches geometry ends with a live-browser verification step, per this project's established pattern.

---

## File Structure

- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor` — add 4 new face `<span>`s (back, pages, top, bottom) and their decorative children (headband ×2, spine-bands, gilt-frame, ribbon), add spine-author.
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs` — rebase `RestRotation`.
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` — replace `.shelf-book-spine`/`.shelf-book-cover` geometry, add the 4 new faces' geometry, extend the palette/tint selector lists to include the new back face, add headband/spine-bands/gilt-frame/ribbon rules, rebase the reduced-motion/no-JS fallback rotation angle, remove the now-superseded cover width/left hover hack and the old `::after` page-edge strip.
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js` — rebase `REVEALED_ROTATE_Y_DEG`.
- Modify: `tests/frontend/ShelfBookTests.cs` — update the rotator-children-count/order test, add tests for the new faces and spine-author.
- Modify: `documentation/Roadmap.md` — plain-language entry once shipped.

---

## Task 1: True 6-face box geometry + rotation angle rebase

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs:41`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (the `.shelf-book-spine`/`.shelf-book-cover` block starting ~line 1378, the `.shelf-book-cover` transform block ~1459-1491, the `::after` page-strip ~1493-1530, the reveal-state resize rule ~1532-1553, the palette blocks ~1620-1655, the fallback reveal rule ~1657-1667)
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js:65`
- Test: `tests/frontend/ShelfBookTests.cs`

**Interfaces:**
- Consumes: existing `Book.Title`/`Book.Author` (already bound on the cover today), existing `--shelf-book-rest` CSS custom property mechanism, existing `--motion-spring-sync`/`--ease-standard` tokens.
- Produces: 6 sibling face elements under `.shelf-book-rotator`, in this exact order — `.shelf-book-spine`, `.shelf-book-cover`, `.shelf-book-back`, `.shelf-book-pages`, `.shelf-book-top`, `.shelf-book-bottom`. Later tasks (Task 2) add children *inside* these, not new siblings.

- [ ] **Step 1: Update the existing DOM-structure test to expect 6 ordered faces (TDD red)**

Replace `ShelfBook_SpineAndCover_AreWrappedInRotator` in `tests/frontend/ShelfBookTests.cs`:

```csharp
    [Fact]
    public void ShelfBook_AllSixFaces_AreDirectChildrenOfRotatorInOrder()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        // Direct-child assertions, not just "somewhere under" -- shelf-physics.js's
        // getRotator() uses a `:scope > .shelf-book-rotator` direct-child query, and
        // a future change that nested the rotator one level deeper would silently
        // break all rotation animation (getRotator() would return null everywhere)
        // without this test catching it.
        var anchor = cut.Find("a.shelf-book");
        var rotatorChildren = anchor.Children;
        Assert.Single(rotatorChildren);
        var rotator = rotatorChildren[0];
        Assert.Contains("shelf-book-rotator", rotator.ClassList);

        var faces = rotator.Children;
        Assert.Equal(6, faces.Length);
        Assert.Contains("shelf-book-spine", faces[0].ClassList);
        Assert.Contains("shelf-book-cover", faces[1].ClassList);
        Assert.Contains("shelf-book-back", faces[2].ClassList);
        Assert.Contains("shelf-book-pages", faces[3].ClassList);
        Assert.Contains("shelf-book-top", faces[4].ClassList);
        Assert.Contains("shelf-book-bottom", faces[5].ClassList);
    }
```

- [ ] **Step 2: Run the test suite to verify it fails**

Run: `dotnet test tests/frontend --filter ShelfBook_AllSixFaces_AreDirectChildrenOfRotatorInOrder`
Expected: FAIL — `.shelf-book-back` etc. don't exist yet (only 2 faces currently render).

- [ ] **Step 3: Add the 4 new face elements in `ShelfBook.razor`**

Find the existing markup (the `<span class="shelf-book-rotator">...</span>` block containing `.shelf-book-spine` and `.shelf-book-cover`). Add the 4 new faces as siblings, immediately after the existing `.shelf-book-cover` closing tag and before `</span>` (the rotator's own close):

```razor
        <span class="shelf-book-back @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle" aria-hidden="true"></span>
        <span class="shelf-book-pages" aria-hidden="true"></span>
        <span class="shelf-book-top" aria-hidden="true"></span>
        <span class="shelf-book-bottom" aria-hidden="true"></span>
```

`.shelf-book-back` reuses the exact same tint class/style pattern as spine/cover (it's leather, same material). `.shelf-book-pages`/`-top`/`-bottom` are the paper page-block — no tint, no leather texture.

- [ ] **Step 4: Rewrite the face geometry in `app.css`**

Replace the shared face rule (currently `.shelf-book-spine, .shelf-book-cover { ... }`) to include all 6 faces, and give each its own transform. Replace the block from the `.shelf-book-spine, .shelf-book-cover { position: absolute; ... }` rule through the end of the old `.shelf-book-cover` transform/hover-resize rules and the old `::after` page-strip with:

```css
.shelf-book-spine,
.shelf-book-cover,
.shelf-book-back,
.shelf-book-pages,
.shelf-book-top,
.shelf-book-bottom {
    position: absolute;
    border-radius: 0.15rem;
    backface-visibility: hidden;
    box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    transition: box-shadow var(--motion-spring-sync) var(--ease-standard);
}

/* Per-face footprint -- deliberately NOT a shared `inset: 0`. .shelf-book
   itself (and .shelf-book-rotator, inset: 0 within it) is only T=3.25rem
   wide, matching the spine/pages faces' own size, but the cover/back
   faces are the wider W=6.3rem dimension and the top/bottom faces are
   W wide x T tall -- a real box's faces are not all the same size. Each
   group's `left`/`top` centers it on the SAME box center as the others
   (cover/back's own center, at local x=3.15rem, is where spine/pages'
   translateZ and top/bottom's rotation both pivot from), which is what
   makes the translateZ formula below share edges exactly instead of
   leaving a gap or overlap. This replaces the old code's shared
   `inset: 0` + a hover-only width/left resize on `.shelf-book-cover`
   alone -- with true per-face sizing, no element needs to resize on
   reveal; rotation's own perspective foreshortening does that instead. */
.shelf-book-cover,
.shelf-book-back {
    left: 0;
    top: 0;
    width: 6.3rem;
    height: 9.5rem;
}

.shelf-book-spine,
.shelf-book-pages {
    /* (6.3rem - 3.25rem) / 2 -- centers this narrower face on the wider
       cover/back faces' own center. */
    left: 1.525rem;
    top: 0;
    width: 3.25rem;
    height: 9.5rem;
}

.shelf-book-top,
.shelf-book-bottom {
    left: 0;
    width: 6.3rem;
    height: 3.25rem;
}

.shelf-book-top { top: 0; }
.shelf-book-bottom { bottom: 0; }

.shelf-book:hover .shelf-book-spine,
.shelf-book:hover .shelf-book-cover,
.shelf-book:hover .shelf-book-back,
.shelf-book:hover .shelf-book-pages,
.shelf-book:hover .shelf-book-top,
.shelf-book:hover .shelf-book-bottom,
.shelf-book:focus-visible .shelf-book-spine,
.shelf-book:focus-visible .shelf-book-cover,
.shelf-book:focus-visible .shelf-book-back,
.shelf-book:focus-visible .shelf-book-pages,
.shelf-book:focus-visible .shelf-book-top,
.shelf-book:focus-visible .shelf-book-bottom,
.shelf-book:has(:focus-visible) .shelf-book-spine,
.shelf-book:has(:focus-visible) .shelf-book-cover,
.shelf-book:has(:focus-visible) .shelf-book-back,
.shelf-book:has(:focus-visible) .shelf-book-pages,
.shelf-book:has(:focus-visible) .shelf-book-top,
.shelf-book:has(:focus-visible) .shelf-book-bottom,
.shelf-book.is-revealed .shelf-book-spine,
.shelf-book.is-revealed .shelf-book-cover,
.shelf-book.is-revealed .shelf-book-back,
.shelf-book.is-revealed .shelf-book-pages,
.shelf-book.is-revealed .shelf-book-top,
.shelf-book.is-revealed .shelf-book-bottom {
    box-shadow: 4px 10px 18px rgba(0, 0, 0, 0.55);
}

/* True box geometry: each face's translateZ is half of the dimension it
   does NOT span -- the standard CSS-cube formula. T (thickness) =
   3.25rem = .shelf-book's own width (unchanged, the spine's on-screen
   size at rest); W (cover width) = 6.3rem (unchanged, the app's
   established 2:3-ish cover shape); H = 9.5rem (unchanged). Verified
   live in a browser (color-coded debug faces swept -180deg..180deg,
   then the real textured faces) before being written here -- a prior
   attempt at a 3rd face (PR #447) hit apparent z-fighting because the
   old geometry hinged the cover off the spine's edge instead of
   sharing a true box center, so faces slightly interpenetrated at the
   seam; this formula shares edges exactly, with zero overlap. */
.shelf-book-cover {
    transform: translateZ(1.625rem);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 0.5rem;
    gap: 0.15rem;
    color: var(--color-text-on-dark);
    /* Same reasoning as the pre-existing pointer-events guard this
       replaces: modern browsers generally hit-test a 3D-transformed
       element at its rendered (projected) position, but this project
       found live that an edge-on preserve-3d face can still register
       clicks against its untransformed layout box -- keep the same
       guard rather than re-litigating that quirk. */
    pointer-events: none;
}

.shelf-book:hover .shelf-book-cover,
.shelf-book:focus-visible .shelf-book-cover,
.shelf-book:has(:focus-visible) .shelf-book-cover,
.shelf-book.is-revealed .shelf-book-cover {
    pointer-events: auto;
}

.shelf-book-back {
    transform: rotateY(180deg) translateZ(1.625rem);
}

.shelf-book-pages,
.shelf-book-top,
.shelf-book-bottom {
    background:
        radial-gradient(ellipse 70% 55% at 50% 50%, rgba(255, 255, 255, 0.3), transparent 70%),
        repeating-linear-gradient(to bottom, #f2e9d6 0, #f2e9d6 1.5px, #e3d5b3 1.5px, #e3d5b3 2.3px, #f0e6d0 2.3px, #f0e6d0 3.6px, #ddcda3 3.6px, #ddcda3 4px),
        linear-gradient(160deg, #eadfc4, #d8c69a);
    box-shadow:
        inset 0 0.6rem 0.6rem -0.4rem rgba(0, 0, 0, 0.35),
        inset 0 -0.6rem 0.6rem -0.4rem rgba(0, 0, 0, 0.35),
        1px 2px 4px rgba(0, 0, 0, 0.4);
    pointer-events: none;
}

.shelf-book-pages {
    transform: rotateY(-90deg) translateZ(3.15rem);
}

/* translateZ(-1.625rem) is listed LEFT of rotateX -- a translate to the
   left of a rotation in a CSS transform list applies in the parent/
   world frame, AFTER the rotation, not along the rotated face's own
   local axis. Without it (an earlier version of this plan omitted it,
   relying only on transform-origin), hand-tracing the transformed
   corners shows the face lands at z in [0, +3.25rem] instead of the
   box's actual z in [-1.625rem, +1.625rem] (the range every other face
   shares) -- a full T/2 offset toward the viewer, so the box doesn't
   actually close. With this translateZ, the corners land at exactly
   z = -1.625rem and z = +1.625rem, matching cover/back's plane
   positions. Re-derive by hand (or re-verify live) if this ever moves
   again -- this is exactly the class of bug a live "looks fine" check
   can miss (the top/bottom faces are barely visible from a level
   camera angle regardless of whether this offset is correct), caught
   only by tracing the actual transformed coordinates. */
.shelf-book-top {
    transform-origin: top center;
    transform: translateZ(-1.625rem) rotateX(90deg);
}

.shelf-book-bottom {
    transform-origin: bottom center;
    transform: translateZ(-1.625rem) rotateX(-90deg);
}
```

Note: `.shelf-book-spine`'s own rule (`writing-mode: vertical-rl`, `isolation: isolate`, its `rotateY(90deg) translateZ(3.15rem)`... — it does **not** currently carry its own `transform`, since at rotation 0 it was already the visible face in the old geometry) now needs an explicit transform too, since in the new geometry the rotator itself supplies the rest/reveal angle and every face needs its own fixed offset. Add to the existing `.shelf-book-spine` rule:

```css
.shelf-book-spine {
    transform: rotateY(90deg) translateZ(3.15rem);
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-rl;
    isolation: isolate;
}
```

- [ ] **Step 5: Extend the leather-grain overlay to the back face**

Find `.shelf-book-spine::before, .shelf-book-cover::before { ... background-image: url("../images/library/book-leather-texture.webp"); ... }` and extend the selector to `.shelf-book-back::before` too (same leather material).

- [ ] **Step 6: Extend the palette and cover-tint rules to the back face**

Find the 5 `.shelf-book-palette-N .shelf-book-spine, .shelf-book-palette-N .shelf-book-cover { background: ... }` rules (~line 1620) and add `.shelf-book-palette-N .shelf-book-back` to each selector list. Find `.shelf-book .shelf-book-spine.has-cover-tint, .shelf-book .shelf-book-cover.has-cover-tint { ... }` (~line 1650) and add `.shelf-book .shelf-book-back.has-cover-tint` to its selector list too.

- [ ] **Step 7: Rebase the rotation angle constants**

`ShelfBook.razor.cs:41`, change:
```csharp
private double RestRotation => -9.5 - (Book.Id % 7) * 0.47;
```
to:
```csharp
private double RestRotation => -90 - (Book.Id % 7) * 0.47;
```

`shelf-physics.js:65`, change:
```js
const REVEALED_ROTATE_Y_DEG = -88;
```
to:
```js
const REVEALED_ROTATE_Y_DEG = -4;
```

`app.css`'s fallback rule (~line 1663-1667), change:
```css
.shelf-book:hover .shelf-book-rotator,
.shelf-book:focus-visible .shelf-book-rotator,
.shelf-book:has(:focus-visible) .shelf-book-rotator {
    transform: rotateY(-88deg);
}
```
to:
```css
.shelf-book:hover .shelf-book-rotator,
.shelf-book:focus-visible .shelf-book-rotator,
.shelf-book:has(:focus-visible) .shelf-book-rotator {
    transform: rotateY(-4deg);
}
```

- [ ] **Step 8: Add a numeric-range test for the rebased rest angle**

Add to `tests/frontend/ShelfBookTests.cs`:

```csharp
    [Theory]
    [InlineData(1)]
    [InlineData(7)]
    [InlineData(13)]
    public void ShelfBook_RestRotation_IsWithinPureSpineBand(int bookId)
    {
        // -90deg is where the spine face (now rotateY(90deg) locally)
        // faces the camera dead-on with zero cover-edge visible -- the
        // whole point of this rebase (see the design spec's "Rotation
        // angle convention" section). The jitter band must stay small
        // enough that no book's rest angle drifts far enough from -90
        // to show a visible cover sliver at rest.
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, new Book { Id = bookId, Title = "Test" }));

        var style = cut.Find("a.shelf-book").GetAttribute("style") ?? "";
        var match = System.Text.RegularExpressions.Regex.Match(style, @"--shelf-book-rest:\s*(-?[\d.]+)deg");
        Assert.True(match.Success, $"style did not contain --shelf-book-rest: {style}");
        var restDeg = double.Parse(match.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);

        Assert.InRange(restDeg, -93, -90);
    }
```

- [ ] **Step 9: Run the full frontend test suite**

Run: `dotnet test tests/frontend`
Expected: PASS — all existing tests green, including the new/updated ones from Steps 1 and 8.

- [ ] **Step 10: Live-verify in a browser**

Run the app locally (`dotnet run --urls http://localhost:5289` in `frontend/LuminaChronica.Client`, per this project's local-dev setup). Open the Library shelf. Confirm:
- At rest, only the spine is visible — no cover sliver peeking out (this was the specific bug the angle rebase fixes; a book that still shows a cover edge at rest means the rebase or the `.shelf-book-spine` transform is wrong).
- Hovering/focusing a book reveals the cover smoothly with no visible seam or double-painted face at any point during the reveal.
- Slowly move the mouse to catch a few intermediate angles (or use devtools to pause the transition) — confirm no face ever paints on top of another (the z-fighting failure mode PR #447 hit).
- Touch two-tap (or devtools device emulation) still works: first tap reveals, second tap navigates.

- [ ] **Step 11: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs frontend/LuminaChronica.Client/wwwroot/Styles/app.css frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js tests/frontend/ShelfBookTests.cs
git commit -m "feat: true 6-face box geometry for shelf book (fixes T-shape)"
```

---

## Task 1 Addendum: reverse the hover-reveal spin direction

User feedback after living with Task 1's live build: the book currently spins the wrong way on reveal ("dreht sich gerade nach rechts, sollte aber nach links drehen"). This is a pure left-right mirror of the rotation, not a geometry defect — the box itself (faces, sizing, Z-offsets) is unaffected and stays exactly as Task 1 shipped it.

**Why this flips the spin direction**: the rotator sweeps from its rest angle to its revealed angle along the *shortest* path, and that path's direction (increasing vs decreasing `rotateY`) is fixed once you know which local rotation the spine face carries. Mirroring which physical side the spine occupies (swap its local `rotateY(90deg)` for `rotateY(-90deg)`, and swap pages' the other way) changes that shortest path from increasing to decreasing `rotateY`, without changing which face is visible at rest or on reveal.

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (the `.shelf-book-spine`/`.shelf-book-pages` transform rules, and the reduced-motion/no-JS fallback rule)
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs:41`
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js:65`

- [ ] **Step 1: Mirror the spine/pages local rotation in `app.css`**

Change:
```css
.shelf-book-spine {
    transform: rotateY(90deg) translateZ(3.15rem);
```
to:
```css
.shelf-book-spine {
    transform: rotateY(-90deg) translateZ(3.15rem);
```

And change:
```css
.shelf-book-pages {
    transform: rotateY(-90deg) translateZ(3.15rem);
}
```
to:
```css
.shelf-book-pages {
    transform: rotateY(90deg) translateZ(3.15rem);
}
```

- [ ] **Step 2: Flip the rest/reveal angle signs to match**

`ShelfBook.razor.cs:41`, change:
```csharp
private double RestRotation => -90 - (Book.Id % 7) * 0.47;
```
to:
```csharp
private double RestRotation => 90 + (Book.Id % 7) * 0.47;
```

`shelf-physics.js:65`, change:
```js
const REVEALED_ROTATE_Y_DEG = -4;
```
to:
```js
const REVEALED_ROTATE_Y_DEG = 4;
```

`app.css`'s reduced-motion/no-JS fallback rule, change:
```css
.shelf-book:hover .shelf-book-rotator,
.shelf-book:focus-visible .shelf-book-rotator,
.shelf-book:has(:focus-visible) .shelf-book-rotator {
    transform: rotateY(-4deg);
}
```
to:
```css
.shelf-book:hover .shelf-book-rotator,
.shelf-book:focus-visible .shelf-book-rotator,
.shelf-book:has(:focus-visible) .shelf-book-rotator {
    transform: rotateY(4deg);
}
```

- [ ] **Step 3: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: PASS, 380/380 (this is a pure sign flip — no test asserts on rotation direction, only on the numeric magnitude of `RestRotation`'s band via `ShelfBook_RestRotation_IsWithinPureSpineBand`, which asserts `InRange(restDeg, -93, -90)`. That assertion is now WRONG for the mirrored positive-angle convention and must be updated to `InRange(restDeg, 90, 93)` in the same step — update it before running, not after seeing it fail for the wrong reason).

- [ ] **Step 4: Live-verify in a browser**

Confirm: the book still shows spine-only at rest and reveals the cover on hover (unchanged from Task 1) — only the *direction* of the sweep should visibly differ. Compare against the pre-fix behavior if possible (e.g. a quick before/after) to confirm the spin genuinely reversed rather than staying the same.

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js tests/frontend/ShelfBookTests.cs
git commit -m "fix: reverse shelf book hover-reveal spin direction"
```

---

## Task 2: Hardcover binding details (headband, spine bands, gilt frame, ribbon, spine author)

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`
- Test: `tests/frontend/ShelfBookTests.cs`

**Interfaces:**
- Consumes: the 6 faces produced by Task 1 (`.shelf-book-spine`, `.shelf-book-cover`).
- Produces: nothing new consumed by later tasks — this is a leaf/decoration task.

- [ ] **Step 1: Write the failing tests for spine author + the 4 new decorative elements**

Add to `tests/frontend/ShelfBookTests.cs`:

```csharp
    [Fact]
    public void ShelfBook_WithAuthor_RendersSpineAuthor()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("J.R.R. Tolkien", cut.Find(".shelf-book-spine-author").TextContent);
        Assert.Equal("true", cut.Find(".shelf-book-spine-author").GetAttribute("aria-hidden"));
    }

    [Fact]
    public void ShelfBook_NoAuthor_DoesNotRenderSpineAuthor()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, new Book { Id = 2, Title = "Anonymous Work" }));

        Assert.Empty(cut.FindAll(".shelf-book-spine-author"));
    }

    [Fact]
    public void ShelfBook_RendersHeadbandAndSpineBandsOnSpine()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        var spine = cut.Find(".shelf-book-spine");
        Assert.NotEmpty(spine.QuerySelectorAll(".shelf-book-headband"));
        Assert.Equal(2, spine.QuerySelectorAll(".shelf-book-headband").Length);
        Assert.NotNull(spine.QuerySelector(".shelf-book-spine-bands"));
    }

    [Fact]
    public void ShelfBook_RendersGiltFrameOnCover()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.NotNull(cut.Find(".shelf-book-cover").QuerySelector(".shelf-book-gilt-frame"));
    }

    [Fact]
    public void ShelfBook_RendersRibbonOnPagesFace()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.NotNull(cut.Find(".shelf-book-pages").QuerySelector(".shelf-book-ribbon"));
    }
```

- [ ] **Step 2: Run the test suite to verify these fail**

Run: `dotnet test tests/frontend --filter "ShelfBook_WithAuthor_RendersSpineAuthor|ShelfBook_NoAuthor_DoesNotRenderSpineAuthor|ShelfBook_RendersHeadbandAndSpineBandsOnSpine|ShelfBook_RendersGiltFrameOnCover|ShelfBook_RendersRibbonOnPagesFace"`
Expected: FAIL — none of these elements exist yet.

- [ ] **Step 3: Add the decorative markup in `ShelfBook.razor`**

Inside `.shelf-book-spine` (alongside the existing `.shelf-book-spine-title` span), add:

```razor
            <span class="shelf-book-spine-bands" aria-hidden="true"></span>
            <span class="shelf-book-spine-title" aria-hidden="true">@Book.Title</span>
            @if (!string.IsNullOrWhiteSpace(Book.Author))
            {
                <span class="shelf-book-spine-author" aria-hidden="true">@Book.Author</span>
            }
            <span class="shelf-book-headband shelf-book-headband-top" aria-hidden="true"></span>
            <span class="shelf-book-headband shelf-book-headband-bottom" aria-hidden="true"></span>
```

(This replaces the existing single `<span class="shelf-book-spine-title" ...>` line — keep it, just add the siblings around it as shown.)

Inside `.shelf-book-cover`, add the gilt frame as the *first* child (so it paints above the leather background but the real cover image/title, added later in the existing markup, still paints above it correctly per existing stacking order):

```razor
            <span class="shelf-book-gilt-frame" aria-hidden="true"></span>
```

Inside `.shelf-book-pages` (currently empty, added in Task 1), add:

```razor
        <span class="shelf-book-pages" aria-hidden="true">
            <span class="shelf-book-ribbon" aria-hidden="true"></span>
        </span>
```

(This replaces the empty `<span class="shelf-book-pages" aria-hidden="true"></span>` from Task 1 Step 3.)

- [ ] **Step 4: Add the CSS for all 5 new elements**

Add to `app.css`, near the other `.shelf-book-*` rules:

```css
/* Kapitalband: the small woven two-tone band at the top and bottom of a
   hardcover spine, where the page block meets the binding. Fixed red/
   gold regardless of theme -- this is the book's own physical
   decoration, not app UI chrome, so it doesn't participate in the
   palette/theme system the way the leather color does. */
.shelf-book-headband {
    position: absolute;
    left: 0;
    right: 0;
    height: 0.22rem;
    background: repeating-linear-gradient(45deg, #7a1f1f 0, #7a1f1f 2px, var(--color-gold-accent) 2px, var(--color-gold-accent) 4px);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
    z-index: 2;
}
.shelf-book-headband-top { top: 0; border-radius: 0.15rem 0.15rem 0 0; }
.shelf-book-headband-bottom { bottom: 0; border-radius: 0 0 0.15rem 0.15rem; }

/* Erhabene Buende: 4 evenly-spaced raised ridges across the spine --
   the cords-under-leather look of a fine binding. One
   repeating-linear-gradient layer, no extra DOM nodes needed for the
   ridges themselves (the wrapping span exists only to position it
   between the headbands). */
.shelf-book-spine-bands {
    position: absolute;
    left: 0;
    right: 0;
    top: 0.5rem;
    bottom: 0.5rem;
    background: repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent calc(20% - 5px),
        rgba(0, 0, 0, 0.35) calc(20% - 5px),
        rgba(0, 0, 0, 0.45) calc(20% - 2px),
        rgba(255, 220, 150, 0.25) calc(20% - 2px),
        rgba(255, 220, 150, 0.3) 20%,
        transparent 20%
    );
    pointer-events: none;
    z-index: 1;
}

.shelf-book-spine-author {
    writing-mode: vertical-rl;
    color: var(--color-accent-text);
    font-size: 0.42rem;
    font-style: italic;
    position: relative;
    z-index: 2;
}

/* Gold double-rule frame, inset from the board edge -- classic
   fine-binding decoration. Two concentric borders with a hairline gap,
   drawn via one element's border + outline so it needs no extra DOM
   nodes beyond itself. */
.shelf-book-gilt-frame {
    position: absolute;
    inset: 0.32rem;
    border: 1px solid color-mix(in srgb, var(--color-gold-accent) 55%, transparent);
    outline: 1px solid color-mix(in srgb, var(--color-gold-accent) 30%, transparent);
    outline-offset: 2px;
    pointer-events: none;
    z-index: 1;
}

/* Lesebaendchen: a thin ribbon bookmark on the fore-edge (pages) face,
   overhanging the bottom by a small V-notch -- deliberately subtle
   (verified live it should barely peek past the bottom edge, not read
   as a large tab). Positioned near the spine-side edge of this face,
   where a real ribbon would be bound in. */
.shelf-book-ribbon {
    position: absolute;
    left: 0.35rem;
    top: 0;
    width: 0.32rem;
    height: calc(100% + 0.5rem);
    background: linear-gradient(90deg, #7a1f1f, #a8342c 40%, #7a1f1f);
    clip-path: polygon(0 0, 100% 0, 100% 92%, 50% 100%, 0 92%);
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.4);
    z-index: 1;
}
```

- [ ] **Step 5: Update spine/cover title color to the gold accent token, and fix stacking so text/image stay above the new decorative overlays**

Caught by this task's own reviewer, hand-verified: `.shelf-book-spine-bands` (`z-index: 1`, added in Step 4) and `.shelf-book-gilt-frame` (`z-index: 1`, added in Step 4) will paint OVER any sibling that lacks an explicit `z-index` of its own — `position: relative` alone is not enough; per stacking-context rules a `z-index: auto` element paints below a sibling with a positive `z-index`, regardless of DOM order. `.shelf-book-spine-title`, `.shelf-book-cover-title`, `.shelf-book-cover-author`, and `.shelf-book-cover img` are all pre-existing elements with no explicit `z-index`, so all four are currently at risk of being visually obscured by the two new overlays added in this task.

Find `.shelf-book-spine-title { ... color: color-mix(in srgb, var(--color-text-on-dark) 85%, transparent); ... }` and add `position: relative; z-index: 2;` to it (the same pattern `.shelf-book-spine-author`, Step 4, already uses). Change its color to `var(--color-accent-text)` in the same edit.

Find `.shelf-book-cover-title, .shelf-book-cover-author { position: relative; ... }` and add `z-index: 2;` to that shared rule (it already has `position: relative`, just needed the explicit z-index). Change `.shelf-book-cover-title`'s color to `var(--color-accent-text)` in the same edit (it already has an inline `color: var(--color-accent-text)` override in some versions of this file — if so, this step is only the z-index addition).

Find `.shelf-book-cover img { position: absolute; inset: 0; ... }` and add `z-index: 1;` to it — this keeps the real cover photo level with (not below) the gilt frame's own `z-index: 1`, so they paint in DOM order relative to each other (the frame is declared as the cover's first child per Step 3, so with equal z-index the image, declared later in the markup, paints on top — correct, since a real cover photo should never be hidden behind a decorative frame border).

Embossed-gold lettering matches the gilt frame and spine bands added in this task, verified live to read as premium rather than gaudy against the leather backgrounds — but the stacking fix above must land first, or the text/image will render invisible or partially obscured regardless of color.

- [ ] **Step 6: Run the full frontend test suite**

Run: `dotnet test tests/frontend`
Expected: PASS.

- [ ] **Step 7: Live-verify in a browser**

Confirm: headband visible at spine top/bottom in both rest and revealed states; spine bands read as subtle ridges, not stripes competing with the title text; gilt frame reads as an elegant thin double-rule, not a heavy border; ribbon barely peeks past the bottom edge (a visually large/prominent ribbon is a regression — re-check the `height`/`clip-path` values against this task's CSS if so). Check both a light and dark theme (`classic-library`/`dark-library`) since `--color-gold-accent`/`--color-accent-text` differ per theme.

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/ShelfBookTests.cs
git commit -m "feat: hardcover binding details on shelf book (headband, spine bands, gilt frame, ribbon)"
```

---

## Task 2 Addendum: spine redesign (headband, ridges, author, title color)

User feedback after living with Task 2's live build:
1. The headband's diagonal red/gold stripe pattern reads as hazard/warning tape, not a woven textile band.
2. The raised spine-bands ridges "don't look good" — drop them entirely rather than refine them.
3. The spine looked flat/monotonous without a visible leather texture — the leather-grain `::before` overlay (already present from before this redesign) needs to actually be visible/effective on the spine.
4. Showing the author under the title on the spine was reconsidered — drop it, since the title reads better with the extra vertical room (the front cover, loaded from the real DB cover image, is already the primary place for full metadata).
5. The spine title's color (`var(--color-accent-text)`) had poor contrast against lighter-palette spines — compared live against two alternatives (a lighter cream, and gold with a dark outline) across light/mid/dark leather tones; cream won clearly (only option that stayed legible across all three).

All of this was iterated and confirmed in a live-rendered browser comparison before being written here (herringbone weave vs. the original diagonal stripe; cream vs. gold vs. gold+outline title color across three leather lightness levels) — not a from-scratch guess.

**Explicitly not in scope**: the 5-variant palette/tint color system (`.shelf-book-palette-0..4`, cover-derived tint) is unchanged — only the spine's decorative elements and title treatment change, not which leather color each book gets.

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`
- Modify: `tests/frontend/ShelfBookTests.cs`

- [ ] **Step 1: Update tests first (TDD)**

In `tests/frontend/ShelfBookTests.cs`, **delete** these two tests entirely (spine author is being removed):
```csharp
    [Fact]
    public void ShelfBook_WithAuthor_RendersSpineAuthor()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("J.R.R. Tolkien", cut.Find(".shelf-book-spine-author").TextContent);
        Assert.Equal("true", cut.Find(".shelf-book-spine-author").GetAttribute("aria-hidden"));
    }

    [Fact]
    public void ShelfBook_NoAuthor_DoesNotRenderSpineAuthor()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, new Book { Id = 2, Title = "Anonymous Work" }));

        Assert.Empty(cut.FindAll(".shelf-book-spine-author"));
    }
```

Replace `ShelfBook_RendersHeadbandAndSpineBandsOnSpine` (which asserted both headband and spine-bands) with a headband-only version, since spine-bands is being removed:
```csharp
    [Fact]
    public void ShelfBook_RendersHeadbandOnSpine()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        var spine = cut.Find(".shelf-book-spine");
        Assert.Equal(2, spine.QuerySelectorAll(".shelf-book-headband").Length);
        Assert.Empty(spine.QuerySelectorAll(".shelf-book-spine-bands"));
    }
```

- [ ] **Step 2: Run the test suite to verify the new/changed tests fail against the current code**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "ShelfBook_RendersHeadbandOnSpine"`
Expected: FAIL (`.shelf-book-spine-bands` still renders today, so `Assert.Empty` fails).

- [ ] **Step 3: Remove spine-bands and spine-author markup in `ShelfBook.razor`**

Find:
```razor
        <span class="shelf-book-spine @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle">
            <span class="shelf-book-spine-bands" aria-hidden="true"></span>
            <span class="shelf-book-spine-title" aria-hidden="true">@Book.Title</span>
            @if (!string.IsNullOrWhiteSpace(Book.Author))
            {
                <span class="shelf-book-spine-author" aria-hidden="true">@Book.Author</span>
            }
            <span class="shelf-book-headband shelf-book-headband-top" aria-hidden="true"></span>
            <span class="shelf-book-headband shelf-book-headband-bottom" aria-hidden="true"></span>
        </span>
```
Replace with:
```razor
        <span class="shelf-book-spine @(_spineTint is not null ? "has-cover-tint" : "")" style="@TintStyle">
            <span class="shelf-book-spine-title" aria-hidden="true">@Book.Title</span>
            <span class="shelf-book-headband shelf-book-headband-top" aria-hidden="true"></span>
            <span class="shelf-book-headband shelf-book-headband-bottom" aria-hidden="true"></span>
        </span>
```

- [ ] **Step 4: Rewrite the spine CSS in `app.css`**

Replace the `.shelf-book-spine` rule (currently `transform`/`display`/`align-items`/`justify-content`/`writing-mode`/`isolation`) — add fixed top/bottom padding so the title block has guaranteed clearance from the headbands instead of relying on pure centering:
```css
.shelf-book-spine {
    transform: rotateY(-90deg) translateZ(3.15rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 0;
    writing-mode: vertical-rl;
    isolation: isolate;
}
```

Replace `.shelf-book-spine-title` (color changes from the theme token to a fixed cream, and `max-height` accounts for the new padding instead of a flat percentage):
```css
.shelf-book-spine-title {
    position: relative;
    z-index: 2;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: #f0e0b8;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8), 0 0 6px rgba(0, 0, 0, 0.4);
    max-height: calc(100% - 1.1rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

Replace `.shelf-book-headband`'s `background` (herringbone weave instead of the diagonal-stripe pattern — two opposing fine zigzag layers over a solid red base, verified live to no longer read as hazard tape) and bump its height slightly:
```css
.shelf-book-headband {
    position: absolute;
    left: 0;
    right: 0;
    height: 0.26rem;
    background:
        repeating-linear-gradient(60deg, transparent 0, transparent 0.06rem, rgba(0, 0, 0, 0.35) 0.06rem, rgba(0, 0, 0, 0.35) 0.09rem, transparent 0.09rem, transparent 0.18rem),
        repeating-linear-gradient(-60deg, transparent 0, transparent 0.06rem, rgba(255, 255, 255, 0.18) 0.06rem, rgba(255, 255, 255, 0.18) 0.09rem, transparent 0.09rem, transparent 0.18rem),
        linear-gradient(90deg, #7a1f1f, #8f2a28 50%, #7a1f1f);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5), inset 0 -1px 1px rgba(255, 255, 255, 0.1);
    z-index: 2;
}
```
(`.shelf-book-headband-top`/`-bottom` positioning rules are unchanged.)

**Delete** the `.shelf-book-spine-bands` rule and its explanatory comment entirely, and **delete** the `.shelf-book-spine-author` rule entirely.

- [ ] **Step 5: Verify the leather-grain texture is actually visible**

`.shelf-book-spine::before` (pre-existing, from before this whole redesign) already applies `book-leather-texture.webp` at `opacity: 0.18`. Confirm this file exists at `frontend/LuminaChronica.Client/wwwroot/images/library/book-leather-texture.webp` and actually loads (check the Network tab / no 404) during Step 7's live check — the user's "looks flat" feedback may mean this asset isn't loading, not that the technique is wrong. If it's missing, that's a separate asset problem to flag back to the controller, not something to newly invent in this step.

- [ ] **Step 6: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: PASS, 378/378 (Task 2 ended at 380; this step deletes 2 spine-author tests and replaces 1 test 1-for-1 with a renamed version — net −2, not −1: 380 − 2 = 378).

- [ ] **Step 7: Live-verify in a browser**

Confirm: no more diagonal red/gold stripe (herringbone texture instead); no ridges on the spine; no author text on the spine (title only); title reads clearly in cream against at least two different palette colors (not just one); leather texture is actually visible (not flat); title has visible clearance from both headbands, not crowding them, for both a short and a long (truncated) title.

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/ShelfBookTests.cs
git commit -m "fix: spine redesign — herringbone headband, drop ridges/author, cream title"
```

---

## Task 1 Addendum 2: softer corners/shadows and a seam "hinge groove" between faces

User feedback after living with the spine redesign: the book looked good but "klobig" (clunky) — specifically the rounded corners felt sharp/heavy, the drop shadow felt hard-edged, and the seam where cover meets spine (and back meets spine) read as two flat panels butted together rather than a bound book's soft rounded hinge. Confirmed live via a side-by-side browser comparison (sharp vs. rounder corners/softer shadow; with vs. without a seam-groove shadow at 60° where the seam is clearly visible) before being written here. The rest-state (pure spine only, no rotation) is unaffected — this only changes shading/corner treatment, not geometry or angles.

**Explicitly not in scope**: box geometry (transforms, translateZ, rotateX/Y, all Task 1/Task 1 Addendum work) is untouched. `.shelf-book-pages`/`-top`/`-bottom` (the paper page-block faces) keep their existing bulge-shadow treatment unchanged — the "hinge groove" is a leather-cover effect, applied only to `.shelf-book-cover`, `.shelf-book-back`, `.shelf-book-spine`.

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js:68`

- [ ] **Step 1: Round the corners and soften the base/hover drop shadow**

Find the shared 6-face rule:
```css
.shelf-book-spine,
.shelf-book-cover,
.shelf-book-back,
.shelf-book-pages,
.shelf-book-top,
.shelf-book-bottom {
    position: absolute;
    border-radius: 0.15rem;
    backface-visibility: hidden;
    box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    transition: box-shadow var(--motion-spring-sync) var(--ease-standard);
}
```
Change `border-radius: 0.15rem;` to `border-radius: 0.22rem;` and `box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.4);` to `box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);` (same rule, just those two values).

Find the shared hover/focus/revealed rule (the long `.shelf-book:hover .shelf-book-spine, ...` selector list ending in `box-shadow: 4px 10px 18px rgba(0, 0, 0, 0.55);`) and change that box-shadow value to `2px 14px 28px -4px rgba(0, 0, 0, 0.5);` (larger blur, negative spread so it diffuses rather than growing a hard-edged block).

Find `.shelf-book-headband-top { top: 0; border-radius: 0.15rem 0.15rem 0 0; }` and `.shelf-book-headband-bottom { bottom: 0; border-radius: 0 0 0.15rem 0.15rem; }` and update both `0.15rem` values to `0.22rem`, matching the new face corner radius so the headband's own rounded ends still align with the spine's corners.

- [ ] **Step 2: Add the seam "hinge groove" shadow to the three leather faces**

A more specific CSS rule's `box-shadow` fully replaces the shared rule's `box-shadow` for that element — it does not layer on top. So each rule below repeats the shared rule's own outer drop-shadow as an explicit trailing layer, exactly matching the established pattern already used nearby in this file for `.shelf-book-pages, .shelf-book-top, .shelf-book-bottom` (which does the same thing: inset "shape" layers plus a trailing outer-shadow layer, in one `box-shadow` declaration). Because the outer shadow differs between rest and hover, each face below needs its inset layers repeated in BOTH its own rule and the shared hover-selector list's per-face override.

Find `.shelf-book-cover { transform: translateZ(1.625rem); ... pointer-events: none; }` and add (left edge — where the cover borders the spine, the book's real hinge — gets the stronger inset shadow; right edge — the fore-edge side, bordering the pages face — gets a weaker one; the third layer is the shared rule's own rest-state outer shadow from Step 1, repeated here since this more specific rule would otherwise drop it):
```css
    box-shadow:
        inset 0.28rem 0 0.35rem -0.15rem rgba(0, 0, 0, 0.5),
        inset -0.12rem 0 0.2rem -0.08rem rgba(0, 0, 0, 0.3),
        0 2px 5px rgba(0, 0, 0, 0.35);
```

Find `.shelf-book-back { transform: rotateY(180deg) translateZ(1.625rem); }` and give it the identical box-shadow value (the back cover has the same spine-hinge-on-left, fore-edge-on-right relationship as the front cover):
```css
    box-shadow:
        inset 0.28rem 0 0.35rem -0.15rem rgba(0, 0, 0, 0.5),
        inset -0.12rem 0 0.2rem -0.08rem rgba(0, 0, 0, 0.3),
        0 2px 5px rgba(0, 0, 0, 0.35);
```

Find `.shelf-book-spine { transform: rotateY(-90deg) translateZ(3.15rem); ... isolation: isolate; }` and add (spine borders a leather face on both its own left and right in this local coordinate frame, so both edges get a similar, symmetric treatment, unlike cover/back's asymmetric left-strong/right-weak; third layer is again the repeated rest-state outer shadow):
```css
    box-shadow:
        inset 0.2rem 0 0.3rem -0.12rem rgba(0, 0, 0, 0.5),
        inset -0.2rem 0 0.3rem -0.12rem rgba(0, 0, 0, 0.5),
        0 2px 5px rgba(0, 0, 0, 0.35);
```

Now find the shared hover/focus/revealed selector list from Step 1 (the one whose `box-shadow` you just changed to `2px 14px 28px -4px rgba(0, 0, 0, 0.5);`) — since `.shelf-book-cover`/`-back`/`-spine` now have their OWN `box-shadow` (more specific than the shared rule, so the shared hover rule's value no longer applies to them at all once matched by an equally-or-more-specific selector — but the shared hover selector list uses the SAME specificity class-selector form, so cascade ORDER decides, and since Step 1's shared hover rule appears BEFORE these per-element rules in the file, these per-element rules' box-shadow — with no `:hover` condition — would incorrectly apply even on hover, permanently freezing the inset seam shadows' companion outer-shadow at the REST value instead of growing on hover). Fix this by adding three new hover-state overrides for cover/back/spine specifically, placed AFTER the per-element rules above (so they win), keeping the same inset layers but swapping the third layer to the hover outer shadow:
```css
.shelf-book:hover .shelf-book-cover,
.shelf-book:focus-visible .shelf-book-cover,
.shelf-book:has(:focus-visible) .shelf-book-cover,
.shelf-book.is-revealed .shelf-book-cover,
.shelf-book:hover .shelf-book-back,
.shelf-book:focus-visible .shelf-book-back,
.shelf-book:has(:focus-visible) .shelf-book-back,
.shelf-book.is-revealed .shelf-book-back {
    box-shadow:
        inset 0.28rem 0 0.35rem -0.15rem rgba(0, 0, 0, 0.5),
        inset -0.12rem 0 0.2rem -0.08rem rgba(0, 0, 0, 0.3),
        2px 14px 28px -4px rgba(0, 0, 0, 0.5);
}

.shelf-book:hover .shelf-book-spine,
.shelf-book:focus-visible .shelf-book-spine,
.shelf-book:has(:focus-visible) .shelf-book-spine,
.shelf-book.is-revealed .shelf-book-spine {
    box-shadow:
        inset 0.2rem 0 0.3rem -0.12rem rgba(0, 0, 0, 0.5),
        inset -0.2rem 0 0.3rem -0.12rem rgba(0, 0, 0, 0.5),
        2px 14px 28px -4px rgba(0, 0, 0, 0.5);
}
```
Verify this reasoning live in Step 5 regardless — CSS cascade specificity/order edge cases like this are exactly the kind of thing worth confirming by eye, not just by re-reading the rule.

- [ ] **Step 3: Reduce the reveal scale (less of a "pop")**

`shelf-physics.js:68`, change:
```js
const REVEALED_SCALE = 1.08;
```
to:
```js
const REVEALED_SCALE = 1.05;
```

`app.css`'s reduced-motion/no-JS fallback rule, change `transform: translateY(-1.4rem) translateZ(3.6rem) scale(1.08);` to `transform: translateY(-1.4rem) translateZ(3.6rem) scale(1.05);`.

- [ ] **Step 4: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: PASS, 378/378 (no test asserts on box-shadow/border-radius/scale values — this whole step is visual-only, verified live in Step 5, not by the test suite).

- [ ] **Step 5: Live-verify in a browser**

Confirm: corners read as softly rounded, not sharp; the drop shadow underneath a revealed book looks diffuse rather than hard-edged; rotate a book to roughly a 45-60° angle (or inspect mid-transition) and confirm the seam between spine and cover (and spine and back) now shows a soft shadowed groove instead of a flat hard line; the reveal's scale-up feels like a gentle lift, not a pop; confirm the outer drop-shadow is still visible on cover/back/spine after Step 2's box-shadow addition (this is the specific risk called out in Step 2 — verify it wasn't accidentally dropped).

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/Styles/app.css frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js
git commit -m "fix: soften shelf book corners/shadows, add seam hinge-groove shading"
```

---

## Task 3: Roadmap entry and final whole-branch verification

**Files:**
- Modify: `documentation/Roadmap.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks — this is the closing task.

- [ ] **Step 1: Run the full frontend and backend test suites one more time**

Run: `dotnet test` (from repo root, or both `tests/frontend` and `tests/backend`/equivalent per this project's usual full-suite command)
Expected: PASS, no regressions anywhere (not just the files this plan touched).

- [ ] **Step 2: Final live spot-check across the whole shelf, not just one book**

Open the Library shelf with multiple books visible. Confirm: hovering one book doesn't visually affect unrelated books beyond the existing neighbor-parting effect; rapidly moving the mouse between adjacent books doesn't leave any book stuck mid-rotation or visibly glitched; keyboard Tab-navigation through several books shows the same reveal as hover; a touch-emulated two-tap still works on at least 2 different books in the row (not just the first one, in case index-dependent jitter from `RestRotation`'s `Book.Id % 7` interacts oddly with any book).

- [ ] **Step 3: Write the Roadmap entry**

Add to `documentation/Roadmap.md`, following the existing entries' style (bullet list of what shipped, an honest verification note):

```markdown
### Library Shelf: true 3D book geometry (complete)

- Replaced the shelf book's 2-face hinge construction (spine + cover only, which read as a flat "T" — user-reported regression after PR #447's fix attempt) with a true 6-face rigid box: cover, back, spine, fore-edge/pages, top-edge, bottom-edge, using the standard CSS-cube face formula. Caught and fixed two real geometry bugs during review (a per-face sizing bug, and a Z-axis offset on the top/bottom faces) before either shipped — both hand-verified against the box's own coordinate math, not just visually.
- Rebased the rest/reveal rotation angle convention (`RestRotation` in `ShelfBook.razor.cs`, `REVEALED_ROTATE_Y_DEG` in `shelf-physics.js`, and the matching CSS fallback rule) to match the new geometry — spring physics itself (`STIFFNESS`/`DAMPING`) unchanged. A follow-up user request then mirrored the whole rotation (swapped spine/pages' local rotation, flipped the angle signs) to reverse the hover-reveal's spin direction — same rest/reveal faces, opposite sweep.
- Added and then iterated on hardcover binding details based on live user feedback: a Kapitalband (headband — initially a diagonal stripe that read as hazard tape, replaced with a herringbone weave), a gilt double-rule frame on the cover, and a ribbon bookmark on the fore-edge stayed; raised spine-bands ridges and the spine author line were added then removed entirely (ridges looked bad, and dropping the author gives the title more room — the front cover, loaded from the real DB cover image, already carries full metadata). Spine title color changed from the theme's accent-text token to a fixed cream, confirmed live to stay legible across light/mid/dark leather tones (the theme token did not).
- Softened the whole book's material feel after "klobig" (clunky) feedback: slightly rounder corners, a more diffuse drop shadow (larger blur, negative spread instead of a hard offset), a gentler reveal scale (1.05 instead of 1.08), and a new inset "hinge groove" shadow at the seams between the leather faces (cover/back/spine) simulating a bound book's soft rounded joint instead of two flat panels meeting at a hard line.
- Removed the old cover width/left hover-resize hack and the flat `::after` page-edge decoration, both fully superseded by the real box faces — a net simplification, not just an addition.
- Page-block faces use a CSS gradient placeholder for now (not a real photographic texture) — see `docs/superpowers/specs/2026-09-18-shelf-book-3d-redesign-design.md`'s "Optional Future Asset" section for a ready-to-use generation prompt once the user wants to add one.
- Live-verified at every stage, including two real bugs caught only by hand-tracing the transform math (not by a visual "looks fine" check) — a pattern worth remembering, per this project's own established history of the same lesson recurring.
- Noted for a future phase, not part of this work: a user-adjustable shelf/book size control, in case the current size is too small to see comfortably (see project memory).
```

- [ ] **Step 4: Commit**

```bash
git add documentation/Roadmap.md
git commit -m "docs: Roadmap entry for shelf book 3D redesign"
```

---

## Final Whole-Branch Review Fix Wave

The final review (most capable model, independently re-derived the box geometry by hand rather than trusting task reviews) confirmed no Critical issues and that the geometry/rotation-convention/test-count work across all prior tasks is genuinely correct. It found two Important items and several Minor ones. This wave fixes all of them in one pass, per this project's own SDD process (one fix dispatch, one scoped re-review, no second wave).

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`
- Modify: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs`
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`
- Modify: `docs/superpowers/specs/2026-09-18-shelf-book-3d-redesign-design.md`
- Modify: `documentation/Roadmap.md`

- [ ] **Step 1 (Important — user decided): make the ribbon bookmark actually visible**

The reviewer found the ribbon can never render: `.shelf-book-pages`' `overflow: hidden` clips its overhang, AND `.shelf-book-pages` (`rotateY(90deg)` local rotation) is back-facing at every angle the rest(90°)→reveal(4°) sweep ever reaches (its normal is 94°-182.8° from the camera throughout, never within 90°). The user chose to make it visible rather than drop the claim. The fix: move the ribbon onto `.shelf-book-cover` instead — the face that's actually visible on reveal — positioned near its spine-side (left) edge, sized to fit fully within the cover's own height (no overhang, so `overflow: hidden` can no longer clip it).

In `ShelfBook.razor`, remove the ribbon from inside `.shelf-book-pages`:
```razor
        <span class="shelf-book-pages" aria-hidden="true">
            <span class="shelf-book-ribbon" aria-hidden="true"></span>
        </span>
```
becomes:
```razor
        <span class="shelf-book-pages" aria-hidden="true"></span>
```

Add it inside `.shelf-book-cover` instead, as the first child (before the gilt-frame span, so the frame's own border still paints above it if they ever overlap — same reasoning as gilt-frame's own placement):
```razor
            <span class="shelf-book-ribbon" aria-hidden="true"></span>
            <span class="shelf-book-gilt-frame" aria-hidden="true"></span>
```

In `app.css`, replace the `.shelf-book-ribbon` rule:
```css
.shelf-book-ribbon {
    position: absolute;
    left: 0.35rem;
    top: 0;
    width: 0.32rem;
    height: calc(100% + 0.5rem);
    background: linear-gradient(90deg, #7a1f1f, #a8342c 40%, #7a1f1f);
    clip-path: polygon(0 0, 100% 0, 100% 92%, 50% 100%, 0 92%);
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.4);
    z-index: 1;
}
```
with:
```css
/* Lesebaendchen: a thin ribbon bookmark, drawn on the COVER face (not
   the fore-edge/pages face -- pages is back-facing at every angle this
   book's rest(90deg)-to-reveal(4deg) sweep reaches, so anything drawn
   there is structurally invisible; caught by the final whole-branch
   review, not by any live check, since nobody had reason to rotate the
   book past where the interaction ever takes it). Positioned near the
   cover's spine-side (left) edge, where a real ribbon bound into the
   spine would drape down over the front cover. Sized to fit within the
   cover's own height (no overhang past 100%) so the shared face rule's
   `overflow: hidden` can't clip it -- trades a small amount of realism
   (a real ribbon usually pokes out past the book's bottom edge) for
   something that unconditionally renders. */
.shelf-book-ribbon {
    position: absolute;
    left: 0.4rem;
    top: 0.3rem;
    width: 0.28rem;
    height: 88%;
    background: linear-gradient(90deg, #7a1f1f, #a8342c 40%, #7a1f1f);
    clip-path: polygon(0 0, 100% 0, 100% 92%, 50% 100%, 0 92%);
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.4);
    z-index: 1;
}
```

- [ ] **Step 2 (Important): revise the design spec to match what actually shipped**

`docs/superpowers/specs/2026-09-18-shelf-book-3d-redesign-design.md` was written before the rotation-direction mirror-flip and the spine redesign addenda, and was never updated — it now asserts things that are no longer true (inverted rotation signs, ridges/spine-author as shipped when both were removed), while its own geometry table caption claims "this table is what production actually implements." Add a new section at the end of the spec (after the existing "Global Constraints" section):

```markdown
## Revision (post-implementation)

This spec was written before several rounds of live user feedback changed the shipped result. The sections above are left as originally written (for historical context — see the plan's own addenda for exactly what changed and why), but the following are no longer accurate as descriptions of production:

- **Rotation sign convention is inverted from what's written above.** The Face geometry table's `.shelf-book-spine`/`.shelf-book-pages` rows, and the Rotation angle convention section's `RestRotation`/`REVEALED_ROTATE_Y_DEG`/CSS fallback values, all shipped with the opposite sign (rest ≈ +90° + jitter, revealed ≈ +4°, spine `rotateY(90deg)`, pages `rotateY(-90deg)`) after a user-requested reversal of the hover-reveal spin direction. See the plan's "Task 1 Addendum" for the actual shipped values and the reasoning.
- **Raised spine bands ("Erhabene Bünde") and the spine author line were both removed.** Live user feedback found the ridges didn't look good and the author line crowded the title; both were dropped entirely rather than refined. See the plan's "Task 2 Addendum" for what replaced them (a herringbone-weave headband with no ridges, title-only on the spine in a fixed cream color).
- **The ribbon bookmark moved from the fore-edge (`.shelf-book-pages`) face to the cover face.** The original placement was structurally invisible — the pages face never faces the camera at any angle this book's interaction reaches. See the plan's "Final Whole-Branch Review Fix Wave" section.
- Corners, shadows, and a seam "hinge groove" between the leather faces were softened/added after "klobig" (clunky) feedback — not covered by this spec at all, see the plan's "Task 1 Addendum 2".

The plan file (`docs/superpowers/plans/2026-09-18-shelf-book-3d-redesign.md`) is the authoritative record of what shipped; treat this spec as the original design rationale, not a live description of production.
```

- [ ] **Step 3 (Minor): protect the favorite button, borrowed badge, and progress bar from the cover image's z-index**

Task 2's fix gave `.shelf-book-cover-title`/`-cover-author` `z-index: 2` to stay above the cover image's `z-index: 1`, but missed three sibling overlays that need the same protection: `.shelf-book-favorite`, `.shelf-book-borrowed-badge`, `.shelf-book-progress`. These are all `position: relative` today with no explicit `z-index`, so a real cover image now paints above them — currently invisible only because the one call site (`ShelfRow.razor`) happens to pass `ShowFavorite="false"` and no `OwnerUsername`/`ProgressPercentage`, but `ShowFavorite` defaults to `true` on the component itself, so the next usage site would silently get an invisible, unclickable favorite star. Find each of `.shelf-book-favorite`, `.shelf-book-borrowed-badge`, `.shelf-book-progress` in `app.css` and add `z-index: 2;` to each (they already have `position: relative`).

- [ ] **Step 4 (Minor): fix the stale pre-softening shadow value on the paper faces**

Task 1 Addendum 2 softened the shared rest-state box-shadow from `1px 2px 4px rgba(0, 0, 0, 0.4)` to `0 2px 5px rgba(0, 0, 0, 0.35)` everywhere EXCEPT `.shelf-book-pages, .shelf-book-top, .shelf-book-bottom`'s own dedicated rule, which still ends in the old `1px 2px 4px rgba(0, 0, 0, 0.4)` value as its trailing outer-shadow layer (alongside its own unrelated page-bulge inset layers, which are correct and unchanged). Find that rule and update just the trailing layer to `0 2px 5px rgba(0, 0, 0, 0.35)`, keeping the two `inset` bulge layers above it exactly as they are.

- [ ] **Step 5 (Minor): fix stale comments**

In `ShelfBook.razor.cs`, find the tint-related comment that says the tint is "Deliberately scoped to the two face spans (`.shelf-book-spine`/`.shelf-book-cover`)" and update it to include `.shelf-book-back`, which carries the same `has-cover-tint`/`TintStyle` binding (added in Task 1). Find the equivalent comment block in `app.css` near `.has-cover-tint` and make the same correction.

In `shelf-physics.js`, find the `DAMPING` comment that references "the rotation reaching -93.8deg past a -88deg target" — `-88deg` was the old `REVEALED_ROTATE_Y_DEG` value before the Task 1 Addendum sign-flip and no longer appears anywhere in this file. Update the comment to note the investigation used the pre-mirror-flip convention (the actual finding — no real overshoot at this `DAMPING` value — is still accurate and doesn't need to change, just the stale angle numbers in the historical anecdote).

- [ ] **Step 5b (Minor): fix the ribbon's location claim in the already-committed Roadmap entry**

`documentation/Roadmap.md`'s "Library Shelf: true 3D book geometry" entry currently says "a ribbon bookmark on the fore-edge stayed" — written before Step 1 of this fix wave moved it to the cover (and before the final review discovered the fore-edge placement was never actually visible in the first place). Find that sentence and change "a ribbon bookmark on the fore-edge stayed" to "a ribbon bookmark (moved from the fore-edge to the cover face during final review — the fore-edge face is never actually camera-facing in this interaction, so anything placed there was invisible) stayed".

- [ ] **Step 6: run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: PASS, 378/378 (Step 1's markup move doesn't change which elements exist, just which face they're inside — no test asserts the ribbon's specific parent face by class name beyond `.shelf-book-cover` vs `.shelf-book-pages`; check `ShelfBook_RendersRibbonOnPagesFace` specifically, since its NAME and its query (`cut.Find(".shelf-book-pages").QuerySelector(".shelf-book-ribbon")`) both need updating to target `.shelf-book-cover` instead, or the test will now correctly fail — this is a required test update, not just a suite run).

- [ ] **Step 7: live-verify in a browser**

Confirm: the ribbon is now visible on the revealed cover, positioned near the spine-side edge, reading as a small tasteful ribbon rather than a large tab; the favorite button (if `ShowFavorite` is ever `true` at a real call site) still renders and is clickable; no visual regression on the pages/top/bottom paper faces (they're never visible anyway, so this is a formality, not something to spend time hunting for).

- [ ] **Step 8: commit**

```bash
git add frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor.cs frontend/LuminaChronica.Client/wwwroot/Styles/app.css frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js docs/superpowers/specs/2026-09-18-shelf-book-3d-redesign-design.md tests/frontend/ShelfBookTests.cs documentation/Roadmap.md
git commit -m "fix: address final whole-branch review findings (ribbon visibility, spec drift, z-index gaps, stale comments)"
```

---

## Post-Wave Follow-Up: ribbon removed entirely

After the fix wave above made the ribbon visible on the cover (and the controller live-verified it against a real uploaded cover image, confirming the z-index fix genuinely worked), the user looked at it live and said it "looks odd" and asked for it to be removed rather than kept. Removed: the `.shelf-book-ribbon` span from `ShelfBook.razor`'s cover face, the `.shelf-book-ribbon` rule from `app.css` (and the now-dangling "same tie-break bug found and fixed on .shelf-book-ribbon" cross-reference in the neighboring `.shelf-book-gilt-frame` comment), the `ShelfBook_RendersRibbonOnCoverFace` test, and the ribbon mentions in `documentation/Roadmap.md` and the design spec's revision note (both updated to describe the ribbon as added-then-removed, not shipped). Test suite: 377/377 (378 minus the one deleted test). No live-browser re-check needed beyond confirming the element is gone — its removal is the kind of change a screenshot can't get wrong.

---

## Self-Review Notes

- **Spec coverage**: 6-face geometry (Task 1), headband/spine-bands/gilt-frame/ribbon/spine-author (Task 2), rotation angle rebase (Task 1), removal of old cover-resize hack and old page-strip (Task 1), live-verification requirement (every task), Roadmap entry (Task 3), page-block texture explicitly deferred with a ready prompt (spec's own section, referenced in Task 3's Roadmap text) — all covered.
- **Type/name consistency checked**: face class names (`shelf-book-back`, `-pages`, `-top`, `-bottom`, `-headband`, `-spine-bands`, `-gilt-frame`, `-ribbon`, `-spine-author`) are used identically across the Razor steps, CSS steps, and test steps in both tasks.
- **DOM order**: Task 1's test asserts the exact 6-face order; Task 2 adds children *inside* those faces, never new siblings, so it cannot invalidate Task 1's ordering assertion.
