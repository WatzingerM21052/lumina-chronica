# Library Rework Phase 2: Physics-Based Motion & Touch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's plain CSS transition for the shelf-book reveal with a JS spring-physics animation (real "physical inertia," per the design spec), add dynamic neighbor-parting when a book is revealed, and add mobile two-tap touch support (first tap reveals the cover, second tap navigates) — none of which existed in Phase 1.

**Architecture:** One new JS module, `shelf-physics.js` (following the codebase's established one-file-per-feature convention — `motion.js`, `epubReader.js`, `pdfReader.js`, etc. all follow this pattern rather than one large shared file). Phase 1's CSS `.shelf-book:hover`/`:focus-visible` rule and its `transition` stay in the stylesheet unchanged as the progressive-enhancement fallback (same principle `motion.js`'s own doc comment states: "a blocked/failed module load leaves content in its normal ... state") — this module's JS-set inline `style.transform` simply takes over via inline-style specificity once active, and a small CSS class addition disables the now-redundant CSS transition only while JS is actively driving it.

**Tech Stack:** Vanilla JS (`requestAnimationFrame`, a semi-implicit-Euler spring integrator — no animation library dependency), Blazor `IJSRuntime` interop matching the existing `motion.js` usage pattern in `Statistics.razor`.

## Global Constraints

- **No new color tokens, no new CSS custom properties beyond what's already established** — this phase is almost entirely JS; the only CSS additions are a `transition: none` override class and a `pointer-events` extension for the new `.is-revealed` state, neither introduces a color.
- **Phase 1's CSS fallback must stay intact and correct.** Do not remove or weaken `.shelf-book:hover, .shelf-book:focus-visible, .shelf-book:has(:focus-visible) { transform: ...; }` (`app.css`) or its `transition` declaration — if this JS module fails to load (network failure, `prefers-reduced-motion`, etc.), Phase 1's CSS-only reveal must keep working exactly as it does today.
- **`prefers-reduced-motion: reduce` must skip this module's animation entirely** — when reduced motion is set, `initShelfPhysics`/`initShelfTouch` must no-op (return immediately without attaching any listeners), leaving Phase 1's CSS rule (which already has its own `transition: none` override for reduced motion) as the sole mechanism. Do not attempt to run the spring loop with a zero-duration spring — just don't start it.
- **The spring must not visibly bounce/oscillate, and must settle within roughly 300-500ms** (the spec's motion-duration guidance — not a hard fixed value, since spring physics has no single fixed duration, but the pull-out must *read* as being in that range, not near-instant and not sluggish). Tune `STIFFNESS`/`DAMPING` so the motion reads as a single smooth settle in that window, verified by live observation, not just by the numbers looking reasonable on paper. Task 1's starting values (`STIFFNESS = 210`, `DAMPING = 26`) target roughly a 300ms settle at ~0.9 damping ratio — a reasonable starting point, not a value to treat as final without live confirmation.
- **Neighbor-parting and touch handling must stay scoped per shelf row** (`.shelf-books`, one per `ShelfRow`) — a book revealed in one row must never part books in a different row.
- **The revealed-value constants in this module (`REVEALED_ROTATE_Y_DEG`/`REVEALED_TRANSLATE_Y_REM`/`REVEALED_TRANSLATE_Z_REM`/`REVEALED_SCALE`) must match Phase 1's CSS `.shelf-book:hover` rule's values exactly** (`translateY(-1.4rem) translateZ(3.6rem) rotateY(-88deg) scale(1.08)`, `app.css`) — if a future change touches one, it must touch the other, since the CSS rule is the fallback and the JS constants are the enhanced path; a mismatch would make the two diverge visibly depending on whether JS loaded. The `_rem` constants are converted to px at runtime from the real root font-size (see `getRevealedTranslatePx`), not a hardcoded 16, so the enhanced path stays correct even for a user with a non-default browser font-size setting.
- **No JS test infrastructure exists in this project** (confirmed: no `package.json`/test runner under `frontend/`, `motion.js` and every other `wwwroot/js/*.js` module has zero automated tests) — this phase follows the same established norm as every prior CSS-3D/motion feature this session: verified via live browser observation, not automated tests. Do not introduce a new JS testing framework as part of this plan — that would be unrelated scope creep.
- **`Library.razor` currently `@implements IDisposable`** (disposing only `_searchDebounceTimer`) — Task 4 converts this to `IAsyncDisposable`/`DisposeAsync`, matching `Statistics.razor`'s exact existing pattern for its own `motion.js` module reference (`_motionModule`, disposed with a `catch (JSDisconnectedException)`), while preserving the existing timer disposal.

---

### Task 1: Spring Core + Hover/Focus Reveal

**Files:**
- Create: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (one small addition: a `transition: none` override class)

**Interfaces:**
- Consumes: `.shelf-book` elements' `--shelf-book-rest` inline CSS custom property (set by `ShelfBook.razor.cs`'s `RestRotation`, unchanged from Phase 1) and the `.shelf-book-slot`/`.shelf-books` DOM structure from `ShelfRow.razor` (unchanged from Phase 1).
- Produces: `export function initShelfPhysics(root)` — call once per page with the shelf's outer container element; sets up delegated hover/focus listeners and the shared rAF loop. Also produces internal (non-exported, same-module) helpers `getOrCreateSpring`, `setRevealTarget`, `getRestDeg`, and the shared `active`/`springs`/`rafHandle` state that Task 2 (neighbor-parting) and Task 3 (touch) extend in the same file. Task 4 consumes `initShelfPhysics` via Blazor JS interop.

**Context**: read `frontend/LuminaChronica.Client/wwwroot/js/motion.js` yourself before starting — it establishes this codebase's conventions for a small, focused, reduced-motion-aware JS module (a top-of-file `prefersReducedMotion()` helper, one clearly-scoped `export function` per capability, inline comments explaining *why* a technique was chosen, not just what it does). Match that style.

The current Phase 1 CSS this task's JS takes over from (`app.css`, search for `.shelf-book:hover`):
```css
.shelf-book:hover,
.shelf-book:focus-visible,
.shelf-book:has(:focus-visible) {
    transform: translateY(-1.4rem) translateZ(3.6rem) rotateY(-88deg) scale(1.08);
}
```
This rule is **not modified by this task** — it stays as the fallback. This task's JS sets `style.transform` directly (inline styles beat class-selector rules in CSS specificity, so JS transparently overrides this rule while active, with no conflict).

- [ ] **Step 1: Create `shelf-physics.js`**

```javascript
// Spring-physics-driven pull-out animation for the Library's 3D bookshelf
// (Library Rework Phase 2). Replaces Phase 1's plain CSS transition with a
// JS-driven spring so the reveal has real "physical inertia" (see the
// design spec) rather than a fixed-duration ease curve. Progressive
// enhancement: Phase 1's CSS rule (.shelf-book:hover/:focus-visible
// transform, app.css) stays in the stylesheet as the resting fallback if
// this module fails to load or prefers-reduced-motion is set -- this
// module's inline styles simply take over (inline style specificity beats
// a class selector) once active.

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Semi-implicit Euler spring integrator. A single scalar 0 (resting) to 1
// (revealed) "progress" value per book -- every transform channel
// (rotate/translate/scale) is derived from this one spring via linear
// interpolation (see applyTransform below), rather than running four
// independent springs, so all four channels stay visually in lockstep
// instead of settling at different times.
const STIFFNESS = 210;
const DAMPING = 26; // close to critical damping for this stiffness -- a
                     // single smooth settle, not a visible bounce. Verify
                     // this live: if it overshoots and oscillates even
                     // slightly more than once, raise DAMPING; if it feels
                     // sluggish/dead, lower it slightly instead of raising
                     // STIFFNESS (which would shorten the settle time in a
                     // way that reads as less "physical", not more).
const EPSILON = 0.001;

function stepSpring(state, dt) {
    const displacement = state.target - state.value;
    const springForce = displacement * STIFFNESS;
    const dampingForce = -state.velocity * DAMPING;
    const acceleration = springForce + dampingForce;
    state.velocity += acceleration * dt;
    state.value += state.velocity * dt;
}

function isSettled(state) {
    return Math.abs(state.target - state.value) < EPSILON && Math.abs(state.velocity) < EPSILON;
}

// Must match Phase 1's `.shelf-book:hover, .shelf-book:focus-visible`
// CSS rule (app.css) exactly -- that rule is this module's fallback, and
// the two must never visibly diverge. The rem values here are converted
// to px lazily, once, using the REAL current root font-size (see
// getRevealedTranslatePx below) rather than a hardcoded 16 -- this app
// doesn't override the root font-size in its own stylesheet, but a
// user's browser-level accessibility font-size setting still changes it,
// and hardcoding 16 would silently disagree with Phase 1's CSS (which
// uses `rem` and therefore already scales correctly) for any such user.
const REVEALED_ROTATE_Y_DEG = -88;
const REVEALED_TRANSLATE_Y_REM = -1.4;
const REVEALED_TRANSLATE_Z_REM = 3.6;
const REVEALED_SCALE = 1.08;

// getComputedStyle forces a synchronous style/layout read -- cheap once,
// wasteful if called on every rAF frame for every active book. The root
// font-size in practice never changes during a page session (it's a
// browser-level accessibility setting, not something this app's own UI
// can alter live), so read it once, lazily, on first use, and reuse the
// cached px values from then on.
let _cachedRevealedTranslateY = null;
let _cachedRevealedTranslateZ = null;

function getRevealedTranslatePx() {
    if (_cachedRevealedTranslateY === null) {
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const px = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
        _cachedRevealedTranslateY = REVEALED_TRANSLATE_Y_REM * px;
        _cachedRevealedTranslateZ = REVEALED_TRANSLATE_Z_REM * px;
    }
    return { y: _cachedRevealedTranslateY, z: _cachedRevealedTranslateZ };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function getRestDeg(book) {
    const raw = book.style.getPropertyValue("--shelf-book-rest");
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function applyTransform(book, progress) {
    const restDeg = getRestDeg(book);
    const { y: revealedY, z: revealedZ } = getRevealedTranslatePx();
    const rotateY = lerp(restDeg, REVEALED_ROTATE_Y_DEG, progress);
    const translateY = lerp(0, revealedY, progress);
    const translateZ = lerp(0, revealedZ, progress);
    const scale = lerp(1, REVEALED_SCALE, progress);
    book.style.transform = `translateY(${translateY}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
}

// One spring-state object per book, keyed by element -- garbage collected
// automatically if Blazor removes the element (e.g. a filter change swaps
// which .shelf-book elements exist), no manual cleanup needed. `active`
// tracks which books currently need a rAF step; a settled book is removed
// from it so the loop does no work once everything has stopped moving.
const springs = new WeakMap();
const active = new Set();
let rafHandle = null;
let lastFrameTime = 0;

function getOrCreateSpring(book) {
    let state = springs.get(book);
    if (!state) {
        state = { value: 0, velocity: 0, target: 0 };
        springs.set(book, state);
    }
    return state;
}

function setRevealTarget(book, revealed) {
    const state = getOrCreateSpring(book);
    state.target = revealed ? 1 : 0;
    active.add(book);
    ensureLoopRunning();
}

function ensureLoopRunning() {
    if (rafHandle !== null) return;
    lastFrameTime = performance.now();
    rafHandle = requestAnimationFrame(tick);
}

function tick(now) {
    // Clamp a long gap (e.g. the tab was backgrounded) to a single
    // reasonable step instead of letting the spring "catch up" with one
    // huge jump.
    const dt = Math.min((now - lastFrameTime) / 1000, 1 / 30);
    lastFrameTime = now;

    for (const book of active) {
        const state = springs.get(book);
        if (!state) { active.delete(book); continue; }

        stepSpring(state, dt);

        if (isSettled(state)) {
            state.value = state.target;
            state.velocity = 0;
            applyTransform(book, state.value);
            if (state.value === 0) {
                // Fully back at rest -- clear the inline style so Phase 1's
                // CSS rule (transform: rotateY(var(--shelf-book-rest)))
                // owns it again, avoiding float-precision drift
                // accumulating across many reveal/unreveal cycles.
                book.style.removeProperty("transform");
            }
            active.delete(book);
        } else {
            applyTransform(book, state.value);
        }
    }

    rafHandle = active.size > 0 ? requestAnimationFrame(tick) : null;
}

// Delegated listeners on a stable ancestor (the whole shelf, not each book
// individually) survive Blazor re-rendering the book list (e.g. a filter
// change swaps which .shelf-book elements exist under `root`) without
// needing to re-attach anything -- events still reach `root` regardless of
// which specific books currently exist under it.
export function initShelfPhysics(root) {
    if (!root || prefersReducedMotion()) return;

    // Disables Phase 1's CSS `transition` on every .shelf-book under root
    // while this module is driving the transform every frame -- without
    // this, the CSS transition would try to further ease between each of
    // this module's own already-eased per-frame writes, compounding into
    // a sluggish double-smoothed motion instead of the intended spring feel.
    root.classList.add("shelf-physics-active");

    root.addEventListener("mouseenter", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (book && root.contains(book)) setRevealTarget(book, true);
    }, true); // capture: true -- mouseenter does not bubble, but a
              // capture-phase listener on an ancestor still receives it
              // during the capturing traversal, which is the standard
              // delegation technique for this event.

    root.addEventListener("mouseleave", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (book && root.contains(book)) setRevealTarget(book, false);
    }, true);

    root.addEventListener("focusin", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (book && root.contains(book)) setRevealTarget(book, true);
    });

    root.addEventListener("focusout", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        // Moving focus to a descendant (e.g. the favorite button) fires
        // focusout on the book itself -- only treat this as "focus left
        // the book" if the new focus target isn't still inside it. This is
        // this module's equivalent of Phase 1's CSS :has(:focus-visible)
        // rule, which drove the same "stay revealed while focus is on a
        // descendant" behavior for the CSS-only fallback.
        if (e.relatedTarget && book.contains(e.relatedTarget)) return;
        setRevealTarget(book, false);
    });
}
```

- [ ] **Step 2: Add the CSS transition-disable class**

Add to `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, near the existing `.shelf-book` rules (search for `.shelf-book {`):

