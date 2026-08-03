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

// StPageFlip and html2canvas (issue #189, EPUB realistic page-flip mode)
// are both classic UMD/global scripts, lazily loaded the same way as
// epub.js/jszip above -- most reader sessions never touch realistic mode.
let pageFlipLibLoadedPromise = null;
function ensurePageFlipLibLoaded() {
    if (!pageFlipLibLoadedPromise) pageFlipLibLoadedPromise = loadScript("lib/pageflip/page-flip.browser.js");
    return pageFlipLibLoadedPromise;
}
let html2canvasLibLoadedPromise = null;
function ensureHtml2CanvasLoaded() {
    if (!html2canvasLibLoadedPromise) html2canvasLibLoadedPromise = loadScript("lib/html2canvas/html2canvas.min.js");
    return html2canvasLibLoadedPromise;
}

const instances = new Map();

// Single source of truth for which of the three rendering paths (Book View,
// Scroll View, Realistic View) owns the container -- issue #189 needed an
// explicit discriminator the same way issue #182 added one to pdfReader.js,
// since epub.js's own `flow` ("paginated"/"scrolled") isn't 1:1 with these
// three modes: Realistic View reuses a "paginated" rendition underneath
// (see initRealisticView) purely as a content/pagination engine to capture
// pages from, so `entry.flow` alone can't tell "book" and "realistic" apart.
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

    const rendition = setupRendition(entry, elementId, entry.mode === "scroll" ? "scrolled" : "paginated");
    await rendition.display(initialCfi || undefined);

    if (entry.mode === "realistic") await initRealisticView(elementId);
}

// Book View <-> Scroll View <-> Realistic View (issue #174/#189, source spec
// §14.1). epub.js doesn't support changing an existing rendition's flow in
// place in this vendored build (same class of "documented API doesn't
// reliably apply" surprise as themes.register() -- see buildContentRules
// above), so a real flow change (paginated <-> scrolled) tears the current
// rendition down and builds a fresh one instead, restoring the reading
// position via CFI (location-based, so it's meaningful in any flow).
// Realistic View reuses a "paginated" rendition underneath (see
// initRealisticView's comment) -- switching into/out of it while already
// paginated (i.e. Book <-> Realistic) skips the destroy/rebuild entirely
// and just re-displays the rendition at wherever was visually shown.
export async function setFlow(elementId, flow) {
    const entry = instances.get(elementId);
    if (!entry) return;
    await runSerialized(entry, async () => {
        const newMode = modeOf(flow);
        const resyncCfi = entry.mode === "realistic"
            ? teardownRealisticView(elementId, entry)
            : entry.rendition.currentLocation()?.start?.cfi;
        entry.mode = newMode;

        const targetFlow = newMode === "scroll" ? "scrolled" : "paginated";
        if (entry.flow !== targetFlow) {
            entry.rendition.destroy();
            const rendition = setupRendition(entry, elementId, targetFlow);
            await rendition.display(resyncCfi || undefined);
        } else {
            await entry.rendition.display(resyncCfi || undefined);
        }

        if (newMode === "realistic") await initRealisticView(elementId);
    });
}

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

// ---- Realistic View: real page-flip animation via StPageFlip (issue #189) -
// Unlike pdfReader.js's realistic mode (issue #182), which eager-renders
// every page up front because pdf.js has a real getPage(i)/render() per
// page, EPUB has no such primitive -- reflowable content is paginated
// dynamically by CSS columns, so the only way to get a page image is
// "navigate the rendition to a location, then rasterize whatever's
// currently displayed" (~735ms measured live, mostly html2canvas). Eager-
// rendering an entire novel this way would mean minutes of loading, not
// seconds -- so this captures lazily instead: only the current page is
// captured on entering the mode, forward navigation into never-visited
// territory captures on demand, and backward navigation is always into
// already-captured pages (nothing to re-render, since every visited page
// stays cached in entry.realistic.images for the rest of the session).
// The underlying rendition (kept alive, always "paginated" flow) is used
// purely as the capture source -- entry.realistic.cfis is the actual
// source of truth for "what page is the user looking at" while this mode
// is active, since backward flips through cached pages never touch the
// rendition at all and would leave its own currentLocation() stale.

