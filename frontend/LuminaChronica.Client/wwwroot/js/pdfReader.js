// Wraps vendored pdf.js (wwwroot/lib/pdfjs/) for the Reader page's PDF
// branch. Modern pdf.js (v4+) only ships ES module builds -- no UMD/classic
// script build exists anymore -- so this file is loaded as a module (same
// dynamic import() mechanism already used for scrollTracker.js/blobUrl.js)
// and imports pdf.min.mjs directly via a relative specifier, rather than
// the <script>-injection approach epubReader.js uses for epub.js's UMD build.
import * as pdfjsLib from "../lib/pdfjs/pdf.min.mjs";

// Resolved relative to *this module's own URL* (import.meta.url), not the
// page URL or a leading-slash absolute path -- the same class of bug as
// issue #38 (works at dotnet run's "/" base href, silently breaks on the
// deployed "/lumina-chronica/" subpath) if done wrong.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../lib/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

// StPageFlip (issue #182, realistic page-flip mode) is a classic UMD script
// (global `St.PageFlip`), same lazy <script>-injection pattern epubReader.js
// uses for epub.js -- most reader sessions never touch realistic mode, so
// it isn't referenced from index.html.
let pageFlipLibLoadedPromise = null;
function ensurePageFlipLibLoaded() {
    if (!pageFlipLibLoadedPromise) {
        pageFlipLibLoadedPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "lib/pageflip/page-flip.browser.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load page-flip.browser.js"));
            document.head.appendChild(script);
        });
    }
    return pageFlipLibLoadedPromise;
}

const instances = new Map();

// Capped at 2 even on 3x-DPR displays -- quadruples-not-nonuples the
// render/memory cost per step past that, for a sharpness gain that's
// negligible at normal reading distance. Confirmed live via code read (no
// devicePixelRatio anywhere in this file, canvas.width was always set
// straight from the CSS-pixel viewport size) -- every canvas rendered here
// was under-resolved on any scaled/HiDPI display, not just when zoomed.
const OUTPUT_SCALE = Math.min(window.devicePixelRatio || 1, 2);

// Standard pdf.js HiDPI pattern: the canvas *bitmap* (width/height
// attributes) is sized in real device pixels, its *displayed* CSS size is
// pinned back down to the logical viewport size via style.width/height (an
// unstyled canvas otherwise displays at its attribute size, which would
// make the page render OUTPUT_SCALE times too big on screen), and the
// render transform scales pdf.js's drawing commands up to match the larger
// bitmap.
function sizeCanvasForViewport(canvas, viewport) {
    canvas.width = Math.floor(viewport.width * OUTPUT_SCALE);
    canvas.height = Math.floor(viewport.height * OUTPUT_SCALE);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    // null, not undefined -- matches pdf.js's own documented usage of this
    // parameter (`transform: null` means "no extra transform"). `undefined
    // !== null`, so an internal `transform !== null` check (rather than a
    // truthiness check) would treat undefined as "yes, a transform was
    // given" and then fail trying to use it as a 6-element matrix.
    return OUTPUT_SCALE !== 1 ? [OUTPUT_SCALE, 0, 0, OUTPUT_SCALE, 0, 0] : null;
}

// Zoom/Seitenbreite growing the frame past the viewport used to leave the
// browser's default scrollLeft/Top of 0 in place (flush top-left) even
// though app.css's grid centering makes the full overflow reachable in
// both directions -- confirmed live that CSS alignment alone only controls
// whether the centered position *can* be scrolled to, not where the scroll
// position starts after a resize. Called after every render that could
// have changed the frame's size.
function centerScroll(elementId, { vertical = true } = {}) {
    const container = document.getElementById(elementId);
    const viewport = container?.parentElement;
    if (!viewport) return;
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    if (vertical) viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
}

