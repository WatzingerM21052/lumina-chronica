// Applies/persists whether the shelf book's front cover shows the app-drawn
// title/author text overlay (ShelfBook.razor's .shelf-book-cover-title/
// -author). Most real cover images already carry their own printed title/
// author, so this defaults to hidden. Same data-attribute-on-<html> +
// boot-apply technique as theme.js: app.css gates purely on the attribute,
// so no JS interop or Razor parameter is needed per rendered book.
const STORAGE_KEY = "lumina-chronica-shelf-cover-text";

export function getShowCoverText() {
    return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setShowCoverText(show) {
    document.documentElement.setAttribute("data-shelf-cover-text", show ? "show" : "hide");
    localStorage.setItem(STORAGE_KEY, String(show));
}

export function applyStoredShowCoverText() {
    document.documentElement.setAttribute("data-shelf-cover-text", getShowCoverText() ? "show" : "hide");
}