```css
/* Added by shelf-physics.js (Phase 2) once it takes over the reveal
   animation -- disables the Phase 1 CSS transition so it doesn't try to
   further ease between this module's own already-eased per-frame writes
   to .shelf-book's inline transform. Only applied when the module
   actually initializes (skipped entirely under prefers-reduced-motion,
   in which case Phase 1's plain CSS transition -- itself already
   reduced-motion-aware -- remains the only mechanism). */
.shelf-physics-active .shelf-book {
    transition: none;
}
```

- [ ] **Step 3: Build**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success (this task adds a static JS asset and a CSS rule; no C# changes yet, so this mainly confirms nothing else broke).

- [ ] **Step 4: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all existing tests to still pass unchanged (no C#/Razor files touched by this task).

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Add shelf-physics.js: spring-driven hover/focus reveal for the Library shelf"
```

(Live-visual verification of this module happens once Task 4 wires it into `Library.razor` — there's nothing to observe yet with the module unused.)

---

### Task 2: Dynamic Neighbor-Parting

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js` (extend, don't replace, Task 1's code)

**Interfaces:**
- Consumes: Task 1's `springs`/`active`/`tick`/`ensureLoopRunning` internal state and the `.shelf-book-slot`/`.shelf-books` DOM structure (unchanged from Phase 1's `ShelfRow.razor`).
- Produces: neighbor-parting is wired into the same `mouseenter`/`mouseleave`/`focusin`/`focusout` handlers `initShelfPhysics` already sets up in Task 1 — no new exported function, no new public interface. Task 4 does not need to call anything additional for this to work.

**Context**: parting uses the identical spring mechanism as Task 1's reveal (same integrator, same rAF loop), just driving a different element (`.shelf-book-slot`) and a different CSS property (`translateX` instead of the book's own rotate/translate/scale stack) with its own small set of target constants.

