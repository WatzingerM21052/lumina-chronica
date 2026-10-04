// Whether book covers show their pictures (Einstellungen > "Coverbilder
// anzeigen", on by default). Off, no cover picture is even downloaded
// (ApiClient checks Services/CoverPreferences.cs) and every cover shows
// its title and author instead. Same data-attribute-on-<html> + boot-apply
// technique as theme.js / shelfCoverText.js.
const STORAGE_KEY = "lumina-chronica-cover-images";

export function getShowCoverImages() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
        return true;
    }
}

export function setShowCoverImages(show) {
    document.documentElement.setAttribute("data-cover-images", show ? "on" : "off");
    try {
        localStorage.setItem(STORAGE_KEY, show ? "on" : "off");
    } catch {
        // Storage blocked: the choice lasts for this page only.
    }
}

export function applyStoredCoverImages() {
    document.documentElement.setAttribute("data-cover-images", getShowCoverImages() ? "on" : "off");
}
