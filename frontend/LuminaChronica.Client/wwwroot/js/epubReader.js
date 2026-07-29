// Wraps vendored epub.js (wwwroot/lib/epubjs/) for the Reader page's EPUB
// branch. The two library files are classic (non-module) UMD scripts, lazy
// loaded on first use rather than referenced from index.html, since most
// page loads never open an EPUB. epub.js's browser-globals UMD path reads
// `window.JSZip` at eval time (not lazily), so jszip.min.js must finish
// loading and executing before epub.min.js is injected -- these two loads
// are intentionally sequential, not parallel.
let libsLoadedPromise = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

function ensureLibsLoaded() {
    if (!libsLoadedPromise) {
        libsLoadedPromise = loadScript("lib/epubjs/jszip.min.js")
            .then(() => loadScript("lib/epubjs/epub.min.js"));
    }
    return libsLoadedPromise;
}

const instances = new Map();

export async function init(elementId, bytes, initialCfi, fontSize) {
    await ensureLibsLoaded();

    const book = ePub(bytes.buffer);
    const rendition = book.renderTo(elementId, { width: "100%", height: "100%", flow: "paginated", spread: "none" });
    rendition.themes.fontSize(`${fontSize}px`);

    instances.set(elementId, { book, rendition });

    await rendition.display(initialCfi || undefined);
}

export function setFontSize(elementId, fontSize) {
    instances.get(elementId)?.rendition.themes.fontSize(`${fontSize}px`);
}

export function next(elementId) {
    instances.get(elementId)?.rendition.next();
}

export function prev(elementId) {
    instances.get(elementId)?.rendition.prev();
}

// Best-effort spine-index-based percentage -- deliberately not using
// epub.js's book.locations.generate(), which parses the entire spine on
// every open. Resume correctness relies on the CFI alone, not this number.
export function onRelocated(elementId, dotNetRef) {
    const entry = instances.get(elementId);
    if (!entry) return;

    entry.rendition.on("relocated", (location) => {
        const index = location?.start?.index ?? 0;
        const total = entry.book.spine?.length || 1;
        const percentage = Math.max(0, Math.min(100, Math.round((index / total) * 100)));
        dotNetRef.invokeMethodAsync("OnRelocated", location.start.cfi, index, percentage);
    });
}

export function destroy(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.book.destroy();
    instances.delete(elementId);
}
