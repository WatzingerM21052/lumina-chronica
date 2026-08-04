// Reader font-size preference, persisted client-locally -- mirrors theme.js.
// Not synced to user_settings.font_size (that column stays unused, same as
// the app-wide theme picker); see documentation/Architecture.md.
const STORAGE_KEY = "lumina_reader_font_size";
const DEFAULT_FONT_SIZE = 18;

export function getFontSize() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_FONT_SIZE;
}

export function setFontSize(fontSize) {
    localStorage.setItem(STORAGE_KEY, String(fontSize));
}

// PDF zoom factor, multiplied onto the fit-to-viewport scale pdfReader.js
// already computes -- 1 means "fit the page to the screen" (the pre-zoom
// default), not "100% of the PDF's native size".
const PDF_ZOOM_STORAGE_KEY = "lumina_reader_pdf_zoom";
const DEFAULT_PDF_ZOOM = 1;

export function getPdfZoom() {
    const stored = localStorage.getItem(PDF_ZOOM_STORAGE_KEY);
    return stored ? parseFloat(stored) : DEFAULT_PDF_ZOOM;
}

export function setPdfZoom(zoom) {
    localStorage.setItem(PDF_ZOOM_STORAGE_KEY, String(zoom));
}

// Typography/layout preferences for TXT/MD/EPUB (not PDF -- a rendered
// raster page has no text layout to adjust). Stored as the same small set
// of keys ("serif"/"sans", "tight"/"normal"/"loose", "narrow"/"normal"/
// "wide") that both app.css's reader-content modifier classes and
// epubReader.js's own rule-building map to real CSS values -- keeps this
// module a plain key store, not a place that duplicates actual sizes.
const FONT_FAMILY_STORAGE_KEY = "lumina_reader_font_family";
const LINE_HEIGHT_STORAGE_KEY = "lumina_reader_line_height";
const PAGE_WIDTH_STORAGE_KEY = "lumina_reader_page_width";
const DEFAULT_FONT_FAMILY = "serif";
const DEFAULT_LINE_HEIGHT = "normal";
const DEFAULT_PAGE_WIDTH = "normal";

export function getFontFamily() {
    return localStorage.getItem(FONT_FAMILY_STORAGE_KEY) || DEFAULT_FONT_FAMILY;
}

export function setFontFamily(fontFamily) {
    localStorage.setItem(FONT_FAMILY_STORAGE_KEY, fontFamily);
}

export function getLineHeight() {
    return localStorage.getItem(LINE_HEIGHT_STORAGE_KEY) || DEFAULT_LINE_HEIGHT;
}

export function setLineHeight(lineHeight) {
    localStorage.setItem(LINE_HEIGHT_STORAGE_KEY, lineHeight);
}

export function getPageWidth() {
    return localStorage.getItem(PAGE_WIDTH_STORAGE_KEY) || DEFAULT_PAGE_WIDTH;
}

export function setPageWidth(pageWidth) {
    localStorage.setItem(PAGE_WIDTH_STORAGE_KEY, pageWidth);
}

// Book View ("book") vs Scroll View ("scroll") -- source spec §14.1. Applies
// to EPUB (epub.js flow: paginated vs scrolled) and PDF (single-canvas page
// swap vs a lazily-rendered continuous-scroll frame); TXT/MD stays
// continuous-scroll-only regardless (real pagination is a separate, later
// story -- page breaks would depend on font size/window width, unlike
// EPUB's fixed spine or PDF's fixed page geometry).
const READER_MODE_STORAGE_KEY = "lumina_reader_mode";
const DEFAULT_READER_MODE = "book";

export function getReaderMode() {
    return localStorage.getItem(READER_MODE_STORAGE_KEY) || DEFAULT_READER_MODE;
}

export function setReaderMode(mode) {
    localStorage.setItem(READER_MODE_STORAGE_KEY, mode);
}

// Whether to hide Scroll View's scrollbars -- source request, a purely
// cosmetic preference (the container stays scrollable either way; see
// app.css's scrollbar-hide-both class, which works identically across
// Chromium/WebKit/Firefox, unlike the per-axis webkit-only variant this
// setting started as before being simplified down to a single checkbox).
const HIDE_SCROLLBARS_STORAGE_KEY = "lumina_reader_hide_scrollbars";

export function getHideScrollbars() {
    return localStorage.getItem(HIDE_SCROLLBARS_STORAGE_KEY) === "true";
}

// Aliases for the pre-rename names (this setting shipped first as
// getScrollbarHide/setScrollbarHide, string-valued). Deployed JS and the
// Blazor DLL calling it are cached independently (10 min JS cache) and can
// land on a user's browser out of sync after a rename -- a real incident,
// not a hypothetical: a fresh DLL calling getHideScrollbars hit a
// still-cached pre-rename JS bundle that only had getScrollbarHide, and
// broke the reader page until the JS cache expired. Kept as thin aliases so
// future renames of interop exports don't reproduce this.
export function getScrollbarHide() {
    return getHideScrollbars();
}

export function setScrollbarHide(value) {
    setHideScrollbars(value === "both" || value === true);
}

export function setHideScrollbars(value) {
    localStorage.setItem(HIDE_SCROLLBARS_STORAGE_KEY, String(value));
}