- [ ] **Step 1: Add a second spring channel for slot parting**

In `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`, add (after the existing `springs`/`active` declarations from Task 1):

```javascript
// Second, independent spring channel: how far a .shelf-book-slot parts
// sideways (translateX, in px) when a nearby book in the same row is
// revealed. Distance-decaying -- an immediate neighbor moves more than a
// slot two away, and nothing moves at distance 3+.
const partSprings = new WeakMap();
const activeParts = new Set();

function getOrCreatePartSpring(slot) {
    let state = partSprings.get(slot);
    if (!state) {
        state = { value: 0, velocity: 0, target: 0 };
        partSprings.set(slot, state);
    }
    return state;
}

function partOffsetForDistance(distance) {
    if (distance === 1) return 8;
    if (distance === 2) return 3;
    return 0;
}

function setPartTargets(revealedSlot, revealed) {
    const row = revealedSlot.closest(".shelf-books");
    if (!row) return;

    const slots = Array.from(row.children).filter((el) => el.classList.contains("shelf-book-slot"));
    const revealedIndex = slots.indexOf(revealedSlot);
    if (revealedIndex === -1) return;

    for (let i = 0; i < slots.length; i++) {
        if (i === revealedIndex) continue;
        const distance = Math.abs(i - revealedIndex);
        const magnitude = partOffsetForDistance(distance);
        if (magnitude === 0) continue;

        const direction = i < revealedIndex ? -1 : 1;
        const state = getOrCreatePartSpring(slots[i]);
        state.target = revealed ? magnitude * direction : 0;
        activeParts.add(slots[i]);
    }

    ensureLoopRunning();
}
```

