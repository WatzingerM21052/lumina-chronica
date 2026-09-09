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

// Deliberately plain px, not rem-scaled like getRevealedTranslatePx above:
// the spec calls for "a few pixels" of parting, a much smaller and more
// forgiving visual amount than the reveal's own translate/rotate values,
// so unlike those, a non-default root font-size shifting this by a pixel
// or two is not worth the extra lookup on this hot path.
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
//
// Unlike initShelfPhysics, this does NOT no-op under prefers-reduced-motion
// -- a touch-primary device has no hover/:focus-visible path, so fully
// disabling this module would leave reduced-motion touch users with no way
// to ever see a cover at all. Instead, under reduced motion the reveal/
// collapse below snaps the spring straight to its target value (no rAF
// loop, no neighbor-parting motion) rather than easing -- see the
// `reducedMotion` branch in setRevealedState.
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
