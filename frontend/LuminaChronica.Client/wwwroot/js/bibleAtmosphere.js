// Dark Academia theme atmosphere (issue #143): a rAF-throttled scroll
// listener drives one CSS custom property for a single-layer parallax
// offset, plus a one-time GSAP entrance sequence (issue #143 v2, "Eintritt
// in die Seite") played when the theme activates. Deliberately NOT a canvas
// particle engine or multi-layer parallax rig for the ambient parts -- the
// spec's own "Atmosphäre vor Effekten" note, and this is cheap enough to
// stay GPU-composited (transform/opacity only) on modest hardware.
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
// can silently fail content invisible. The entrance sequence below follows
// the same rule for everything it touches: every element defaults to fully
// visible in plain CSS, and JS only ever sets a "hidden, about to reveal"
// state immediately before animating it back in -- a failed/slow GSAP load
// degrades to "no intro", never a stuck-invisible page.
//
// Parallax is skipped entirely on narrow/touch viewports or when
// prefers-reduced-motion is set, where a moving background under
// one-handed scrolling reads as janky rather than atmospheric. The
// entrance sequence is skipped only for prefers-reduced-motion (it plays
// on mobile too -- it's a short opacity/transform sequence, not a
// scroll-driven effect, so it isn't the same category of janky).

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

// --- Entrance sequence -------------------------------------------------
// wwwroot/lib/gsap/ (GreenSock "no charge" standard license -- free for
// this app's use, not MIT like the other vendored libs) is lazy-loaded the
// same way as epub.js/StPageFlip/html2canvas in epubReader.js: most page
// loads never open the Bible page, let alone this theme, so it's never
// referenced from index.html.
let gsapLoadedPromise = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

function ensureGsapLoaded() {
    if (!gsapLoadedPromise) gsapLoadedPromise = loadScript("lib/gsap/gsap.min.js");
    return gsapLoadedPromise;
}

// Candle ignites in darkness -> light spreads across the background image
// (the real photo -- a gilded baroque ceiling -- is worth revealing, not
// hiding under a permanent dark filter) -> a gold rule draws itself ->
// title/toggle catch the light. Plays once per BibleAtmosphere mount, i.e.
// once per "entering" the theme (page load with it persisted, or clicking
// the toggle) -- chapter navigation never remounts this component, so it
// never replays mid-read.
export async function playEntrance() {
    if (prefersReducedMotion()) return;

    const curtain = document.querySelector(".ba-curtain");
    const background = document.getElementById("bible-atmosphere-background");
    if (!curtain || !background) return;

    try {
        await ensureGsapLoaded();
    } catch {
        return; // no GSAP -> everything already sits at its safe, visible CSS default
    }

    const gsap = window.gsap;
    if (!gsap) return;

    const ignite = document.querySelector(".ba-ignite");
    const vignette = document.querySelector(".bible-atmosphere-vignette");
    const glows = document.querySelectorAll(".bible-atmosphere-glow");
    const dust = document.querySelector(".bible-atmosphere-dust");
    const title = document.querySelector(".bible-title-immersive");
    const rule = document.querySelector(".bible-title-rule");
    const toggle = document.querySelector(".bible-theme-toggle");

    const allTargets = [curtain, ignite, background, vignette, ...glows, dust, title, rule, toggle].filter(Boolean);

    gsap.set(curtain, { autoAlpha: 1 });
    gsap.set(background, { autoAlpha: 0, scale: 1.06 });
    gsap.set([vignette, dust, ...glows].filter(Boolean), { autoAlpha: 0 });
    if (ignite) gsap.set(ignite, { autoAlpha: 0, scale: 0 });
    if (rule) gsap.set(rule, { scaleX: 0 });
    if (title) gsap.set(title, { autoAlpha: 0, clipPath: "inset(0 100% 0 0)" });
    if (toggle) gsap.set(toggle, { autoAlpha: 0, y: 8 });

    const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: () => gsap.set(allTargets, { clearProps: "all" }),
    });

    if (ignite) tl.to(ignite, { autoAlpha: 1, scale: 1, duration: 0.9, ease: "back.out(1.4)" }, 0);
    tl.to(curtain, { autoAlpha: 0, duration: 1.4 }, 0.2);
    tl.to(background, { autoAlpha: 1, scale: 1, duration: 1.6, ease: "power2.inOut" }, 0.5);
    tl.to([vignette, ...glows].filter(Boolean), { autoAlpha: 1, duration: 1.2 }, 0.6);
    if (ignite) tl.to(ignite, { autoAlpha: 0, duration: 0.6 }, 1.4);
    if (rule) tl.to(rule, { scaleX: 1, duration: 0.6, ease: "power2.inOut" }, 1.3);
    if (title) tl.to(title, { autoAlpha: 1, clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.out" }, 1.5);
    if (dust) tl.to(dust, { autoAlpha: 1, duration: 0.7 }, 1.8);
    if (toggle) tl.to(toggle, { autoAlpha: 1, y: 0, duration: 0.5 }, 1.9);
}