// A cheap SVG <foreignObject> rasterization trick (no extra dependency)
// was tried first and found to unconditionally taint the canvas in
// Chromium regardless of content -- confirmed via a live probe against a
// real rendition's iframe before writing any of this. html2canvas does
// work, at the ~735ms/page cost noted above.
// epub.js's rendition.next()/prev()/display() promises were found live to
// resolve before the browser has actually painted the newly-navigated-to
// content -- a capture taken immediately after showed solid black (real
// content confirmed present a moment later by temporarily hiding the
// overlay). A fixed double-rAF settle (the standard "wait for a real
// paint" pattern) fixed same-section forward navigation, but was still
// too short for a fresh section load (confirmed live: resuming into a
// section that had never been rendered before -- a heavier operation,
// creating and laying out a whole new iframe -- still captured blank).
// Rather than guess a longer fixed delay that might still be wrong on a
// slower device, captureVisibleEpubPage verifies its own output and
// retries with backoff instead of trusting timing alone.
function settlePaint() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Resolves any valid CSS color string to its actual RGB by letting the
// canvas itself parse it, rather than hand-rolling a CSS color parser.
function colorToRgb(cssColor) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
}

// Samples a 5x5 grid across the page rather than scanning every pixel --
// cheap, and a real page with any text or image is extremely unlikely to
// miss every sample point by chance. A genuinely blank page (rare, but
// real -- a blank leaf between illustrations) also correctly reports
// "blank" here and is used as-is once retries are exhausted, which is the
// right outcome for that case too.
function looksBlank(canvas, backgroundColor) {
    const ctx = canvas.getContext("2d");
    const [bgR, bgG, bgB] = colorToRgb(backgroundColor);
    for (const xf of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        for (const yf of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const [r, g, b] = ctx.getImageData(Math.floor(xf * canvas.width), Math.floor(yf * canvas.height), 1, 1).data;
            if (Math.abs(r - bgR) > 8 || Math.abs(g - bgG) > 8 || Math.abs(b - bgB) > 8) return false;
        }
    }
    return true;
}

// Live-observed settle times ran close to the previous, smaller retry
// budget's cumulative wait on a fresh, image-heavy section -- widened so a
// genuinely slow section (more images, a slower device) doesn't exhaust
// retries while epub.js is still legitimately settling, at the cost of a
// longer worst-case wait before this function gives up and accepts
// whatever it has (~4s cumulative backoff across 7 retries, only ever hit
// on the rare slow case -- the common case still resolves on attempt 1-2).
const CAPTURE_MAX_ATTEMPTS = 8;
const CAPTURE_RETRY_BACKOFF_MS = 150;