- [ ] **Step 2: Step the part-springs in the shared rAF loop**

In the same file, modify `tick(now)` (from Task 1) to also step `activeParts` alongside `active`. Replace the existing `tick` function body with:

```javascript
function tick(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 1 / 30);
    lastFrameTime = now;

    for (const book of active) {
        const state = springs.get(book);
        if (!state) { active.delete(book); continue; }

        stepSpring(state, dt);

        if (isSettled(state)) {
            state.value = state.target;
            state.velocity = 0;
            applyTransform(book, state.value);
            if (state.value === 0) {
                book.style.removeProperty("transform");
            }
            active.delete(book);
        } else {
            applyTransform(book, state.value);
        }
    }

    for (const slot of activeParts) {
        const state = partSprings.get(slot);
        if (!state) { activeParts.delete(slot); continue; }

        stepSpring(state, dt);

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
            slot.style.transform = `translateX(${state.value}px)`;
        }
    }

    rafHandle = (active.size > 0 || activeParts.size > 0) ? requestAnimationFrame(tick) : null;
}
```

Also add `.shelf-book-slot` to the transition-disable rule from Task 1's Step 2 (`app.css`), so this channel's per-frame writes aren't double-eased by CSS either:

```css
.shelf-physics-active .shelf-book,
.shelf-physics-active .shelf-book-slot {
    transition: none;
}
```
(This replaces, not adds alongside, the single-selector version Task 1 wrote — same rule, now covering both elements.)

