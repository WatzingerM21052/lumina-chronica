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

// StPageFlip and html2canvas (issue #189, Realistic View) are both classic
// UMD scripts (globals `St.PageFlip` / `html2canvas`), lazy-loaded the same
// way as epub.js itself -- most reader sessions never touch Realistic View.
let pageFlipLibLoadedPromise = null;
function ensurePageFlipLibLoaded() {
    if (!pageFlipLibLoadedPromise) pageFlipLibLoadedPromise = loadScript("lib/pageflip/page-flip.browser.js");
    return pageFlipLibLoadedPromise;
}

let html2canvasLoadedPromise = null;
function ensureHtml2CanvasLoaded() {
    if (!html2canvasLoadedPromise) html2canvasLoadedPromise = loadScript("lib/html2canvas/html2canvas.min.js");
    return html2canvasLoadedPromise;
}

const instances = new Map();

// Single source of truth for which of the three rendering paths (Book View,
// Scroll View, Realistic View) owns the container -- mirrors pdfReader.js's
// same-named helper. Realistic View reuses the *same* "paginated" epub.js
// rendition as Book View underneath (kept alive as a hidden capture source,
// see initRealisticView) -- only Scroll actually needs a different epub.js
// flow.
function modeOf(flow) {
    return flow === "scroll" ? "scroll" : flow === "realistic" ? "realistic" : "book";
}

// epub.js's Rendition/Manager keeps mutable internal state (current view,
// its own render queue) that isn't safe to touch from two calls at once --
// confirmed live via a rapid-fire next() stress test (same class of bug as
// the PDF reader's canvas race, see pdfReader.js's renderPage): clicking
// through pages faster than epub.js's own async page-turn completes threw
// "Cannot read properties of undefined (reading 'next')" and a second,
// unrelated-looking "reading 'package'" error from deep inside its queue,
// then the whole reader crashed. Every entry point below that touches
// rendition (next/prev/resize/font-size/content-style) is chained through
// this per-instance queue instead of firing directly, so overlapping calls
// run strictly one after another -- never concurrently -- regardless of
// which combination of operations arrives in quick succession. Unlike
// pdfReader.js's zoom (where only the *final* value matters, so
// intermediate calls can be dropped), page-turns want every click honored
// in order, so this deliberately queues rather than coalesces.
function runSerialized(entry, fn) {
    entry.opQueue = (entry.opQueue || Promise.resolve()).catch(() => {}).then(fn);
    return entry.opQueue;
}

const SANS_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const LINE_HEIGHTS = { tight: "1.4", normal: "1.75", loose: "2.2" };

