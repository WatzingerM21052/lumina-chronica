// Scroll-reveal, header scroll-compaction, and page-enter replay
// (issue #341's motion pass over Discover/PublicProfile). One shared module
// since all three are IntersectionObserver/DOM-class helpers with the same
// "respect prefers-reduced-motion" requirement.

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Fades+rises `[data-reveal]` sections into view as they enter the
// viewport. Safe by construction: every section renders fully visible by
// default (no CSS ever hides it up front), and only becomes hidden the
// moment this function adds `.reveal-init` right before observing it -- so
// a blocked/slow/failed module load leaves content in its normal, fully
// visible state instead of stuck invisible. See Architecture.md.
//
// Sections already inside the viewport at call time are skipped entirely
// (left in their normal, fully-visible state) rather than hidden-then-
// revealed: `initReveal` runs after `await import(...)`, a real network
// fetch -- on a slow/cold cache that gap is long enough for the user to see
// already-painted above-fold content snap invisible and fade back in,
// which reads as a bug, not a reveal. Below-fold sections don't have this
// problem (they're never seen in their unhidden state first), so they
// still get the real scroll-triggered fade.
export function initReveal(root) {
    if (prefersReducedMotion()) return;

    const scope = root instanceof Element ? root : document;
    const sections = scope.querySelectorAll("[data-reveal]");

    const observer = new IntersectionObserver((entries, obs) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("reveal-visible");
            obs.unobserve(entry.target);
        }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });

    for (const section of sections) {
        if (section.classList.contains("reveal-init")) continue; // already wired by an earlier call (e.g. navigation re-init)
        if (section.getBoundingClientRect().top < window.innerHeight) continue; // already visible -- leave it alone, see above

        section.classList.add("reveal-init");
        observer.observe(section);
    }
}

// Toggles `.is-compact` on `headerEl` once `sentinelEl` (placed just below
// the header) scrolls out of view -- an observer instead of a permanent
// scroll-event listener, so there's nothing to throttle/debounce and no
// per-frame layout read.
export function initHeaderCompact(headerEl, sentinelEl) {
    if (!headerEl || !sentinelEl) return;

    const observer = new IntersectionObserver(([entry]) => {
        headerEl.classList.toggle("is-compact", !entry.isIntersecting);
    }, { threshold: 0 });

    observer.observe(sentinelEl);
}

// Restarts `el`'s `.page-enter` CSS animation -- used on client-side
// navigation, since the element itself deliberately isn't re-keyed/
// recreated (see MainLayout.razor's OnLocationChanged comment: some page
// components reuse their instance across same-route navigations, e.g.
// /u/alice -> /u/bob, and forcing a remount there would change that).
export function replayPageEnter(el) {
    if (!el || prefersReducedMotion()) return;

    el.classList.remove("page-enter");
    void el.offsetWidth; // force a reflow so the removal is observed before re-adding
    el.classList.add("page-enter");
}
