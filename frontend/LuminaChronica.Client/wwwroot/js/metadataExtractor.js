// Client-side metadata extraction for the Upload page (BookUpload.razor).
// Reuses the same vendored epub.js/pdf.js already shipped for the Reader
// (epubReader.js/pdfReader.js) -- no new library, no backend endpoint, so
// the Workers CPU-budget concern that would apply to server-side parsing
// never comes up.
//
// Only one extraction is ever in flight at a time (a single file input on
// the upload form), so cover resolution is tracked as a single module-level
// "pending" slot rather than an elementId-keyed Map like the reader modules
// use.
import { ensureLibsLoaded } from "./epubReader.js";

let pending = null; // { book, coverPath } for EPUB, or { pdfDoc } for PDF
let cachedCoverBlob;

// epub.js's `metadata.identifier` is just whatever the *first* dc:identifier
// element in the OPF contains -- verified against real files in
// bookDownloads/, most epubBooks.com/Blyton titles use a UUID there, not an
// ISBN, even though the field name suggests otherwise. Only trust it as an
// ISBN if it actually has ISBN-10/13 shape after stripping separators.
function isbnShape(value) {
    if (!value) return null;
    const digits = value.replace(/[^0-9Xx]/g, "");
    if (digits.length === 10 || digits.length === 13) return digits;
    return null;
}

// Some PDF converters (Word exports, scan tools) leave the source filename
// in the document info Title instead of a real title -- an empty field
// beats a wrong one.
function looksLikeFilename(value) {
    return /\.(docx?|pdf|epub|txt)$/i.test(value.trim());
}

export async function extractEpub(bytes) {
    await ensureLibsLoaded();

    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const book = ePub(arrayBuffer);
    await book.ready;
    const metadata = await book.loaded.metadata;
    const coverPath = await book.loaded.cover;

    pending = coverPath ? { book, coverPath } : null;
    cachedCoverBlob = undefined;

    return {
        title: metadata.title || null,
        author: metadata.creator || null,
        description: metadata.description || null,
        language: metadata.language || null,
        publisher: metadata.publisher || null,
        isbn: isbnShape(metadata.identifier),
        hasCover: !!coverPath,
    };
}

export async function extractPdf(bytes) {
    const pdfjsLib = await import("../lib/pdfjs/pdf.min.mjs");
    // Same base-href-relative resolution as pdfReader.js -- resolved
    // against this module's own URL, not the page's, so it survives the
    // GitHub Pages subpath (issue #38's bug class).
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../lib/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const { info } = await doc.getMetadata();

    const title = info?.Title && !looksLikeFilename(info.Title) ? info.Title : null;
    const author = info?.Author && !looksLikeFilename(info.Author) ? info.Author : null;

    pending = { pdfDoc: doc };
    cachedCoverBlob = undefined;

    return {
        title,
        author,
        description: null,
        language: null,
        publisher: null,
        isbn: null,
        hasCover: doc.numPages > 0,
    };
}

async function resolveCoverBlob() {
    if (cachedCoverBlob !== undefined) return cachedCoverBlob;
    if (!pending) return (cachedCoverBlob = null);

    if (pending.book) {
        cachedCoverBlob = await pending.book.archive.getBlob(pending.coverPath);
        return cachedCoverBlob;
    }

    if (pending.pdfDoc) {
        // Same fit-to-size render approach as pdfReader.js's renderPage,
        // capped at 800px on the long edge since this only feeds a cover
        // thumbnail, not the reading view.
        const page = await pending.pdfDoc.getPage(1);
        const unscaledViewport = page.getViewport({ scale: 1 });
        const maxDimension = 800;
        const scale = Math.min(1, maxDimension / Math.max(unscaledViewport.width, unscaledViewport.height));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

        cachedCoverBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        return cachedCoverBlob;
    }

    return (cachedCoverBlob = null);
}

// Kept as standalone byte[]/string-returning calls (rather than fields
// nested in the metadata object above) to match this codebase's established
// interop convention -- see BlobUrlService/epubReader.js/pdfReader.js, which
// all pass byte[] as its own top-level parameter or return value.
export async function getCoverBytes() {
    const blob = await resolveCoverBlob();
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
}

export async function getCoverContentType() {
    const blob = await resolveCoverBlob();
    return blob ? blob.type : null;
}
