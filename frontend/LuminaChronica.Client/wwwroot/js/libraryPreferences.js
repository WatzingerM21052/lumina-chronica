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