// epub.js renders into an isolated iframe, so it never sees the app's own
// CSS -- without this, EPUB content is always black-on-white regardless of
// the active theme, which reads as broken next to a dark theme's chrome.
// Reads the *current* theme's resolved colors/reader font (rather than
// hardcoding a palette here) so it stays correct if the theme tokens
// change, and reads entry.contentStyle *live* (not captured once at init)
// so font family/line-height changes can be re-applied later without
// re-registering the hook -- see setContentStyle below.
//
// rendition.themes.register()/.select() (the "documented" way) doesn't
// reliably apply in this epub.js build -- content still rendered
// black-on-transparent. Using the content-render hook instead: it fires
// for every section as it's actually attached to its iframe, and
// Contents.addStylesheetRules() injects a real <style> into that specific
// document, which does take effect.
//
// No body max-width/margin/padding rule here (unlike TXT/MD's
// .reader-content) -- epub.js's own pagination engine sets width,
// column-width, max-width and padding as *inline* styles on body itself
// for its CSS-multi-column page-turn math, and an inline style always
// wins over anything addStylesheetRules injects into a stylesheet, no
// matter the selector or rule order. Confirmed live: a body { max-width }
// rule here was present in the injected stylesheet but had zero effect --
// getComputedStyle still reported the inline value. "Page width" for EPUB
// is instead handled by resizing .epub-reader-frame itself (the container
// epub.js measures before laying out columns) -- see setPageWidth below.
function buildContentRules(entry) {
    const styles = getComputedStyle(document.documentElement);
    const background = styles.getPropertyValue("--color-bg-reader").trim() || "#ffffff";
    const color = styles.getPropertyValue("--color-text-primary").trim() || "#000000";
    const linkColor = styles.getPropertyValue("--color-primary").trim() || color;
    const serifFont = styles.getPropertyValue("--font-family-reader").trim() || "serif";

    const fontFamily = entry.contentStyle.fontFamily === "sans" ? SANS_FONT_STACK : serifFont;
    const lineHeight = LINE_HEIGHTS[entry.contentStyle.lineHeight] || LINE_HEIGHTS.normal;

    return {
        body: { background, color, "font-family": fontFamily, "line-height": lineHeight },
        a: { color: linkColor },
        // min(100%, 28em) rather than a flat 100%: 100% alone only stops
        // an image overflowing its container, it doesn't scale with font
        // size at all -- em is relative to the element's own (inherited)
        // font-size, which does track rendition.themes.fontSize() since
        // that's inherited like any other font-size regardless of it
        // being set inline. Same reasoning as .reader-content img in
        // app.css, mirrored here since EPUB's iframe can't see that rule.
        //
        // !important on both properties: epub.js's own Layout code
        // registers its own content hook (before ours) that constrains
        // every image to `max-width: <columnWidth>px !important` for its
        // own fit-to-page purposes -- confirmed live via the injected
        // stylesheet's actual cssRules, an earlier `img` rule with
        // !important and a plain pixel value that silently beat our rule
        // regardless of insertion order, since !important always wins over
        // a non-important rule no matter which came later. Matching its
        // own !important is the only way to override it.
        img: { "max-width": "min(100%, 28em) !important", height: "auto !important" },
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

// Shared by init() and setFlow() (Book View <-> Scroll View, issue #174):
// creates a fresh rendition for entry.book with the given flow and
// re-registers every per-rendition hook (theming, watermark strip, swipe,
// keyboard, relocated tracking). Pulled out so switching modes mid-read
// doesn't have to duplicate this list and risk the two paths drifting apart.
function setupRendition(entry, elementId, flow) {
    const options = { width: "100%", height: "100%", flow };
    if (flow === "paginated") options.spread = "none"; // spread is a paginated-only concept
    const rendition = entry.book.renderTo(elementId, options);
    entry.rendition = rendition;
    entry.flow = flow;
    rendition.themes.fontSize(`${entry.fontSize}px`);

    rendition.hooks.content.register((contents) => contents.addStylesheetRules(buildContentRules(entry)));
    stripPiracyWatermarks(rendition);
    attachSwipeHandler(rendition, elementId);
    attachKeyboardHandler(rendition, elementId);
    if (entry.dotNetRef) attachRelocatedListener(entry);

    return rendition;
}

export async function init(elementId, realisticElementId, bytes, initialCfi, fontSize, fontFamily, lineHeight, flow) {
    await ensureLibsLoaded();

    // Defensive: a byte[] interop parameter is *usually* a Uint8Array over
    // its own exactly-sized buffer, but slicing to byteOffset/byteLength
    // guards against a pooled/offset view regardless.
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const book = ePub(arrayBuffer);

    const entry = {
        book,
        fontSize,
        contentStyle: { fontFamily: fontFamily || "serif", lineHeight: lineHeight || "normal" },
        realisticElementId,
        mode: modeOf(flow),
    };
    instances.set(elementId, entry);

    // Realistic View also renders "paginated" underneath -- see modeOf.
    const rendition = setupRendition(entry, elementId, flow === "scroll" ? "scrolled" : "paginated");
    await rendition.display(initialCfi || undefined);

    if (entry.mode === "realistic") await initRealisticView(elementId);
}

// Book View <-> Scroll View <-> Realistic View (issue #174, extended by
// #189). epub.js doesn't support changing an existing rendition's flow in
// place in this vendored build (same class of "documented API doesn't
// reliably apply" surprise as themes.register() -- see buildContentRules
// above), so an actual epub.js flow change (anything involving Scroll) tears
// the current rendition down and builds a fresh one, restoring the reading
// position via CFI. Book <-> Realistic is cheaper: both use the same
// underlying "paginated" rendition (Realistic just overlays a StPageFlip
// capture on top of it), so no rebuild is needed there.
export async function setFlow(elementId, flow) {
    const entry = instances.get(elementId);
    if (!entry) return;
    const newMode = modeOf(flow);
    if (newMode === entry.mode) return;
    if (entry.mode === "realistic") teardownRealisticView(entry);

    await runSerialized(entry, async () => {
        const newEpubFlow = newMode === "scroll" ? "scrolled" : "paginated";
        if (entry.flow !== newEpubFlow) {
            const currentCfi = entry.rendition.currentLocation()?.start?.cfi;
            entry.rendition.destroy();
            const rendition = setupRendition(entry, elementId, newEpubFlow);
            await rendition.display(currentCfi || undefined);
        }
        entry.mode = newMode;
        if (newMode === "realistic") await initRealisticView(elementId);
    });
}

// Font size/family/line-height/page-width changes below always apply to the
// hidden underlying rendition (kept correct for whenever the user leaves
// Realistic View, or for the next section captureNextSection captures), but
// deliberately do *not* retroactively re-capture pages already sitting in
// entry.realistic.pages -- same honest scope cut as PDF Realistic View
// disabling zoom entirely; changing reading settings mid-flip is rare
// enough that a brief mismatch until the next section change is an
// acceptable tradeoff against the cost of a full realistic-view rebuild on
// every settings tweak.
export function setFontSize(elementId, fontSize) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.fontSize = fontSize;
    runSerialized(entry, () => entry.rendition.themes.fontSize(`${fontSize}px`));
}

export function setContentStyle(elementId, fontFamily, lineHeight) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.contentStyle = { fontFamily, lineHeight };
    runSerialized(entry, () => applyContentRules(elementId));
}

