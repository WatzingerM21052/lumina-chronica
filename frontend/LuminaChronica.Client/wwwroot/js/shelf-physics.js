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
