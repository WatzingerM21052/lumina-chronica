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
const DAMPING = 26; // close to critical damping for this stiffness (ratio
                     // ~0.9) -- a single smooth settle, not a visible
                     // bounce. A prior investigation this session
                     // considered raising this after an earlier live test
                     // showed the rotation reaching -93.8deg past a -88deg
                     // target (numbers from the pre-mirror-flip rotation
                     // convention, before the Task 1 Addendum sign-flip --
                     // no longer the sign this file uses, but the finding
                     // below is unaffected) -- but a clean, isolated re-test (single
                     // hover from a fresh spring, no prior interactions)
                     // showed ZERO overshoot at this exact value: the
                     // earlier reading came from a more complex multi-step
                     // test script (rapid book-to-book handoff, a DOM
                     // removal, several prior drive() calls) and reflected
                     // leftover state from that script, not a real
                     // property of this spring. Verify this live if ever
                     // revisited: if it overshoots and oscillates even
                     // slightly more than once in a clean single hover,
                     // raise DAMPING; if it feels sluggish/dead, lower it
                     // slightly instead of raising STIFFNESS (which would
                     // shorten the settle time in a way that reads as less
                     // "physical", not more).
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
const REVEALED_ROTATE_Y_DEG = 4;
const REVEALED_TRANSLATE_Y_REM = -1.4;
const REVEALED_TRANSLATE_Z_REM = 3.6;
const REVEALED_SCALE = 1.05;

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

// One shared instance per shelf root. Root-aware, not a one-shot flag:
// Library.razor tears down and rebuilds the ENTIRE .library-shelf element
// (a new ElementReference) whenever the shelf reappears after not being
// rendered -- a Grid<->List view-mode toggle, or the shelf temporarily
// replaced by a loading/error/empty state -- and re-calls
// initShelfPhysics/initShelfTouch on that new root each time. If `root`
// differs from the previously-observed shelfRoot, disconnect the old
// observer (it can never fire again anyway, its root is detached) and
// attach a fresh one to the new root; any revealedBookId/partedSlots
// state tracked against the old root is meaningless once that root is
// gone, so both are cleared on migration too. Calling this again with
// the SAME root (e.g. both init functions running back-to-back in the
// same render) is a correct no-op.
//
// The observer itself watches for the currently-revealed book's element
// disappearing from the DOM without a normal collapse ever firing -- the
// only way that happens is a Blazor re-render (filter/sort/search change)
// removing it while it's still revealed. When it does, every currently-
// parted slot is reset back to resting (once the revealed book is gone
// there is no way to recompute which neighbors it parted, so resetAllParts
// resets all of them) and revealedBookId is cleared so the
// 0-or-1-revealed invariant stays true.
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
        if (slots[i].offsetTop !== revealedSlot.offsetTop) continue;
        const distance = Math.abs(i - revealedIndex);
        const magnitude = partOffsetForDistance(distance);
        if (magnitude === 0) continue;

        const direction = i < revealedIndex ? -1 : 1;
        const state = getOrCreatePartSpring(slots[i]);
        state.target = revealed ? magnitude * direction : 0;
        activeParts.add(slots[i]);
        if (revealed) partedSlots.add(slots[i]);
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
                const rotator = getRotator(book);
                if (rotator) rotator.style.removeProperty("transform");
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
                partedSlots.delete(slot);
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
    if (root.classList.contains("shelf-touch-active")) return; // already initialized on this exact root
    root.classList.add("shelf-touch-active");
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

export function initShelfPhysics(root) {
    if (!root || prefersReducedMotion()) return;
    if (root.classList.contains("shelf-physics-active")) return; // already initialized on this exact root
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
        // Unconditional, not conditional on how it got revealed: since
        // revealedBookId is shared with the touch path, the book this
        // hides might have been revealed by a tap (which adds
        // "is-revealed" for its own CSS pointer-events rule, see
        // app.css), and this hover-side path is what ends up closing it
        // if the same device also has a mouse and it leaves the book.
        // Removing a class that was never added is a harmless no-op, so
        // this is safe to call unconditionally rather than checking first.
        book.classList.remove("is-revealed");
        setRevealTarget(book, false);
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

    // Real hover only exists on non-touch-primary devices. On a
    // touch-primary device, browsers synthesize mouseenter/mousemove/click
    // compatibility events after every real tap -- if these listeners
    // stayed active there, the synthesized mouseenter would set
    // revealedBookId to the tapped book BEFORE initShelfTouch's click
    // handler runs, making it misread the first real tap as a "second tap
    // on an already-revealed book" and navigate immediately instead of
    // revealing. Gating these two listeners (but not focusin/focusout,
    // needed for keyboard parity even on a touch+keyboard device) is what
    // keeps the two paths from fighting over the shared revealedBookId.
    if (!isTouchPrimary()) {
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
    }

    root.addEventListener("focusin", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        // :focus-visible (not just "focused") is deliberate: a touch tap's
        // programmatic focus does not match :focus-visible in modern
        // browsers, only real keyboard navigation does. Without this
        // check, a touch device's tap-triggered focus would write to the
        // shared revealedBookId here, then get misread as a "second tap"
        // by initShelfTouch's click handler -- the exact bug the
        // mouseenter/mouseleave touch-primary gate above already fixes
        // for hover, reopened through this separate event path. This also
        // matches the existing CSS fallback rule (.shelf-book:focus-visible
        // in app.css), which never revealed on plain focus either.
        if (!book.matches(":focus-visible")) return;
        revealHoverBook(book);
    });

    root.addEventListener("focusout", (e) => {
        const book = e.target.closest?.(".shelf-book");
        if (!book || !root.contains(book)) return;
        if (e.relatedTarget && book.contains(e.relatedTarget)) return;
        closeIfCurrentlyRevealed(book);
    });
}

// Infinite-scroll trigger for the Regal view's lazy book rendering
// (Library Rework -- unpaginated shelf). One observer instance at a time,
// same disconnect-before-reobserve pattern as lazyCover.js: this module is
// re-invoked on every render where more books remain to reveal, and each
// call must fully replace whatever observer the previous render created
// rather than stacking a new one on top of it.
let loadMoreObserver = null;

export function observeLoadMore(sentinel, dotNetHelper, methodName) {
    loadMoreObserver?.disconnect();
    if (!sentinel) return;

    loadMoreObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            dotNetHelper.invokeMethodAsync(methodName);
        }
    }, { rootMargin: "600px 0px" }); // start revealing well before the sentinel is actually on-screen

    loadMoreObserver.observe(sentinel);
}

export function disconnectLoadMore() {
    loadMoreObserver?.disconnect();
    loadMoreObserver = null;
}