// "Page width" (see the long comment on buildContentRules above for why
// this can't just be a stylesheet rule on body like TXT/MD's page width
// is). The Blazor side changes .epub-reader-frame's own CSS width via a
// modifier class *before* calling this; epub.js's Stage does carry its
// own ResizeObserver, but it's not relied on to catch a class-driven
// resize on its own -- explicitly re-measuring is the reliable trigger.
export function resizeContent(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    runSerialized(entry, () => entry.rendition.resize());
}

// Subtle fade rather than a 3D page-curl: source spec §66 explicitly warns
// against "übertriebene Animationen" (exaggerated animations) and wants
// transitions to feel calm, not showy. Fades the frame out, swaps the page,
// then fades back in -- the CSS transition lives on .epub-reader-frame
// (app.css, PAGE_TRANSITION_MS below must match its duration), this only
// toggles the modifier class around the page turn.
//
// Waits out the fade-out's own transition time *before* calling turn(): the
// class toggle only *starts* the CSS transition, it doesn't block until the
// animation finishes, so calling turn() right after adding the class would
// swap the page mid-fade (confirmed live via a MutationObserver -- the class
// was removed again only ~55ms after being added, well before a 180ms
// transition completes) rather than while the frame is actually hidden --
// exactly the hard-cut-mid-fade this feature exists to avoid.
const PAGE_TRANSITION_MS = 180;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withPageTransition(elementId, turn) {
    // Fade only makes sense for a discrete page swap -- in Scroll View,
    // next()/prev() just scroll by roughly a screenful, and fading the whole
    // frame out mid-scroll would look like a glitch, not a page turn.
    const entry = instances.get(elementId);
    if (entry?.flow === "scrolled") {
        await turn();
        return;
    }
    const el = document.getElementById(elementId);
    el?.classList.add("epub-reader-frame--turning");
    if (el) await wait(PAGE_TRANSITION_MS);
    await turn();
    // rAF rather than turn() alone settling: gives the browser one paint
    // frame with the new (already-swapped) content still hidden, so the
    // fade-in animates onto the new page instead of flashing it in unfaded.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    el?.classList.remove("epub-reader-frame--turning");
}