- [ ] **Step 3: Call `setPartTargets` from the existing reveal handlers**

Still in the same file, update `initShelfPhysics`'s four listeners (from Task 1) to also call `setPartTargets`. The full function becomes:

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

- [ ] **Step 4: Build and run the full test suite**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success.
Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all existing tests to still pass unchanged (no C#/Razor files touched by this task).

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Add dynamic neighbor-parting to shelf-physics.js"
```

---

### Task 3: Mobile Two-Tap Touch Support

**Files:**
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js` (extend, don't replace, Tasks 1-2's code)
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (extend the existing pointer-events rule to include the new touch-driven state)

**Interfaces:**
- Consumes: Task 1's `setRevealTarget`, Task 2's `setPartTargets` (both same-module internal functions, no signature changes needed).
- Produces: `export function initShelfTouch(root)` — a second init function (deliberately separate from `initShelfPhysics`, since it's conditionally relevant only on touch-primary devices, whereas hover/focus physics matters on every device with a mouse/keyboard, including hybrid touch+mouse laptops where both should coexist). Task 4 calls both this and `initShelfPhysics`.

**Context — why this needs its own function and its own device check**: hover-capable devices (desktop, most laptops) already reveal via Task 1's `mouseenter`/`focusin` handlers, and a single click on a *touch-primary* device (phone, most tablets) has no hover state to trigger a reveal first — without special handling, a tap would navigate immediately without ever showing the cover. The design spec's answer is two-tap: first tap reveals (and is swallowed, not navigated), second tap (on the now-revealed book) proceeds to navigate normally, and tapping elsewhere collapses whatever was open. This must **only** apply on touch-primary devices — a mouse click on desktop should keep navigating immediately on the first click, exactly as it does today, since hover already showed the cover before the click happened.

- [ ] **Step 1: Add the touch-primary device check and `initShelfTouch`**

In `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js`, add:

```javascript
function isTouchPrimary() {
    return window.matchMedia("(hover: none)").matches;
}

// Two-tap navigation for touch-primary devices (see design spec's
// Responsive Behavior section): a tap on a not-yet-revealed book reveals
// it and is swallowed (no navigation); a second tap on the now-revealed
// book proceeds to navigate; a tap anywhere else collapses whatever was
// open. Deliberately separate from initShelfPhysics -- hover-capable
// devices never need this, since hover already reveals before any click
// happens.
export function initShelfTouch(root) {
    if (!root || !isTouchPrimary()) return;

    let currentlyRevealed = null;

    function collapse(book) {
        setRevealTarget(book, false);
        book.classList.remove("is-revealed");
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, false);
    }

    function reveal(book) {
        setRevealTarget(book, true);
        book.classList.add("is-revealed");
        const slot = book.closest(".shelf-book-slot");
        if (slot) setPartTargets(slot, true);
    }

    root.addEventListener("click", (e) => {
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

Note: the favorite button (`.shelf-book-favorite`) already has `@onclick:stopPropagation="true"` set in `ShelfBook.razor` (Phase 1, unchanged) — a tap on it never reaches this delegated `click` listener at all, so favoriting on touch devices is unaffected by any of this.

- [ ] **Step 2: Extend the pointer-events CSS rule to cover the touch-revealed state**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, find the existing rule (search for `.shelf-book-cover { pointer-events: auto; }`'s selector list, from Phase 1):
```css
.shelf-book:hover .shelf-book-cover,
.shelf-book:focus-visible .shelf-book-cover,
.shelf-book:has(:focus-visible) .shelf-book-cover {
    pointer-events: auto;
}
```
Add `.shelf-book.is-revealed .shelf-book-cover` to this selector list, so the favorite button becomes tappable once a book is revealed via the touch two-tap flow (which doesn't trigger `:hover`/`:focus-visible` on most touch browsers):
```css
.shelf-book:hover .shelf-book-cover,
.shelf-book:focus-visible .shelf-book-cover,
.shelf-book:has(:focus-visible) .shelf-book-cover,
.shelf-book.is-revealed .shelf-book-cover {
    pointer-events: auto;
}
```

- [ ] **Step 3: Build and run the full test suite**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success.
Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all existing tests to still pass unchanged (no C#/Razor files touched by this task).

- [ ] **Step 4: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js frontend/LuminaChronica.Client/wwwroot/Styles/app.css
git commit -m "Add mobile two-tap touch support to shelf-physics.js"
```

---

### Task 4: `Library.razor` Integration

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor`

**Interfaces:**
- Consumes: `initShelfPhysics(root)` (Task 1) and `initShelfTouch(root)` (Task 3) from `shelf-physics.js`, called the same way `Statistics.razor` already calls `motion.js`'s `initHeaderCompact`.
- Produces: nothing consumed by a later task — this is the last task in this plan.

**Context — the exact existing pattern to follow** (`Statistics.razor`, read it yourself to confirm before starting):
```razor
@implements IAsyncDisposable
@inject IJSRuntime JsRuntime
```
```csharp
private IJSObjectReference? _motionModule;

protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (!firstRender) return;

    try
    {
        _motionModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/motion.js");
        await _motionModule.InvokeVoidAsync("initHeaderCompact", _heroRef, _heroSentinelRef);
    }
    catch (Exception)
    {
    }
}
```
```csharp
public async ValueTask DisposeAsync()
{
    if (_motionModule is not null)
    {
        try
        {
            await _motionModule.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
    }
}
```

`Library.razor` currently has none of this — it `@implements IDisposable` with a synchronous `Dispose()` disposing only `_searchDebounceTimer` (search for `public void Dispose`). This task converts it to the async pattern above while preserving that existing disposal, and adds a new element reference for the shelf container so the JS functions have something to attach to.

- [ ] **Step 1: Add the JS interop directives and element reference**

In `Library.razor`, change:
```razor
@implements IDisposable
```
to:
```razor
@implements IAsyncDisposable
```
and add, alongside the existing `@inject` lines:
```razor
@inject IJSRuntime JsRuntime
```

Find the shelf's wrapper `<div class="library-shelf">` (search for it, added in Phase 1's Task 4) and give it an element reference:
```razor
<div class="library-shelf" @ref="_shelfRef">
```

- [ ] **Step 2: Add the field and `OnAfterRenderAsync` override**

In the `@code` block, add:
```csharp
private ElementReference _shelfRef;
private IJSObjectReference? _shelfPhysicsModule;

protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (!firstRender) return;

    try
    {
        _shelfPhysicsModule ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelf-physics.js");
        await _shelfPhysicsModule.InvokeVoidAsync("initShelfPhysics", _shelfRef);
        await _shelfPhysicsModule.InvokeVoidAsync("initShelfTouch", _shelfRef);
    }
    catch (Exception)
    {
    }
}
```

This only runs once (`firstRender`), matching `Statistics.razor`'s pattern — the shelf container element itself persists across re-renders driven by filter/sort/pagination changes (only its *children*, the individual `ShelfRow`/`ShelfBook` instances, get added/removed), so the JS module's delegated listeners (attached once to this stable container) keep working correctly across those changes without needing to re-initialize.

Note: `_shelfRef` is only assigned when `_viewMode == LibraryViewMode.Grid` (the shelf branch) — the `else` branch (List view) doesn't render `.library-shelf` at all. If the page happens to render in List mode on first render (e.g. if that becomes the default in some future change), `_shelfRef` would be Blazor's default/unset `ElementReference`, and passing that to the JS interop calls would fail. Guard against this: only make the interop calls if `_viewMode == LibraryViewMode.Grid` at the time `OnAfterRenderAsync` runs. Today's default `_viewMode` is `Grid` (unchanged from Phase 1), so this doesn't change current behavior, only makes the code robust to a future default change.

- [ ] **Step 3: Update the Dispose method**

Replace:
```csharp
public void Dispose()
{
    _searchDebounceTimer?.Dispose();
}
```
with:
```csharp
public async ValueTask DisposeAsync()
{
    _searchDebounceTimer?.Dispose();

    if (_shelfPhysicsModule is not null)
    {
        try
        {
            await _shelfPhysicsModule.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
    }
}
```

- [ ] **Step 4: Build and run the full test suite**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj` — expect success.
Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect all existing tests to still pass unchanged. If any existing `LibraryPageTests.cs` test fails because bUnit's test renderer doesn't execute `OnAfterRenderAsync`'s JS interop the same way a real browser does (a category of gap this codebase has hit before — see `Library.razor`'s own `OnSearchInput` comment about a similar bUnit-vs-real-browser gap), investigate and note it in your report rather than silently working around it; this is exactly the kind of thing the live-verification step below exists to catch instead.

- [ ] **Step 5: Live-visual verification across all four themes**

Using the established technique (JWT + `window.fetch` intercept against a local dev server, SPA-internal navigation, mocking `/api/books`/`/api/books/facets` with a multi-book, multi-group response):

1. **Hover reveal feels physical, not instant/linear, and settles in roughly 300-500ms** (the spec's motion-duration guidance — time it, e.g. via a stopwatch or the browser's performance timeline, not just a visual impression). Hover a book, watch it settle into the revealed position — should read as a single smooth "pull and settle," not a mechanical linear glide (Phase 1's plain transition), not a visible bounce/wobble, and not near-instant or sluggish. Move the mouse quickly across several adjacent books in a row — no stale/stuck mid-rotation books, no visual glitching.
2. **Keyboard focus reveal**, same check as Phase 1's own live verification (tab onto a book, confirm reveal; tab onto its favorite button, confirm it stays revealed; tab away, confirm it eases back to resting) — now checking the *spring* behaves the same way Phase 1's CSS transition did, not just that it ends in the right place.
3. **Neighbor-parting**: hover a book with neighbors on both sides, confirm the immediately-adjacent slots shift a few pixels apart and slots further away shift less/not at all, confirm it settles smoothly and reverses cleanly on mouse-leave, confirm it stays confined to the same shelf row (hovering a book in one row must never part books in a different row — check with at least two visible rows on screen at once).
4. **`prefers-reduced-motion`**: toggle it (devtools), confirm hovering/focusing a book falls back to Phase 1's instant CSS-driven reveal (no spring motion, no parting) — confirm via `getComputedStyle`/DOM inspection that `shelf-physics-active` class was never added to the shelf container in this mode, not just that it visually looks instant.
5. **Touch two-tap** (devtools device-toolbar touch emulation, or a real touch device if available): first tap on a book reveals its cover without navigating; second tap on that same (now-revealed) book navigates to its detail page; tapping a different book collapses the first and reveals the second; tapping empty space collapses whatever was open. Confirm a **mouse click on a non-touch-emulated desktop view still navigates on the first click** (the two-tap behavior must not leak onto hover-capable devices).
6. Confirm all of Phase 1's already-verified behavior still holds unchanged: search/filters/sort/pagination/List-view/favorite-toggle/all 4 themes' color rendering — this task only changes *how* the reveal animates and adds touch support, not any of Phase 1's underlying structure or data flow.

Document any concern (a spring that feels off, a device-detection edge case, anything Phase 1's own verification already covered that now behaves differently) honestly in the task report.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Library.razor
git commit -m "Wire shelf-physics.js into Library.razor (spring reveal + touch support)"
```

- [ ] **Step 7: Add a Roadmap.md entry**

Append a new entry to `documentation/Roadmap.md`, in the same established style as the "Library Rework — Phase 1" entry immediately above it (find it by searching for "Library Rework"). Cover: what shipped in this phase (spring-physics reveal replacing the plain CSS transition, dynamic neighbor-parting, mobile two-tap touch support — closing the "known gap, not yet scoped" item Phase 1's own entry flagged), the test results, and the live-verification results from Step 5 including any concerns.

```bash
git add documentation/Roadmap.md
git commit -m "Document Library Rework Phase 2 in Roadmap"
```
