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

const instances = new Map();

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
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
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
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    wrapper.appendChild(canvas);

    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
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

export async function init(elementId, bytes, initialPage, initialZoom, flow) {
    // Same interop-buffer gotcha as epubReader.js: bytes.buffer is a
    // reused/pooled buffer, not the exact call data -- must slice first.
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = Math.min(Math.max(initialPage || 1, 1), doc.numPages);

    instances.set(elementId, { doc, currentPage: page, zoom: initialZoom > 0 ? initialZoom : 1 });

    if (flow === "scroll") {
        await initScrollView(elementId);
    } else {
        await renderPage(elementId);
    }

    return doc.numPages;
}

// Book View <-> Scroll View (issue #174). pdf.js has no "flow" concept of
// its own -- unlike epub.js, this just switches which of the two rendering
// paths above owns the container, preserving the current page.
export async function setFlow(elementId, flow) {
    const entry = instances.get(elementId);
    if (!entry) return;
    if (flow === "scroll") {
        await initScrollView(elementId);
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
    // Simplest correct approach for scroll mode: every wrapper's size and
    // every already-rendered canvas depend on zoom, so rebuilding the whole
    // scroll view is far less code than incrementally resizing/re-rendering
    // in place -- and zoom clicks are an infrequent, deliberate action, not
    // a hot path worth optimizing.
    if (entry.pageWrappers) {
        await initScrollView(elementId);
    } else {
        await renderPage(elementId);
    }
}

export function getCurrentPage(elementId) {
    return instances.get(elementId)?.currentPage ?? 1;
}

export async function next(elementId) {
    const entry = instances.get(elementId);
    if (!entry || entry.currentPage >= entry.doc.numPages) return;
    entry.currentPage += 1;
    if (entry.pageWrappers) {
        entry.pageWrappers[entry.currentPage - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
        await renderPage(elementId);
    }
}

export async function prev(elementId) {
    const entry = instances.get(elementId);
    if (!entry || entry.currentPage <= 1) return;
    entry.currentPage -= 1;
    if (entry.pageWrappers) {
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
        if (entry.pageWrappers) {
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
    entry.doc?.destroy?.();
}
