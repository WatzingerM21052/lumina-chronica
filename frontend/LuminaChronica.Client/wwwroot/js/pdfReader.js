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

async function renderPage(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    const container = document.getElementById(elementId);
    if (!container) return;

    // The frame (`container`) is CSS `width/height: fit-content` so it
    // visually hugs whatever shape the rendered page turns out to be --
    // querying *its* clientWidth/Height here would be circular (it has no
    // natural size until a canvas exists inside it). The available space
    // to fit into is instead the frame's parent, `.pdf-reader-viewport`,
    // which has a real CSS-determined size independent of its content.
    const availableEl = container.parentElement || container;

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
    const availableWidth = availableEl.clientWidth || 600;
    const availableHeight = availableEl.clientHeight || 800;
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

export async function init(elementId, bytes, initialPage, initialZoom) {
    // Same interop-buffer gotcha as epubReader.js: bytes.buffer is a
    // reused/pooled buffer, not the exact call data -- must slice first.
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = Math.min(Math.max(initialPage || 1, 1), doc.numPages);

    instances.set(elementId, { doc, currentPage: page, zoom: initialZoom > 0 ? initialZoom : 1 });
    await renderPage(elementId);

    return doc.numPages;
}

export async function setZoom(elementId, zoom) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.zoom = zoom;
    await renderPage(elementId);
}

export function getCurrentPage(elementId) {
    return instances.get(elementId)?.currentPage ?? 1;
}

export async function next(elementId) {
    const entry = instances.get(elementId);
    if (!entry || entry.currentPage >= entry.doc.numPages) return;
    entry.currentPage += 1;
    await renderPage(elementId);
}

export async function prev(elementId) {
    const entry = instances.get(elementId);
    if (!entry || entry.currentPage <= 1) return;
    entry.currentPage -= 1;
    await renderPage(elementId);
}

export async function goToPage(elementId, page) {
    const entry = instances.get(elementId);
    if (!entry) return 1;
    const target = Math.min(Math.max(page, 1), entry.doc.numPages);
    if (target !== entry.currentPage) {
        entry.currentPage = target;
        await renderPage(elementId);
    }
    return entry.currentPage;
}

export function destroy(elementId) {
    const entry = instances.get(elementId);
    if (!entry) return;
    entry.doc.destroy();
    instances.delete(elementId);
}
