// Dark Academia theme atmosphere (issue #143): a rAF-throttled scroll
// listener drives one CSS custom property for a single-layer parallax
// offset. Deliberately NOT a canvas particle engine or multi-layer
// parallax rig -- the spec's own "Atmosphäre vor Effekten" note, and this
// is cheap enough to stay GPU-composited (transform only) on modest
// hardware.
//
// Chapter fade-in used to be handled here too (an IntersectionObserver
// toggling a class), but that made scripture's visibility depend on a
// multi-step JS/Blazor handshake (component mount timing, re-observing on
// every chapter navigation) -- fragile enough that a real race left the
// chapter text stuck at opacity:0 on a fresh load with the theme already
// active (confirmed live). Replaced with a plain CSS @keyframes animation
// on .bible-chapter directly (see Bible.razor.css) -- @key="_chapter.Id"
// on the <article> already guarantees a fresh element per chapter, so the
// animation replays on navigation with no JS involved and nothing that
// can silently fail content invisible.
//
// Parallax is skipped entirely on narrow/touch viewports or when
// prefers-reduced-motion is set, where a moving background under
// one-handed scrolling reads as janky rather than atmospheric.

const PARALLAX_MAX_WIDTH = 640; // matches app.css's own mobile breakpoint convention
let activeState = null; // only one <BibleAtmosphere> instance exists per page

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shouldParallax() {
    return !prefersReducedMotion() && window.innerWidth > PARALLAX_MAX_WIDTH;
}

export function init(backgroundId) {
    const background = document.getElementById(backgroundId);
    if (!background) return;

    destroy(); // guard against double-init across a fast theme toggle

    if (!shouldParallax()) return;

    const state = { rafPending: false };
    state.onScroll = () => {
        if (state.rafPending) return;
        state.rafPending = true;
        requestAnimationFrame(() => {
            // A fraction of scrollY, capped -- "slowly drifts", not "tracks
            // 1:1", and capped so a very long chapter can't drag the
            // background edge into view.
            const offset = Math.min(window.scrollY * 0.08, 60);
            background.style.setProperty("--ba-parallax-y", `${offset}px`);
            state.rafPending = false;
        });
    };
    window.addEventListener("scroll", state.onScroll, { passive: true });
    activeState = state;
}

export function destroy() {
    if (!activeState) return;
    window.removeEventListener("scroll", activeState.onScroll);
    activeState = null;
}