// Single source of truth for which of the three rendering paths (Book View,
// Scroll View, Realistic View) owns the container -- issue #182 replaced the
// previous entry.pageWrappers-truthy check (a de-facto two-mode discriminator)
// with this explicit field once a third mode needed to fit in, so next/prev/
// goToPage/setZoom/destroy don't have to guess from which optional fields
// happen to be populated.
function modeOf(flow) {
    return flow === "scroll" ? "scroll" : flow === "realistic" ? "realistic" : "book";
}

function getAvailableSize(elementId) {
    const container = document.getElementById(elementId);
    // The frame is CSS width/height: fit-content (Book View) so it visually
    // hugs whatever shape the rendered page turns out to be -- querying
    // *its* clientWidth/Height would be circular. The available space to
    // fit into is instead the frame's parent, .pdf-reader-viewport, which
    // has a real CSS-determined size independent of its content.
    const availableEl = container?.parentElement || container;
    return { width: availableEl?.clientWidth || 600, height: availableEl?.clientHeight || 800 };
}

// ---- Book View: one canvas, swapped on next()/prev() ----------------------

async function renderPage(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;

    // pdf.js throws if render() is called again on the same canvas while a
    // previous render is still in flight -- easy to trigger by clicking the
    // zoom +/- buttons (or page nav) faster than a page takes to render.
    // Rather than cancelling in-flight work (racy: pdf.js's own conflict
    // check runs synchronously before the cancellation could take effect),
    // callers that arrive while a render is running just mark "render again
    // once this one finishes" and return; the in-flight render loops to
    // pick up the latest zoom/page once done, so rapid clicks coalesce into
    // a single final render instead of queuing up a visible backlog.
    if (entry.rendering) {
        entry.renderPending = true;
        return;
    }
    entry.rendering = true;
    try {
        do {
            entry.renderPending = false;
            await renderCurrentPage(elementId);
        } while (entry.renderPending && instances.has(elementId));
    } finally {
        if (instances.has(elementId)) entry.rendering = false;
    }
}

async function renderCurrentPage(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    const container = document.getElementById(elementId);
    if (!container) return;

    const { width: availableWidth, height: availableHeight } = getAvailableSize(elementId);

    const page = await entry.doc.getPage(entry.currentPage);
    const unscaledViewport = page.getViewport({ scale: 1 });
    // Fit within both the available width AND height so the whole page is
    // visible without cropping/scrolling, regardless of the PDF's own page
    // aspect ratio (portrait, landscape, wide illustrated pages, etc).
    // `entry.zoom` multiplies onto this fit scale afterwards -- 1 means
    // "fit to screen", not "100% of the PDF's native size" -- so text that's
    // too small at fit-to-screen (a common complaint with scanned/A4 pages
    // on a wide monitor) can be zoomed in without the viewport clientWidth/
    // Height measurement above shrinking to match (it's read from the fixed
    // -size viewport, not the fit-content frame, so it stays stable even
    // once zooming makes the frame larger than the viewport and scrollable).
    const fitScale = Math.min(availableWidth / unscaledViewport.width, availableHeight / unscaledViewport.height);
    const viewport = page.getViewport({ scale: fitScale * entry.zoom });

    let canvas = container.querySelector("canvas");
    if (!canvas) {
        canvas = document.createElement("canvas");
        container.appendChild(canvas);
    }
    const transform = sizeCanvasForViewport(canvas, viewport);

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport, transform }).promise;
}

// ---- Scroll View: every page its own wrapper, lazily rendered -------------
// Issue #174, source spec §14.1. Rendering all pages' canvases up front
// would be slow and memory-heavy for anything but a short document, so each
// page is a placeholder-sized wrapper div until it scrolls near the visible
// area (IntersectionObserver, generous rootMargin so the next page is
// usually already drawn by the time it's reached, not right as it crosses
// the edge) -- once rendered, a canvas is never torn back down; for a
// personal reading app read start-to-finish this is an acceptable, honest
// scope cut rather than building full virtualized recycling.

function teardownScrollObservers(entry) {
    entry.renderObserver?.disconnect();
    entry.currentPageObserver?.disconnect();
    entry.renderObserver = null;
    entry.currentPageObserver = null;
}

