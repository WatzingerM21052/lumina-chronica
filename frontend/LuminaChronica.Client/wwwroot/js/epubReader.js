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

// Exported so metadataExtractor.js (Upload page) can reuse the same lazy
// jszip/epub.min.js load instead of injecting the scripts a second time.
export function ensureLibsLoaded() {
    if (!libsLoadedPromise) {
        libsLoadedPromise = loadScript("lib/epubjs/jszip.min.js")
            .then(() => loadScript("lib/epubjs/epub.min.js"));
    }
    return libsLoadedPromise;
}

const instances = new Map();

// epub.js renders into an isolated iframe, so it never sees the app's own
// CSS -- without this, EPUB content is always black-on-white regardless of
// the active theme, which reads as broken next to a dark theme's chrome.
// Reads the *current* theme's resolved colors/reader font at open time
// (rather than hardcoding a palette here) so it stays correct if the theme
// tokens change.
//
// rendition.themes.register()/.select() (the "documented" way) doesn't
// reliably apply in this epub.js build -- content still rendered
// black-on-transparent. Using the content-render hook instead: it fires
// for every section as it's actually attached to its iframe, and
// Contents.addStylesheetRules() injects a real <style> into that specific
// document, which does take effect.
function applyAppTheme(rendition) {
    const styles = getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue("--color-bg-reader").trim() || "#ffffff";
    const color = styles.getPropertyValue("--color-text-primary").trim() || "#000000";
    const linkColor = styles.getPropertyValue("--color-primary").trim() || color;
    const fontFamily = styles.getPropertyValue("--font-family-reader").trim() || "serif";

    rendition.hooks.content.register((contents) => {
        contents.addStylesheetRules({
            body: { background: background, color: color, "font-family": fontFamily },
            a: { color: linkColor },
        });
    });
}

// Some downloaded EPUBs (piracy-site rips) carry a watermark stamped into
// every single chapter file -- a `<div style="float: none; margin: 10px
// 0px 10px 0px; text-align: center;"><p><a href="https://oceanofpdf.com">
// <i>OceanofPDF.com</i></a></p></div>` appended right before `</body>`,
// confirmed identical across every affected chapter in several real test
// files (bookDownloads/_OceanofPDF.com_*.epub). Removed here, in the same
// content hook that fires per rendered section (see applyAppTheme above),
// so it's gone *before* epub.js paginates that section -- stripping it
// after layout would leave a stale page break where the watermark used to
// be. A content hook rather than rewriting the stored EPUB file: the
// original upload is never mutated, and this only needs to run once per
// section render regardless of how many times the book is reopened.
function stripPiracyWatermarks(rendition) {
    rendition.hooks.content.register((contents) => {
        contents.document.querySelectorAll('a[href*="oceanofpdf.com" i]').forEach((link) => {
            // Climb from the link to its smallest ancestor that contains
            // *only* the watermark (its own injected wrapper <div>/<p>),
            // not the whole chapter -- stops as soon as a parent's text
            // includes anything beyond the link itself, or at <body>.
            let node = link;
            while (
                node.parentElement &&
                node.parentElement.tagName !== "BODY" &&
                node.parentElement.textContent.trim() === node.textContent.trim()
            ) {
                node = node.parentElement;
            }
            node.remove();
        });
    });
}

export async function init(elementId, bytes, initialCfi, fontSize) {
    await ensureLibsLoaded();

    // Defensive: a byte[] interop parameter is *usually* a Uint8Array over
    // its own exactly-sized buffer, but slicing to byteOffset/byteLength
    // guards against a pooled/offset view regardless.
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const book = ePub(arrayBuffer);
    const rendition = book.renderTo(elementId, { width: "100%", height: "100%", flow: "paginated", spread: "none" });
    rendition.themes.fontSize(`${fontSize}px`);
    applyAppTheme(rendition);
    stripPiracyWatermarks(rendition);

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
