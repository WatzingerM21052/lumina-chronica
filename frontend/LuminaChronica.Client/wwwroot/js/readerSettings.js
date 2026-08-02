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
