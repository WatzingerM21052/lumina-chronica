// Dark Academia theme atmosphere (issue #143): a rAF-throttled scroll
// listener drives one CSS custom property for a single-layer parallax
// offset, and an IntersectionObserver toggles a class for scroll-triggered
// fade-ins. Deliberately NOT a canvas particle engine or multi-layer
// parallax rig -- the spec's own "Atmosphäre vor Effekten" note, and this
// is cheap enough to stay GPU-composited (transform/opacity only) on
// modest hardware.
//
// Both effects are skipped entirely (not just "instant", actually never
// wired up) when prefers-reduced-motion is set, or -- parallax only -- on
// narrow/touch viewports, where a moving background under one-handed
// scrolling reads as janky rather than atmospheric.

const PARALLAX_MAX_WIDTH = 640; // matches app.css's own mobile breakpoint convention
const instances = new Map();

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shouldParallax() {
    return !prefersReducedMotion() && window.innerWidth > PARALLAX_MAX_WIDTH;
}

export function init(rootId, backgroundId) {
    const root = document.getElementById(rootId);
    const background = document.getElementById(backgroundId);
    if (!root || !background) return;

    destroy(rootId); // guard against double-init across a fast theme toggle

    const state = { rafPending: false, onScroll: null, observer: null };

    if (shouldParallax()) {
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
    }

    if (!prefersReducedMotion() && "IntersectionObserver" in window) {
        state.observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        state.observer.unobserve(entry.target);
                    }
                }
            },
            { threshold: 0.15 }
        );
        root.querySelectorAll(".ba-fade-in").forEach((el) => state.observer.observe(el));
    } else {
        // Reduced motion (or no IO support, effectively unreachable on any
        // supported browser): show fade-in targets immediately rather than
        // leaving them permanently at opacity:0 with no observer to reveal them.
        root.querySelectorAll(".ba-fade-in").forEach((el) => el.classList.add("is-visible"));
    }

    instances.set(rootId, state);
}

// Re-runs the fade-in wiring for elements added after init (a new chapter's
// heading/content, re-rendered by Blazor on every navigation) without
// tearing down the scroll listener -- called from Reader-side navigation,
// not just the initial mount.
export function observeNewFadeIns(rootId) {
    const state = instances.get(rootId);
    const root = document.getElementById(rootId);
    if (!root) return;

    if (!state?.observer) {
        root.querySelectorAll(".ba-fade-in:not(.is-visible)").forEach((el) => el.classList.add("is-visible"));
        return;
    }
    root.querySelectorAll(".ba-fade-in:not(.is-visible)").forEach((el) => state.observer.observe(el));
}

export function destroy(rootId) {
    const state = instances.get(rootId);
    if (!state) return;

    if (state.onScroll) window.removeEventListener("scroll", state.onScroll);
    state.observer?.disconnect();
    instances.delete(rootId);
}
