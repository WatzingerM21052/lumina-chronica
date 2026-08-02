// Secret Bible-reader page support: last-used translation (localStorage,
// not reading_progress -- that FKs to books and has no concept of a
// non-book text) and FUMS view-tracking, api.bible's required Fair Use
// Management System mechanism (see docs.api.bible/guides/fair-use, verified
// 2026-08-02: fums-version=3 on a request returns meta.fumsToken; the page
// must load their tracker script and report it per view). The page always
// opens on Philippians 2:14 regardless of the remembered translation --
// that's the deliberate "secret feature" landing, not something to resume
// past.

const STORAGE_KEY = "lumina-bible-translation";

export function getLastTranslationId() {
    return localStorage.getItem(STORAGE_KEY);
}

export function setLastTranslationId(bibleId) {
    localStorage.setItem(STORAGE_KEY, bibleId);
}

let fumsScriptRequested = false;

// The window.fums/fumsData stub must exist before the real script loads --
// this is api.bible's own documented snippet shape, not something we can
// simplify, since fumsV3.min.js reads window.fumsData for calls queued
// before it finished loading.
function ensureFumsScript() {
    window.fumsData = window.fumsData || [];
    window.fums =
        window.fums ||
        function () {
            window.fumsData.push(arguments);
        };

    if (fumsScriptRequested) return;
    fumsScriptRequested = true;
    const script = document.createElement("script");
    script.src = "https://pkg.api.bible/fumsV3.min.js";
    script.async = true;
    document.head.appendChild(script);
}

export function trackView(fumsToken) {
    ensureFumsScript();
    window.fums("trackView", fumsToken);
}

export function scrollToVerse(containerId, sid) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const el = container.querySelector(`[data-sid="${sid}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bible-verse-highlight");
    setTimeout(() => el.classList.remove("bible-verse-highlight"), 4000);
}
