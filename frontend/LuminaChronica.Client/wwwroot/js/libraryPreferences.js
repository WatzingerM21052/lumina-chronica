// Persists the Bibliothek Raster view's chosen page size across sessions.
// Same minimal localStorage-wrapper shape as auth.js/theme.js.
const RASTER_PAGE_SIZE_KEY = "lumina_library_raster_page_size";

export function getRasterPageSize() {
    const raw = localStorage.getItem(RASTER_PAGE_SIZE_KEY);
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function setRasterPageSize(value) {
    localStorage.setItem(RASTER_PAGE_SIZE_KEY, String(value));
}

// Persists the Bibliothek Regal view's chosen book-size zoom factor. Stored
// and returned as the plain invariant-culture string (e.g. "1.25") the C#
// side already uses as its <select> option value/CSS custom property value --
// keeping it a string end-to-end sidesteps any culture-specific decimal
// formatting mismatch a numeric round-trip would risk.
const SHELF_BOOK_ZOOM_KEY = "lumina_library_shelf_book_zoom";

export function getShelfBookZoom() {
    return localStorage.getItem(SHELF_BOOK_ZOOM_KEY);
}

export function setShelfBookZoom(value) {
    localStorage.setItem(SHELF_BOOK_ZOOM_KEY, value);
}
