// Applies/persists the active theme via a `data-theme` attribute on <html>.
// Kept as plain JS (not a Blazor component) so the stored theme can be
// applied before Blazor boots, avoiding a flash of the wrong theme.
const STORAGE_KEY = "lumina-chronica-theme";

export function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || "classic-library";
}

export function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
}

export function applyStoredTheme() {
    document.documentElement.setAttribute("data-theme", getTheme());
}