async function renderScrollPage(elementId, pageNumber) {
    const entry = instances.get(elementId);
    if (!entry || entry.renderedPages.has(pageNumber)) return;
    entry.renderedPages.add(pageNumber);

    const wrapper = entry.pageWrappers[pageNumber - 1];
    if (!wrapper) return;

    const page = await entry.doc.getPage(pageNumber);
    const { width: availableWidth, height: availableHeight } = getAvailableSize(elementId);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const fitScale = Math.min(availableWidth / unscaledViewport.width, availableHeight / unscaledViewport.height);
    const viewport = page.getViewport({ scale: fitScale * entry.zoom });

    const canvas = document.createElement("canvas");
    const transform = sizeCanvasForViewport(canvas, viewport);
    wrapper.appendChild(canvas);

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport, transform }).promise;
}

async function initScrollView(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    const container = document.getElementById(elementId);
    if (!container) return;

    // Re-entrant: called on every zoom change while already in scroll mode
    // (see setZoom), not just on the book->scroll transition -- without this,
    // each zoom click would leak the previous pass's two IntersectionObservers
    // (left holding references to the wrapper elements just cleared below).
    teardownScrollObservers(entry);

    container.innerHTML = "";
    container.classList.add("pdf-reader-frame--scroll");

    const { width: availableWidth, height: availableHeight } = getAvailableSize(elementId);

    entry.pageWrappers = [];
    entry.renderedPages = new Set();

    for (let i = 1; i <= entry.doc.numPages; i++) {
        const page = await entry.doc.getPage(i);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const fitScale = Math.min(availableWidth / unscaledViewport.width, availableHeight / unscaledViewport.height);
        const viewport = page.getViewport({ scale: fitScale * entry.zoom });

        const wrapper = document.createElement("div");
        wrapper.className = "pdf-reader-page";
        wrapper.dataset.page = String(i);
        wrapper.style.width = `${viewport.width}px`;
        wrapper.style.height = `${viewport.height}px`;
        container.appendChild(wrapper);
        entry.pageWrappers.push(wrapper);
    }

    entry.renderObserver = new IntersectionObserver((observed) => {
        for (const obs of observed) {
            if (obs.isIntersecting) renderScrollPage(elementId, parseInt(obs.target.dataset.page, 10));
        }
    }, { root: container.parentElement, rootMargin: "100% 0px" });
    entry.pageWrappers.forEach((el) => entry.renderObserver.observe(el));

    // "Current page" for progress tracking -- whichever page's wrapper has
    // the largest visible overlap with the viewport right now (a standard
    // scrollspy pattern), reported to Blazor the same way onRelocated
    // reports EPUB progress.
    entry.currentPageObserver = new IntersectionObserver((observed) => {
        let best = null;
        for (const obs of observed) {
            if (obs.isIntersecting && (!best || obs.intersectionRatio > best.intersectionRatio)) best = obs;
        }
        if (best) {
            const page = parseInt(best.target.dataset.page, 10);
            if (page !== entry.currentPage) {
                entry.currentPage = page;
                entry.dotNetRef?.invokeMethodAsync("OnScrolled", page, entry.doc.numPages);
            }
        }
    }, { root: container.parentElement, threshold: [0.5] });
    entry.pageWrappers.forEach((el) => entry.currentPageObserver.observe(el));

    entry.pageWrappers[entry.currentPage - 1]?.scrollIntoView({ block: "start" });
    // scrollIntoView doesn't guarantee the IntersectionObserver has already
    // fired by the time this returns, so the initially-requested page is
    // rendered directly rather than waiting on the observer's first pass.
    await renderScrollPage(elementId, entry.currentPage);
}

async function teardownToBookView(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    teardownScrollObservers(entry);
    const container = document.getElementById(elementId);
    if (container) {
        container.classList.remove("pdf-reader-frame--scroll");
        container.innerHTML = "";
    }
    entry.pageWrappers = null;
    entry.renderedPages = null;
    await renderPage(elementId);
}

