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