// ---- Realistic View: real page-flip via StPageFlip, captured section-by-
// section (issue #189) ------------------------------------------------------
//
// Two earlier approaches were tried and abandoned before this one (see
// Roadmap.md's "EPUB Realistic View" entries for the full history):
// eagerly rendering the whole book up front doesn't scale to a 300-page
// novel (no "render page N" primitive for reflowable content, only
// "navigate to a location, then rasterize what's showing", at a real
// per-page cost); capturing one page at a time on demand (mirroring the
// live-scrolled epub.js viewport) chased a stale-coordinate race against
// epub.js's own column relayout for eight PRs and was reverted.
//
// This version captures an entire *section* in a single html2canvas call
// (epub.js lays out every column of a section in the DOM at once for its
// CSS-multi-column pagination, even the ones scrolled out of view -- a
// capture targeting the section's full scrollWidth renders all of them,
// confirmed via a live spike before writing this), then slices that one
// canvas into per-page images locally with plain canvas math. Navigating
// between pages *within* an already-captured section is then a pure local
// array lookup -- no DOM measurement, no live capture, nothing left to
// race. A new live capture only happens when crossing into a section that
// hasn't been captured yet, roughly once per chapter instead of once per
// page, which is both far less exposed to relayout timing and far cheaper
// overall for a long book.

function settlePaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Waits for every <img> in a section to finish loading before any capture
// measurement -- confirmed live (the previous per-page attempt, PR #198) as
// the actual root cause of stale captures: html2canvas can take over a
// second on an image-heavy section, long enough for epub.js's own column
// relayout to still be running underneath it as each image resolves its
// real dimensions (column count observed jumping 3->11 on the same section
// between capture attempts). A capped per-image timeout guards against an
// image that never fires load/error (e.g. a broken src) hanging this
// forever.
function waitForImagesToLoad(doc) {
    const images = Array.from(doc.images).filter((img) => !img.complete);
    if (images.length === 0) return Promise.resolve();
    return Promise.all(images.map((img) => new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, 3000);
    })));
}

function colorToRgb(cssColor) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
}

// Coarse blank-page detector -- samples a 5x5 grid rather than every pixel
// (cheap, and a genuine capture failure is either fully blank or fully
// fine, never a handful of stray correct pixels). Checked per sliced page,
// not on the raw multi-column strip, so a failure localized to one column
// (e.g. only the first column of a section actually rendered) is caught
// instead of averaged away by the other, correctly-rendered columns.
function looksBlank(canvas, backgroundColor) {
    const ctx = canvas.getContext("2d");
    const bg = colorToRgb(backgroundColor);
    const tolerance = 8;
    const cols = 5;
    const rows = 5;
    for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
            const x = Math.min(canvas.width - 1, Math.floor((canvas.width * (cx + 0.5)) / cols));
            const y = Math.min(canvas.height - 1, Math.floor((canvas.height * (cy + 0.5)) / rows));
            const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
            if (Math.abs(r - bg[0]) > tolerance || Math.abs(g - bg[1]) > tolerance || Math.abs(b - bg[2]) > tolerance) {
                return false;
            }
        }
    }
    return true;
}

function getEpubIframe(elementId) {
    return document.getElementById(elementId)?.querySelector("iframe") || null;
}