// A pdf.js worker round-trip (getPage(), page.render().promise) was found
// live to sometimes never settle -- main thread stayed responsive, nothing
// thrown, just a promise that neither resolved nor rejected. Every such
// call in Realistic View's render pass is wrapped in this so a stuck call
// fails loudly (and gets caught by initRealisticView's fallback to Book
// View) instead of hanging the reader forever with no escape.
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Realistic View: ${label} timed out after ${ms}ms`)), ms)),
    ]);
}

// ---- Realistic View: real page-flip animation via StPageFlip (issue #182) -
// Every page is rendered to a canvas/dataURL image up front, unlike Scroll
// View's lazy IntersectionObserver-driven rendering -- StPageFlip's
// loadFromImages wants the whole book's page count and images available
// immediately to compute layout, not a placeholder it can fill in later.
// An honest scope cut for a personal-library reader (same spirit as Scroll
// View's own "acceptable scope cut" comment above): a very long scanned
// book will show a brief "wird vorbereitet" pause on entering this mode,
// not attempt incremental/virtualized loading.
async function renderAllPagesAsImages(elementId) {
    const entry = instances.get(elementId);
    const { width: availableWidth, height: availableHeight } = getAvailableSize(elementId);

    // Every page uses the *first* page's fitted size -- a real bound book
    // has one uniform page size regardless of what's printed on each page,
    // and StPageFlip's width/height are fixed for the whole book, not
    // configurable per page.
    console.log("[realistic] fetching page 1");
    const firstPage = await withTimeout(entry.doc.getPage(1), 15000, "getPage(1)");
    const firstUnscaled = firstPage.getViewport({ scale: 1 });
    const fitScale = Math.min(availableWidth / firstUnscaled.width, availableHeight / firstUnscaled.height);
    const pageWidth = Math.round(firstUnscaled.width * fitScale);
    const pageHeight = Math.round(firstUnscaled.height * fitScale);

    const images = [];
    for (let i = 1; i <= entry.doc.numPages; i++) {
        console.log(`[realistic] rendering page ${i}/${entry.doc.numPages}`);
        const page = i === 1 ? firstPage : await withTimeout(entry.doc.getPage(i), 15000, `getPage(${i})`);
        const unscaledViewport = page.getViewport({ scale: 1 });
        // Pages with a different aspect ratio than the first (mixed
        // portrait/landscape scans) are centered on a white page rather
        // than stretched to fit, so content is never distorted.
        //
        // OUTPUT_SCALE headroom baked into the *asset* here (not into
        // StPageFlip's displayed size, set separately by buildPageFlip)
        // -- same HiDPI reasoning as sizeCanvasForViewport above. Deliberately
        // NOT also baking in headroom for zoom beyond 100%: this render pass
        // already intermittently hits its own 15s per-page timeout on real
        // documents (see withTimeout below), and multiplying every page's
        // pixel area by the zoom range on top of OUTPUT_SCALE would make
        // that worse, not better. Zooming in Realistic View past 100% will
        // still show some upscale softening -- a smaller, more honest
        // regression than today's CSS-transform-scaled blur at every zoom
        // level including 100%.
        const assetWidth = Math.round(pageWidth * OUTPUT_SCALE);
        const assetHeight = Math.round(pageHeight * OUTPUT_SCALE);
        const assetContentScale = Math.min(assetWidth / unscaledViewport.width, assetHeight / unscaledViewport.height);
        const assetContentViewport = page.getViewport({ scale: assetContentScale });

        const canvas = document.createElement("canvas");
        canvas.width = assetWidth;
        canvas.height = assetHeight;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, assetWidth, assetHeight);
        context.translate((assetWidth - assetContentViewport.width) / 2, (assetHeight - assetContentViewport.height) / 2);
        await withTimeout(
            page.render({ canvasContext: context, viewport: assetContentViewport }).promise,
            15000,
            `page ${i} render()`,
        );

        // JPEG, not PNG: these images never leave the tab (no re-compression
        // artifacts compound across saves) and a full illustrated book's
        // worth of PNG dataURLs would be a multiple of the JPEG memory cost
        // for a difference invisible at page-flip scale.
        images.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return { images, pageWidth, pageHeight };
}

async function initRealisticView(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    const container = document.getElementById(elementId);
    if (!container) return;

    try {
        await initRealisticViewUnsafe(elementId, entry, container);
    } catch (err) {
        // A stuck/failed render must not leave the reader on an infinite
        // "wird vorbereitet" spinner with no way out -- log loudly (this is
        // what actually diagnosed the issue during development, a hang
        // with a responsive main thread and no thrown error otherwise
        // leaves nothing to look at) and fall back to Book View, which
        // renderPage() inside teardownToBookView can always draw from the
        // same entry.doc regardless of what failed above.
        console.error("Realistic View failed to initialize, falling back to Book View:", err);
        // teardownRealisticView handles a pageFlip instance that may or may
        // not have been created yet (optional chaining) and always clears
        // the --realistic class/inline size it or the CSS-collapse fix
        // above may have already applied, regardless of which step failed.
        teardownRealisticView(elementId, entry);
        entry.mode = "book";
        await teardownToBookView(elementId);
        // Tells PdfReader.razor's ReaderMode/_readerMode to correct
        // themselves to "book" -- without this, the Ansicht toggle kept
        // showing Realistisch as active while a single Book View page was
        // what actually rendered, which reads exactly like "half the book
        // is missing" to anyone expecting the two-page spread (confirmed
        // live: this was reported as a display bug, not recognized as the
        // documented silent-fallback gap it actually was).
        entry.dotNetRef?.invokeMethodAsync("OnRealisticViewUnavailable");
        // failure path; a real fix would add a callback symmetrical to
        // onScrolled/onRelocated.
    }
}

async function initRealisticViewUnsafe(elementId, entry, container) {
    console.log("[realistic] loading page-flip.browser.js");
    await withTimeout(ensurePageFlipLibLoaded(), 15000, "page-flip.browser.js load");
    console.log("[realistic] page-flip.browser.js loaded, rendering pages");
    teardownScrollObservers(entry);
    container.classList.remove("pdf-reader-frame--scroll");
    container.classList.add("pdf-reader-frame--realistic");
    container.innerHTML = "";
    entry.pageWrappers = null;
    entry.renderedPages = null;

    const { images, pageWidth, pageHeight } = await renderAllPagesAsImages(elementId);
    if (!instances.has(elementId)) return; // torn down while awaiting renders

    // Cached so a later zoom change (see resizeRealisticFlip) can rebuild
    // the flip UI from these same images instead of re-running the PDF
    // render pass above -- pageWidth/Height are the *fit-to-box* size at
    // zoom 1, before OUTPUT_SCALE/zoom are applied.
    entry.realisticImages = images;
    entry.realisticBaseWidth = pageWidth;
    entry.realisticBaseHeight = pageHeight;

    buildPageFlip(elementId, entry, Math.round(pageWidth * entry.zoom), Math.round(pageHeight * entry.zoom));
    entry.pageFlip.turnToPage(entry.currentPage - 1);
}

// Confirmed live (synthetic test against the real vendored library, not
// just the docs): PageFlip.destroy() removes whatever element it was
// constructed on *from its parent entirely*, not just that element's own
// children -- calling it directly on `container` (the elementId div Blazor
// renders and tracks via interop) would silently rip a live element out of
// Blazor's DOM without Blazor ever knowing. A fresh, disposable JS-owned
// child ("host") absorbs that removal instead; the same test confirmed
// `container` and its interop identity survive any number of destroy/
// rebuild cycles this way, and that turnToPage() after rebuilding on the
// same cached images lands back on the exact page it was on before (both
// in well under a millisecond -- rebuilding is cheap; only the PDF render
// pass in renderAllPagesAsImages is not).
function buildPageFlip(elementId, entry, width, height) {
    const container = document.getElementById(elementId);
    if (!container) return;
    const host = document.createElement("div");
    container.appendChild(host);
    entry.realisticHost = host;

    // StPageFlip decides portrait (one page) vs. landscape (two-page spread)
    // exactly once, at construction, by comparing `host`'s *current* CSS
    // width against 2x the single-page width above -- confirmed live
    // against the real vendored library. `container` at this point is
    // whatever a previous build left it at (or unsized on the very first
    // build), almost always narrower than a real two-page spread needs, so
    // without this it locks portrait mode permanently regardless of how
    // much actual room the viewport has -- reported live as "zeigt nur
    // rechte Seite und die linke nicht" (the book never gets a chance to
    // show as an open two-page spread at all). Pre-sizing `container` to
    // the real available viewport space *before* constructing PageFlip
    // lets it measure genuine room and choose correctly; applyBounds()
    // below then shrinks `container` back down to the book's actual
    // rendered size once the real decision has been made, same as before.
    const { width: availableWidth } = getAvailableSize(elementId);
    container.style.width = `${Math.max(availableWidth, width)}px`;
    container.style.height = `${height}px`;

    const pageFlip = new window.St.PageFlip(host, {
        width,
        height,
        size: "fixed",
        showCover: true,
        maxShadowOpacity: 0.5,
        mobileScrollSupport: false,
    });
    pageFlip.loadFromImages(entry.realisticImages);

    // Drag-follow-finger-until-release and tap-a-corner-to-turn (source
    // request, issue #182) are both StPageFlip's native default interaction
    // -- no custom gesture wiring needed here. Re-registered on every
    // rebuild since destroy() above tore down the previous instance's own
    // listener along with it.
    pageFlip.on("flip", (e) => {
        entry.currentPage = e.data + 1;
        entry.dotNetRef?.invokeMethodAsync("OnScrolled", entry.currentPage, entry.doc.numPages);
    });

    entry.pageFlip = pageFlip;

    // StPageFlip's own autoSize/size:"fixed" container sizing sets
    // width:100%/max-width on `host` and expects a plain block-flow parent
    // to resolve that percentage against -- .pdf-reader-frame is a flex
    // item here (its base rule is display:flex), so width:auto on a flex
    // item is shrink-to-fit, not fill-container, and with nothing else to
    // size against, the library's own inline style resolves to 0x0
    // (confirmed live: .stf__wrapper's padding-bottom aspect-ratio trick had
    // nothing to size relative to). Explicitly sizing `container` (not
    // `host`, which StPageFlip already sizes itself) from the book's own
    // reported bounds sidesteps that percentage-vs-flex interaction
    // entirely, matching this file's existing pattern elsewhere of
    // computing sizes itself rather than trusting a vendored library's
    // "auto" behavior against an unknown surrounding layout.
    //
    // getBoundsRect().width is ALWAYS the two-page-spread width (2x the
    // single page width passed to the constructor), even when the library
    // has decided to render a single page in "portrait" orientation (e.g.
    // a book with an odd page count, or a container too narrow for a
    // spread) -- confirmed live against the real vendored library: sizing
    // `container` to the full spread width while StPageFlip paints a
    // single portrait page stretches that page vertically to fill the
    // extra width and preserve its aspect ratio, roughly doubling its
    // rendered height and leaving it clipped top/bottom by this frame's
    // overflow:hidden -- reported live as "only half the book shown,
    // shifted right". `bounds.pageWidth` is the single-page width the
    // formula already computes; using it instead of `bounds.width` in
    // portrait mode gives the page the width it actually needs, which
    // measured live also self-corrects the height back to `bounds.height`
    // with no separate fix needed there.
    applyBounds();
    // The library can flip orientation again after this initial build (its
    // own resize handling reacts even in size:"fixed" mode, confirmed live
    // by shrinking `container` post-build and watching the canvas repaint
    // at the corrected size) -- without this listener, a later orientation
    // change would leave `container` sized for whichever orientation was
    // current at build time, reintroducing the same stretched/clipped page.
    pageFlip.on("changeOrientation", applyBounds);

    function applyBounds() {
        const bounds = pageFlip.getBoundsRect();
        const isPortrait = pageFlip.getOrientation() === "portrait";
        container.style.width = `${isPortrait ? bounds.pageWidth : bounds.width}px`;
        container.style.height = `${bounds.height}px`;
    }
}

// Rebuilds the flip UI at a new pixel size from the already-rendered
// images cached in initRealisticViewUnsafe -- no PDF re-render, so this
// stays cheap enough to run on every +/- click (see buildPageFlip's
// comment for the measured cost). Replaces an earlier CSS
// transform:scale() approach: that visually stretched an already-fixed-
// resolution render (blurrier at every step past 100%, worse than the
// honest softening documented in renderAllPagesAsImages), fought
// app.css's centering (transform doesn't participate in layout, so the
// viewport had nothing but the *pre-scale* box to center against), and
// desynced StPageFlip's own drag/flip-progress math from the visual size
// a transform paints without changing layout. Rebuilding at the real
// target size avoids all three: genuine geometry, no separate centering
// case needed, and StPageFlip's pointer math is never out of step with
// what's on screen because nothing above it lies about the size.
function resizeRealisticFlip(elementId, entry) {
    if (!entry.pageFlip || !entry.realisticImages) return;
    const page = entry.currentPage;
    entry.pageFlip.destroy(); // also removes entry.realisticHost from the DOM -- see buildPageFlip
    buildPageFlip(elementId, entry, Math.round(entry.realisticBaseWidth * entry.zoom), Math.round(entry.realisticBaseHeight * entry.zoom));
    entry.pageFlip.turnToPage(page - 1);
    centerScroll(elementId);
}

function teardownRealisticView(elementId, entry) {
    entry.pageFlip?.destroy();
    entry.pageFlip = null;
    entry.realisticHost = null;
    entry.realisticImages = null;
    const container = document.getElementById(elementId);
    if (container) {
        container.classList.remove("pdf-reader-frame--realistic");
        // Undo the explicit pixel size set in buildPageFlip -- Book/Scroll
        // View both size themselves via CSS (fit-content / auto), and a
        // leftover inline width/height would pin them to whatever page
        // size the book happened to be showing in Realistic View.
        container.style.width = "";
        container.style.height = "";
    }
}

export async function init(elementId, bytes, initialPage, initialZoom, flow, dotNetRef) {
    // Same interop-buffer gotcha as epubReader.js: bytes.buffer is a
    // reused/pooled buffer, not the exact call data -- must slice first.
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = Math.min(Math.max(initialPage || 1, 1), doc.numPages);

    // dotNetRef must be registered *before* the realistic/scroll branch
    // below, not just via the separate onScrolled() call PdfReader.razor.cs
    // makes after init() returns -- confirmed live: when "realistic" is the
    // *initial* mode (a persisted setting from a previous session, the
    // common case), initRealisticView's failure/fallback path runs inside
    // this same call, before onScrolled() ever gets a chance to run. Without
    // dotNetRef set here already, entry.dotNetRef?.invokeMethodAsync(...) in
    // that fallback path silently no-ops (optional chaining on undefined),
    // leaving the Ansicht toggle stuck on "Realistisch" -- confirmed live on
    // the deployed reader, this was the actual reason PR #214's fix appeared
    // not to work: it only ever fired for a fallback triggered by a *later*
    // setFlow() call, once onScrolled() had already registered the ref.
    instances.set(elementId, { doc, currentPage: page, zoom: initialZoom > 0 ? initialZoom : 1, mode: modeOf(flow), dotNetRef });

    if (flow === "scroll") {
        await initScrollView(elementId);
    } else if (flow === "realistic") {
        await initRealisticView(elementId);
    } else {
        await renderPage(elementId);
    }

    return doc.numPages;
}

// Book View <-> Scroll View <-> Realistic View (issue #174, extended by
// #182). pdf.js has no "flow" concept of its own -- this just switches which
// of the three rendering paths above owns the container, preserving the
// current page.
export async function setFlow(elementId, flow) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") teardownRealisticView(elementId, entry);
    entry.mode = modeOf(flow);
    if (flow === "scroll") {
        await initScrollView(elementId);
    } else if (flow === "realistic") {
        await initRealisticView(elementId);
    } else {
        await teardownToBookView(elementId);
    }
}

export function onScrolled(elementId, dotNetRef) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.dotNetRef = dotNetRef;
}

export async function setZoom(elementId, zoom) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.zoom = zoom;
    if (entry.mode === "realistic") {
        resizeRealisticFlip(elementId, entry);
        return;
    }
    // Simplest correct approach for scroll mode: every wrapper's size and
    // every already-rendered canvas depend on zoom, so rebuilding the whole
    // scroll view is far less code than incrementally resizing/re-rendering
    // in place -- and zoom clicks are an infrequent, deliberate action, not
    // a hot path worth optimizing.
    if (entry.mode === "scroll") {
        await initScrollView(elementId);
    } else {
        await renderPage(elementId);
    }
    centerScroll(elementId, { vertical: entry.mode !== "scroll" });
}

// Seitenbreite (page width) changes the *available* box (see
// getAvailableSize's viewport measurement), so unlike zoom -- which only
// grows/shrinks the fit scale within the same box -- every mode needs a
// genuine re-render against the new size, not just a resize. Confirmed
// live as the actual root cause of a reported bug: without this, changing
// Seitenbreite only ever resized the empty .pdf-reader-viewport around a
// canvas that was still sized for the *previous* width, which app.css's
// min-width:fit-content fix (see comment there) then exposed as reachable
// overflow instead of silently clipping -- but the canvas itself never
// re-fit the new box until some other action (zoom, page turn) happened to
// trigger a re-render.
export async function resize(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "scroll") {
        await initScrollView(elementId);
    } else if (entry.mode === "realistic") {
        // Unlike zoom, this really does need the PDF re-rendered (the fit
        // box itself changed, not just the scale within it) -- acceptable
        // since Seitenbreite is a rare, deliberate setting change, not a
        // hot path like the zoom +/- buttons.
        teardownRealisticView(elementId, entry);
        await initRealisticView(elementId);
    } else {
        await renderPage(elementId);
    }
    centerScroll(elementId, { vertical: entry.mode !== "scroll" });
}

export function getCurrentPage(elementId) {
    return instances.get(elementId)?.currentPage ?? 1;
}

export async function next(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") {
        entry.pageFlip?.flipNext();
        return;
    }
    if (entry.currentPage >= entry.doc.numPages) return;
    entry.currentPage += 1;
    if (entry.mode === "scroll") {
        entry.pageWrappers[entry.currentPage - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
        await renderPage(elementId);
    }
}

export async function prev(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (entry.mode === "realistic") {
        entry.pageFlip?.flipPrev();
        return;
    }
    if (entry.currentPage <= 1) return;
    entry.currentPage -= 1;
    if (entry.mode === "scroll") {
        entry.pageWrappers[entry.currentPage - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
        await renderPage(elementId);
    }
}

export async function goToPage(elementId, page) {
    const entry = instances.get(elementId);
    if (!entry) return 1;
    const target = Math.min(Math.max(page, 1), entry.doc.numPages);
    if (target !== entry.currentPage) {
        entry.currentPage = target;
        if (entry.mode === "realistic") {
            entry.pageFlip?.flip(target - 1);
        } else if (entry.mode === "scroll") {
            entry.pageWrappers[target - 1]?.scrollIntoView({ block: "start" });
        } else {
            await renderPage(elementId);
        }
    }
    return entry.currentPage;
}

export function destroy(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    // Delete first so a render loop still in flight for this instance (see
    // renderPage's coalescing loop) observes instances.has(elementId) as
    // false and stops after its current pass instead of racing doc.destroy()
    // below. Optional chaining guards the same in-flight-teardown window on
    // entry.doc itself.
    instances.delete(elementId);
    teardownScrollObservers(entry);
    teardownRealisticView(elementId, entry);
    entry.doc?.destroy?.();
}