async function captureVisibleEpubPage(elementId, entry, attempt = 1) {
    const container = document.getElementById(elementId);
    const epubContainer = container?.querySelector(".epub-container");
    const iframe = container?.querySelector("iframe");
    if (!epubContainer || !iframe) throw new Error("EPUB Realistic View: no rendition content to capture yet");

    // epub.js reveals successive CSS-column "pages" within a section by
    // scrolling .epub-container horizontally by one column-width per page
    // (confirmed live: .epub-container.scrollLeft stepped from 0 to
    // exactly the body's own column-width after one next() call) -- the
    // iframe itself is sized to the section's *entire* multi-column
    // width, not just the visible page, so html2canvas against the full
    // iframe body captures every column at once and has to be cropped
    // down to just the currently-scrolled-to slice.
    const scrollLeft = epubContainer.scrollLeft;
    const cropWidth = epubContainer.clientWidth;
    const cropHeight = epubContainer.clientHeight;

    // JPEG has no alpha channel -- a transparent html2canvas capture
    // (backgroundColor: null) flattens to solid black on toDataURL(),
    // confirmed live (the whole page showed as a black box). Reading the
    // theme's real reader background instead, same source buildContentRules
    // already uses for the iframe's own body background rule, so a dark
    // theme's page doesn't get a wrong white flatten either.
    const readerBackground = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-reader").trim() || "#ffffff";

    const iframeWidthBefore = iframe.clientWidth;
    const fullCanvas = await window.html2canvas(iframe.contentDocument.body, {
        width: iframeWidthBefore,
        height: iframe.clientHeight,
        useCORS: true,
        backgroundColor: readerBackground,
    });

    // html2canvas takes long enough (several hundred ms on a fresh,
    // image-heavy section -- confirmed live) that epub.js's own layout can
    // still be settling underneath it: the live iframe's width changed out
    // from under a capture mid-flight (4074px when html2canvas started its
    // clone vs. 14938px by the time it resolved, confirmed live via
    // diagnostic logging), which silently invalidates the scrollLeft/crop
    // coordinates read before the call -- html2canvas itself works from a
    // detached clone taken at start time, so it can't reflect a layout
    // change that happens after that, but this function's crop math must
    // match what the LIVE container looks like *now* to be meaningful.
    // Re-reading and comparing catches that directly, rather than only
    // catching the downstream symptom via looksBlank().
    const stale = iframe.clientWidth !== iframeWidthBefore
        || epubContainer.scrollLeft !== scrollLeft
        || epubContainer.clientWidth !== cropWidth
        || epubContainer.clientHeight !== cropHeight;
    console.error(`[DIAG capture] attempt=${attempt} stale=${stale} iframeW ${iframeWidthBefore}->${iframe.clientWidth} scrollLeft ${scrollLeft}->${epubContainer.scrollLeft}`);
    if (stale && attempt < CAPTURE_MAX_ATTEMPTS) {
        await settlePaint();
        await wait(CAPTURE_RETRY_BACKOFF_MS * attempt);
        return captureVisibleEpubPage(elementId, entry, attempt + 1);
    }

    const cropped = document.createElement("canvas");
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    const croppedCtx = cropped.getContext("2d");
    // Defensive fill before drawImage: if the crop region ever extends
    // past the source canvas (e.g. the very last, short page of a
    // section), the uncovered remainder stays a real color instead of
    // whatever toDataURL('image/jpeg') would flatten empty pixels to.
    croppedCtx.fillStyle = readerBackground;
    croppedCtx.fillRect(0, 0, cropWidth, cropHeight);
    croppedCtx.drawImage(fullCanvas, scrollLeft, 0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    if (looksBlank(cropped, readerBackground) && attempt < CAPTURE_MAX_ATTEMPTS) {
        await settlePaint();
        await wait(CAPTURE_RETRY_BACKOFF_MS * attempt);
        return captureVisibleEpubPage(elementId, entry, attempt + 1);
    }

    return { dataUrl: cropped.toDataURL("image/jpeg", 0.85), width: cropWidth, height: cropHeight };
}

function reportRealisticProgress(entry) {
    const r = entry.realistic;
    const cfi = r?.cfis[r.cursor];
    if (!r || !cfi || !entry.dotNetRef) return;
    const index = entry.book.spine?.get(cfi)?.index ?? 0;
    const total = entry.book.spine?.length || 1;
    const percentage = Math.max(0, Math.min(100, Math.round((index / total) * 100)));
    entry.dotNetRef.invokeMethodAsync("OnRelocated", cfi, index, percentage);
}

// Keeps the rendition one page ahead of what's visually shown, so a native
// StPageFlip drag/corner-tap flip (which can't await an async capture the
// way next() below does) usually lands on an already-known page instead
// of hitting the edge of what's captured so far. Best-effort: a reader
// moving faster than one capture (~735ms) can still briefly outrun this,
// same documented trade-off as pdfReader.js's realistic mode.
function schedulePrefetchNext(elementId, entry) {
    const r = entry.realistic;
    console.error(`[DIAG prefetch] called cursor=${r?.cursor} images.length=${r?.images.length} prefetching=${r?.prefetching}`);
    if (!r || r.prefetching || r.cursor + 1 < r.images.length) return;
    r.prefetching = true;
    runSerialized(entry, async () => {
        try {
            const before = entry.rendition.currentLocation()?.start?.cfi;
            await entry.rendition.next();
            const after = entry.rendition.currentLocation()?.start?.cfi;
            console.error(`[DIAG prefetch] before=${before} after=${after}`);
            if (after && after !== before) {
                await settlePaint();
                const captured = await captureVisibleEpubPage(elementId, entry);
                r.images.push(captured.dataUrl);
                r.cfis.push(after);
                r.pageFlip.updateFromImages(r.images);
                console.error(`[DIAG prefetch] pushed, images.length now=${r.images.length}`);
            }
        } catch (err) {
            console.error("EPUB Realistic View prefetch failed:", err);
        } finally {
            r.prefetching = false;
        }
    });
}

async function initRealisticView(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    try {
        await initRealisticViewUnsafe(elementId, entry);
    } catch (err) {
        // Same "never leave the reader stuck" discipline as pdfReader.js's
        // realistic mode: log loudly and leave the (already-showing,
        // already-correctly-positioned) underlying rendition as the
        // fallback rather than an overlay stuck on nothing.
        console.error("EPUB Realistic View failed to initialize, falling back to Book View:", err);
        teardownRealisticView(elementId, entry);
        entry.mode = "book";
    }
}

async function initRealisticViewUnsafe(elementId, entry) {
    await Promise.all([ensurePageFlipLibLoaded(), ensureHtml2CanvasLoaded()]);

    const overlayContainer = document.getElementById(entry.realisticElementId);
    if (!overlayContainer) throw new Error("EPUB Realistic View: overlay container not found");

    // A rendition.display() call always precedes this (init()'s own
    // display(), or setFlow()'s resync/rebuild display()) -- same paint-
    // timing race as rendition.next() below, so the same settle applies.
    await settlePaint();
    const captured = await captureVisibleEpubPage(elementId, entry);
    if (!instances.has(elementId)) return; // torn down while awaiting the capture

    const pageFlip = new window.St.PageFlip(overlayContainer, {
        width: captured.width,
        height: captured.height,
        size: "fixed",
        showCover: false,
        maxShadowOpacity: 0.5,
        mobileScrollSupport: false,
    });
    pageFlip.loadFromImages([captured.dataUrl]);

    // Same container-sizing fix as pdfReader.js's realistic mode:
    // StPageFlip's own autoSize percentage-based sizing needs a plain
    // block-flow parent to resolve against, which a flex-centered overlay
    // isn't -- read the book's own reported bounds instead of trusting it.
    const bounds = pageFlip.getBoundsRect();
    overlayContainer.style.width = `${bounds.width}px`;
    overlayContainer.style.height = `${bounds.height}px`;

    entry.realistic = {
        pageFlip,
        images: [captured.dataUrl],
        cfis: [entry.rendition.currentLocation()?.start?.cfi ?? null],
        cursor: 0,
        prefetching: false,
    };

    // Drag-follow-finger-until-release and tap-a-corner-to-turn are both
    // StPageFlip's native default interaction -- this only handles
    // reporting progress for flips the library itself drives (always into
    // already-captured territory, by the prefetch invariant above);
    // next()/prev() below update entry.realistic.cursor themselves before
    // calling the library's own flip(), rather than relying solely on
    // this event, since a forward flip into new territory needs the
    // capture to finish *before* the library is told to animate there.
    pageFlip.on("flip", (e) => {
        entry.realistic.cursor = e.data;
        reportRealisticProgress(entry);
    });

    schedulePrefetchNext(elementId, entry);
}

// Returns the CFI that was visually shown (entry.realistic.cfis[cursor]),
// for the caller to resync the underlying rendition to -- backward flips
// through cached pages never move the rendition, so its own
// currentLocation() can be stale by the time realistic mode ends.
function teardownRealisticView(elementId, entry) {
    const r = entry.realistic;
    const resyncCfi = r?.cfis[r.cursor];
    r?.pageFlip?.destroy();
    entry.realistic = null;
    const overlayContainer = document.getElementById(entry.realisticElementId);
    if (overlayContainer) {
        overlayContainer.innerHTML = "";
        overlayContainer.style.width = "";
        overlayContainer.style.height = "";
    }
    return resyncCfi;
}

async function realisticNext(elementId, entry) {
    const r = entry.realistic;
    if (!r) return;
    console.error(`[DIAG next] cursor=${r.cursor} images.length=${r.images.length}`);
    if (r.cursor + 1 < r.images.length) {
        // Already captured (prefetch, or the user paged back earlier in
        // this session) -- flip locally, no rendition/capture work at all.
        r.cursor += 1;
        r.pageFlip.flip(r.cursor);
        reportRealisticProgress(entry);
        console.error(`[DIAG next] used cached image at cursor=${r.cursor}`);
        return;
    }
    // At the frontier of what's been visited -- advance the real rendition
    // and capture what it now shows before the library can flip there.
    const before = entry.rendition.currentLocation()?.start?.cfi;
    await entry.rendition.next();
    const after = entry.rendition.currentLocation()?.start?.cfi;
    console.error(`[DIAG next] frontier before=${before} after=${after}`);
    if (!after || after === before) return; // end of book -- nothing more to turn to
    await settlePaint();
    const captured = await captureVisibleEpubPage(elementId, entry);
    r.images.push(captured.dataUrl);
    r.cfis.push(after);
    r.pageFlip.updateFromImages(r.images);
    r.cursor += 1;
    r.pageFlip.flip(r.cursor);
    reportRealisticProgress(entry);
    schedulePrefetchNext(elementId, entry);
}

function realisticPrev(elementId, entry) {
    const r = entry.realistic;
    if (!r || r.cursor <= 0) return;
    // Backward is always into already-captured territory by construction
    // (every page the cursor could have come from is still in the cache).
    r.cursor -= 1;
    r.pageFlip.flip(r.cursor);
    reportRealisticProgress(entry);
}

export async function next(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") {
        await runSerialized(entry, () => realisticNext(elementId, entry));
        return;
    }
    await runSerialized(entry, () => withPageTransition(elementId, () => entry.rendition.next()));
}

export async function prev(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") {
        await runSerialized(entry, () => realisticPrev(elementId, entry));
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
    await runSerialized(entry, () => entry.rendition.display(href));
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
    if (entry.mode === "realistic") teardownRealisticView(elementId, entry);
    runSerialized(entry, () => entry.book.destroy());
}