// html2canvas has no built-in timeout -- a live spike proved it CAN render a
// whole section correctly, but a direct-module test hung indefinitely on a
// later call with no thrown error (same "worker round-trip that just never
// settles" class of failure pdfReader.js already hit and wrapped, see its
// own withTimeout). Because captureCurrentSection always runs inside
// runSerialized's queue, a single stuck call would otherwise wedge *every*
// later operation on this instance forever, not just this one capture.
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Realistic View: ${label} timed out after ${ms}ms`)), ms)),
    ]);
}

const CAPTURE_MAX_ATTEMPTS = 5;
const CAPTURE_RETRY_BACKOFF_MS = 150;
const CAPTURE_TIMEOUT_MS = 15000;

// Captures the section epub.js is *currently displaying* (the hidden,
// kept-alive rendition underneath the overlay -- see initRealisticView),
// slices it into per-page images, and appends them to entry.realistic.pages.
// Must run inside runSerialized: it reads/relies on entry.rendition's
// current position, which next()/prev()/goTo() also touch.
async function captureCurrentSection(elementId, entry, sectionIndex, cfi, attempt = 1) {
    const iframe = getEpubIframe(elementId);
    if (!iframe?.contentDocument) throw new Error("Realistic View: no epub.js iframe to capture");
    const doc = iframe.contentDocument;

    await waitForImagesToLoad(doc);
    await settlePaint();

    // epub.js can swap in a fresh iframe while the two awaits above are
    // pending -- confirmed live: a plain page load straight into a
    // persisted "Realistisch" preference (the cold-start path, entry.mode
    // already "realistic" before the first capture) hit this every time,
    // throwing "Cannot read properties of null (reading 'scrollWidth')"
    // because the iframe grabbed before the awaits had already been
    // detached by the time this line ran. Its own post-display layout is
    // still settling at that point; manually switching to Realistic View
    // later in a session never hits it because epub.js has long since
    // finished settling by then. Treat a detached iframe as the same kind
    // of "layout still settling" condition as the scrollWidth check below
    // and retry the whole section instead of throwing straight to the
    // Book View fallback.
    if (!iframe.isConnected) {
        if (attempt >= CAPTURE_MAX_ATTEMPTS) throw new Error("Realistic View: epub.js iframe never settled");
        await wait(CAPTURE_RETRY_BACKOFF_MS * attempt);
        return captureCurrentSection(elementId, entry, sectionIndex, cfi, attempt + 1);
    }

    const epubContainer = iframe.closest(".epub-container") || iframe.parentElement;
    const scrollWidthBefore = epubContainer.scrollWidth;
    const clientWidth = epubContainer.clientWidth;
    const clientHeight = epubContainer.clientHeight;

    const themeStyles = getComputedStyle(document.documentElement);
    const bg = themeStyles.getPropertyValue("--color-bg-reader").trim() || "#ffffff";

    const strip = await withTimeout(
        window.html2canvas(doc.body, {
            backgroundColor: bg,
            width: scrollWidthBefore,
            windowWidth: scrollWidthBefore,
            height: clientHeight,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0,
            // html2canvas clones the target element into an off-screen
            // document before rendering it, and the clone inherits the
            // *original* body's inline `width: <one-column-width>px` --
            // confirmed live: without this, the clone's own box stays
            // pinned to one column wide regardless of the `width`/
            // `windowWidth` options above (those size the output canvas
            // and render viewport, not the cloned element's own box), so
            // everything past column 1 rendered as empty background. Only
            // column 1 is affected by the *live* rendition's real width
            // (epub.js manages that one directly) -- forcing the clone's
            // width to the full section width here is what actually makes
            // the overflowing columns render.
            onclone: (_clonedDoc, clonedBody) => {
                clonedBody.style.width = `${scrollWidthBefore}px`;
            },
        }),
        CAPTURE_TIMEOUT_MS,
        `html2canvas section ${sectionIndex}`,
    );

    // Re-check after the (relatively slow, image-heavy) capture call --
    // if epub.js's layout was still settling, retry the whole section
    // rather than slicing a strip whose width no longer matches reality.
    const scrollWidthAfter = epubContainer.scrollWidth;
    if (scrollWidthAfter !== scrollWidthBefore) {
        if (attempt >= CAPTURE_MAX_ATTEMPTS) throw new Error("Realistic View: section layout never settled");
        await wait(CAPTURE_RETRY_BACKOFF_MS * attempt);
        return captureCurrentSection(elementId, entry, sectionIndex, cfi, attempt + 1);
    }

    // epub.js's own column-width is the real page-to-page stride --
    // confirmed live via two independent sections (scrollWidth divided
    // evenly by columnWidth alone in both, 4074/1358=3 and 5432/1358=4).
    // column-gap (also present in the computed style) turned out not to
    // contribute to the container's scrollable width at all -- an earlier
    // version of this code added it to the stride on the assumption that
    // it did, which landed every slice past the first column partway into
    // dead space and read as blank.
    const bodyStyles = getComputedStyle(doc.body);
    const columnWidth = Math.round(parseFloat(bodyStyles.columnWidth)) || clientWidth;
    const stride = columnWidth;
    const numPages = Math.max(1, Math.round(scrollWidthAfter / stride));

    const images = [];
    let anyBlank = false;
    for (let i = 0; i < numPages; i++) {
        const slice = document.createElement("canvas");
        slice.width = columnWidth;
        slice.height = clientHeight;
        const ctx = slice.getContext("2d");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, columnWidth, clientHeight);
        ctx.drawImage(strip, i * stride, 0, columnWidth, clientHeight, 0, 0, columnWidth, clientHeight);
        if (looksBlank(slice, bg)) anyBlank = true;
        images.push(slice.toDataURL("image/jpeg", 0.85));
    }

    if (anyBlank) {
        if (attempt >= CAPTURE_MAX_ATTEMPTS) throw new Error("Realistic View: section captured blank after max attempts");
        await wait(CAPTURE_RETRY_BACKOFF_MS * attempt);
        return captureCurrentSection(elementId, entry, sectionIndex, cfi, attempt + 1);
    }

    const r = entry.realistic;
    if (!r.pageWidth) {
        r.pageWidth = columnWidth;
        r.pageHeight = clientHeight;
    }
    const startFlat = r.pages.length;
    r.pages.push(...images);
    r.sectionMeta.set(sectionIndex, { startFlat, count: images.length, cfi: cfi || "" });
    r.lastSectionIndex = sectionIndex;

    r.pageFlip?.updateFromImages(r.pages);
}

// Advances the real (hidden) rendition to the next spine section and
// captures it -- called both when the user's local flip cursor reaches the
// end of already-captured pages (must await this before flipping) and
// speculatively ahead of that point (maybeSchedulePrefetch, fire-and-forget)
// so a fast forward flip usually doesn't have to wait at all. Returns false
// at the end of the book.
async function captureNextSection(elementId, entry) {
    const r = entry.realistic;
    if (!r) return false;
    const total = entry.book.spine?.length || 0;
    const nextIndex = (r.lastSectionIndex ?? -1) + 1;
    if (nextIndex >= total) return false;
    const section = entry.book.spine.get(nextIndex);
    if (!section) return false;

    await entry.rendition.display(section.href);
    const loc = entry.rendition.currentLocation();
    await captureCurrentSection(elementId, entry, nextIndex, loc?.start?.cfi);
    return true;
}

// Resume/progress reporting in Realistic View is deliberately
// section-granular, not per-page: a per-page CFI would need epub.js's live
// rendition to actually visit that exact page (the very thing this design
// avoids doing on every flip). Resuming at "the start of the section you
// were reading" is an honest, explicit scope cut for a personal reading
// app, the same spirit as PDF Realistic View's own scope cuts.
function reportRealisticProgress(entry, flatIndex) {
    if (!entry.dotNetRef) return;
    const r = entry.realistic;
    if (!r) return;
    let sectionIndex = r.lastSectionIndex ?? 0;
    let cfi = "";
    for (const [idx, meta] of r.sectionMeta) {
        if (flatIndex >= meta.startFlat && flatIndex < meta.startFlat + meta.count) {
            sectionIndex = idx;
            cfi = meta.cfi;
            break;
        }
    }
    const total = entry.book.spine?.length || 1;
    const percentage = Math.max(0, Math.min(100, Math.round((sectionIndex / total) * 100)));
    entry.dotNetRef.invokeMethodAsync("OnRelocated", cfi, sectionIndex, percentage);
}

const PREFETCH_TRIGGER_PAGES_REMAINING = 2;

function maybeSchedulePrefetch(elementId, entry, flatIndex) {
    const r = entry.realistic;
    if (!r || r.prefetching) return;
    if (r.pages.length - flatIndex - 1 > PREFETCH_TRIGGER_PAGES_REMAINING) return;
    r.prefetching = true;
    runSerialized(entry, () => captureNextSection(elementId, entry))
        .catch((err) => console.error("Realistic View: background prefetch failed", err))
        .finally(() => { r.prefetching = false; });
}

async function initRealisticView(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    try {
        await initRealisticViewUnsafe(elementId, entry);
    } catch (err) {
        // A failed capture must not leave the reader stuck on an empty
        // overlay with no way out -- log loudly (matches pdfReader.js's
        // same fallback reasoning) and drop back to Book View.
        console.error("EPUB Realistic View failed to initialize, falling back to Book View:", err);
        teardownRealisticView(entry);
        entry.mode = "book";
    }
}

async function initRealisticViewUnsafe(elementId, entry) {
    await ensurePageFlipLibLoaded();
    await ensureHtml2CanvasLoaded();

    entry.realistic = {
        pages: [],
        sectionMeta: new Map(),
        lastSectionIndex: null,
        pageFlip: null,
        pageWidth: 0,
        pageHeight: 0,
        prefetching: false,
    };

    const loc = entry.rendition.currentLocation();
    const startIndex = loc?.start?.index ?? 0;
    await captureCurrentSection(elementId, entry, startIndex, loc?.start?.cfi);
    if (!instances.has(elementId)) return; // torn down while awaiting the capture

    const r = entry.realistic;
    const realisticEl = document.getElementById(entry.realisticElementId);
    if (!realisticEl) throw new Error("Realistic View: overlay element missing");

    const pageFlip = new window.St.PageFlip(realisticEl, {
        width: r.pageWidth,
        height: r.pageHeight,
        size: "fixed",
        // false (also the library's own default, kept explicit here): only
        // marks the first/last page as a single "hard cover" page rather than
        // part of a pairing -- NOT the single-vs-spread display control, despite
        // an earlier version of this comment claiming otherwise. That control
        // is usePortrait + the container-width check described below.
        showCover: false,
        // StPageFlip only ever shows one page per view (its "portrait" spread,
        // vs. a paired-up "landscape" spread) when its own measurement of this
        // container's width is narrower than 2x the configured page width --
        // see PageFlip.getSpread()/createSpread() in the vendored source. With
        // autoSize left at its default (true), the library forces this
        // container's own style.width to "100%" of its parent on every
        // construction/resize/orientation pass, silently overriding whatever
        // width we set below -- on a wide "Breit" viewport (or after any
        // window resize) that 100% comfortably exceeds 2x page width, so it
        // flips to a genuine two-up spread wider than the actual reader frame.
        // false stops the library from touching this element's width at all,
        // so the explicit sizing below actually sticks and single-page mode
        // holds across every flip and resize, not just the first render.
        autoSize: false,
        maxShadowOpacity: 0.5,
        mobileScrollSupport: false,
    });
    pageFlip.loadFromImages(r.pages);

    // Same percentage-vs-flex-item sizing interaction as PdfReader.razor's
    // realistic mode (see pdfReader.js's initRealisticViewUnsafe) --
    // StPageFlip's own auto-sizing resolves to 0x0 inside a flex container,
    // so the container is sized explicitly from the library's own reported
    // bounds instead of trusted to size itself. bounds.width is always the
    // double-page (spread) footprint even in single-page mode -- pageWidth is
    // the actual single-page width, which is what keeps this container
    // narrower than 2x page width and keeps StPageFlip's own spread
    // selection (see autoSize comment above) landing on single-page.
    const bounds = pageFlip.getBoundsRect();
    realisticEl.style.width = `${bounds.pageWidth}px`;
    realisticEl.style.height = `${bounds.height}px`;

    // Drag-follow-finger and tap-a-corner-to-turn are both StPageFlip's
    // native default interaction -- no custom gesture wiring needed.
    pageFlip.on("flip", (e) => {
        reportRealisticProgress(entry, e.data);
        maybeSchedulePrefetch(elementId, entry, e.data);
    });

    r.pageFlip = pageFlip;
    reportRealisticProgress(entry, 0);
}

function teardownRealisticView(entry) {
    entry.realistic?.pageFlip?.destroy();
    const realisticEl = document.getElementById(entry.realisticElementId);
    if (realisticEl) {
        realisticEl.style.width = "";
        realisticEl.style.height = "";
    }
    entry.realistic = null;
}

async function realisticNext(elementId, entry) {
    const r = entry.realistic;
    if (!r?.pageFlip) return;
    const current = r.pageFlip.getCurrentPageIndex();
    if (current + 1 >= r.pages.length) {
        const captured = await runSerialized(entry, () => captureNextSection(elementId, entry));
        if (!captured) return; // end of book
    }
    r.pageFlip.flipNext();
}

function realisticPrev(entry) {
    // Backward is always into already-captured territory -- entry.realistic
    // only ever grows forward, so no capture is ever needed going back.
    entry.realistic?.pageFlip?.flipPrev();
}

export async function next(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") {
        await realisticNext(elementId, entry);
        return;
    }
    await runSerialized(entry, () => withPageTransition(elementId, () => entry.rendition.next()));
}

export async function prev(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") {
        realisticPrev(entry);
        return;
    }
    await runSerialized(entry, () => withPageTransition(elementId, () => entry.rendition.prev()));
}

// Swipe-to-turn-page for mobile (source spec §14.1: "Mobile zusätzlich:
// Wischen zum Umblättern"). epub.js renders each section into its own
// same-origin iframe with its own separate document/event system, so a
// listener on the outer .epub-reader-frame div only ever sees touches on
// its padding, never on the actual rendered page -- registered via the same
// per-section content hook mechanism as buildContentRules/
// stripPiracyWatermarks instead, so it's attached inside every section's
// iframe document as it renders. Horizontal-dominant swipes only (dx greater
// than both a fixed threshold and 2x the vertical delta), so a normal
// vertical scroll/tap inside the iframe doesn't accidentally trigger a page
// turn.
const SWIPE_MIN_DISTANCE = 50;

function attachSwipeHandler(rendition, elementId) {
    rendition.hooks.content.register((contents) => {
        const doc = contents.document;
        let startX = 0;
        let startY = 0;
        doc.addEventListener("touchstart", (e) => {
            const touch = e.changedTouches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        }, { passive: true });
        doc.addEventListener("touchend", (e) => {
            const touch = e.changedTouches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;
            if (dx < 0) next(elementId);
            else prev(elementId);
        }, { passive: true });
    });
}

// Flattens epub.js's nested navigation.toc (each item can carry `subitems`)
// into a single array with a `level` field for indentation -- simpler for
// Blazor to render as a flat popover list than recreating the tree client-side.
function flattenToc(items, level) {
    return items.flatMap((item) => [
        { label: item.label.trim(), href: item.href, level },
        ...flattenToc(item.subitems || [], level + 1),
    ]);
}

export async function getToc(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return [];
    await entry.book.loaded.navigation;
    return flattenToc(entry.book.navigation.toc, 0);
}

// href comes from getToc's own output (an epub.js-internal spine-relative
// path), not user input -- rendition.display() resolves it the same way a
// next()/prev()-driven relocation would.
export async function goTo(elementId, href) {
    const entry = instances.get(elementId);
    if (!entry) return;
    await runSerialized(entry, async () => {
        await entry.rendition.display(href);
        // A TOC jump can land anywhere in the book, forward or backward of
        // whatever entry.realistic.pages currently covers -- captured pages
        // only ever grow forward from wherever Realistic View was entered
        // (see captureNextSection), so an arbitrary jump re-anchors by
        // rebuilding fresh at the new location rather than trying to splice
        // a disjoint range into the existing flat page array.
        if (entry.mode === "realistic") {
            teardownRealisticView(entry);
            await initRealisticView(elementId);
        }
    });
}

// Best-effort spine-index-based percentage -- deliberately not using
// epub.js's book.locations.generate(), which parses the entire spine on
// every open. Resume correctness relies on the CFI alone, not this number.
// Pulled out of onRelocated so setupRendition can re-attach it to a freshly
// created rendition after a Book View <-> Scroll View switch (issue #174) --
// the listener lives on the old, now-destroyed rendition otherwise, and
// progress silently stops updating.
function attachRelocatedListener(entry) {
    entry.rendition.on("relocated", (location) => {
        const index = location?.start?.index ?? 0;
        const total = entry.book.spine?.length || 1;
        const percentage = Math.max(0, Math.min(100, Math.round((index / total) * 100)));
        entry.dotNetRef.invokeMethodAsync("OnRelocated", location.start.cfi, index, percentage);
    });
}

export function onRelocated(elementId, dotNetRef) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.dotNetRef = dotNetRef;
    attachRelocatedListener(entry);
}

// Arrow-key/spacebar page navigation (issue #144, point 2). Same
// cross-document problem as the swipe handler above: keydown on the outer
// .epub-reader-frame only fires when focus is *outside* the iframe (handled
// separately, in Blazor, via a plain @onkeydown on that div) -- this
// registers a second listener per-section, inside each iframe's own
// document, for when focus has moved into the actual book content (e.g.
// after clicking into the text, or after epub.js itself moves focus there
// following a page turn).
function attachKeyboardHandler(rendition, elementId) {
    rendition.hooks.content.register((contents) => {
        contents.document.addEventListener("keydown", (e) => {
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                next(elementId);
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                prev(elementId);
            }
        });
    });
}

export function destroy(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    // Delete first so any operation still queued behind this one (see
    // runSerialized) that re-fetches from instances.get(...) sees it's
    // gone; queued here to run *after* whatever's already in flight
    // finishes instead of tearing the rendition down mid-page-turn.
    instances.delete(elementId);
    if (entry.mode === "realistic") teardownRealisticView(entry);
    runSerialized(entry, () => entry.book.destroy());
}
