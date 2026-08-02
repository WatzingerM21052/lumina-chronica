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

const SANS_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const LINE_HEIGHTS = { tight: "1.4", normal: "1.75", loose: "2.2" };
const PAGE_WIDTHS = { narrow: "34rem", normal: "42rem", wide: "54rem" };

// epub.js renders into an isolated iframe, so it never sees the app's own
// CSS -- without this, EPUB content is always black-on-white regardless of
// the active theme, which reads as broken next to a dark theme's chrome.
// Reads the *current* theme's resolved colors/reader font (rather than
// hardcoding a palette here) so it stays correct if the theme tokens
// change, and reads entry.contentStyle *live* (not captured once at init)
// so font family/line-height/page-width changes can be re-applied later
// without re-registering the hook -- see setContentStyle below.
//
// rendition.themes.register()/.select() (the "documented" way) doesn't
// reliably apply in this epub.js build -- content still rendered
// black-on-transparent. Using the content-render hook instead: it fires
// for every section as it's actually attached to its iframe, and
// Contents.addStylesheetRules() injects a real <style> into that specific
// document, which does take effect.
function buildContentRules(entry) {
    const styles = getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue("--color-bg-reader").trim() || "#ffffff";
    const color = styles.getPropertyValue("--color-text-primary").trim() || "#000000";
    const linkColor = styles.getPropertyValue("--color-primary").trim() || color;
    const serifFont = styles.getPropertyValue("--font-family-reader").trim() || "serif";

    const fontFamily = entry.contentStyle.fontFamily === "sans" ? SANS_FONT_STACK : serifFont;
    const lineHeight = LINE_HEIGHTS[entry.contentStyle.lineHeight] || LINE_HEIGHTS.normal;
    const maxWidth = PAGE_WIDTHS[entry.contentStyle.pageWidth] || PAGE_WIDTHS.normal;

    return {
        body: {
            background, color, "font-family": fontFamily, "line-height": lineHeight,
            "max-width": maxWidth, margin: "0 auto", padding: "0 1rem",
        },
        a: { color: linkColor },
        // Some EPUBs size images with a fixed px width in their own CSS,
        // which then doesn't scale with the page width above or overflow
        // the (now narrower/wider) reading column -- constrained to the
        // rendered content's own width instead.
        img: { "max-width": "100%", height: "auto" },
    };
}

// Re-applies buildContentRules() to every currently-rendered section
// (rendition.getContents() returns live Contents handles, one per section
// attached to an iframe right now) -- used both by the content hook below
// (fires once per section as it's first rendered) and by setContentStyle
// (fires for whatever's on screen *right now* when a setting changes, so
// the user doesn't have to flip a page to see the new value take effect).
function applyContentRules(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    const rules = buildContentRules(entry);
    entry.rendition.getContents().forEach((contents) => contents.addStylesheetRules(rules));
}

// Some downloaded EPUBs (piracy-site rips) carry a watermark stamped into
// every single chapter file -- a `<div style="float: none; margin: 10px
// 0px 10px 0px; text-align: center;"><p><a href="https://oceanofpdf.com">
// <i>OceanofPDF.com</i></a></p></div>` appended right before `</body>`,
// confirmed identical across every affected chapter in several real test
// files (bookDownloads/_OceanofPDF.com_*.epub). Removed here, via the same
// per-section content hook mechanism as buildContentRules above, so it's
// gone *before* epub.js paginates that section -- stripping it
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

export async function init(elementId, bytes, initialCfi, fontSize, fontFamily, lineHeight, pageWidth) {
    await ensureLibsLoaded();

    // Defensive: a byte[] interop parameter is *usually* a Uint8Array over
    // its own exactly-sized buffer, but slicing to byteOffset/byteLength
    // guards against a pooled/offset view regardless.
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const book = ePub(arrayBuffer);
    const rendition = book.renderTo(elementId, { width: "100%", height: "100%", flow: "paginated", spread: "none" });
    rendition.themes.fontSize(`${fontSize}px`);

    const entry = {
        book, rendition,
        contentStyle: { fontFamily: fontFamily || "serif", lineHeight: lineHeight || "normal", pageWidth: pageWidth || "normal" },
    };
    instances.set(elementId, entry);

    rendition.hooks.content.register((contents) => contents.addStylesheetRules(buildContentRules(entry)));
    stripPiracyWatermarks(rendition);

    await rendition.display(initialCfi || undefined);
}

export function setFontSize(elementId, fontSize) {
    instances.get(elementId)?.rendition.themes.fontSize(`${fontSize}px`);
}

export function setContentStyle(elementId, fontFamily, lineHeight, pageWidth) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.contentStyle = { fontFamily, lineHeight, pageWidth };
    applyContentRules(elementId);
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
