// Language persistence + dictionary loading, mirroring theme.js's shape.
// No applyStoredLanguage()/pre-boot DOM step the way theme.js has one --
// that exists there to avoid a flash of the wrong CSS theme before Blazor
// boots, which doesn't apply to text content the same way. Dictionary
// fetching lives here (not a C# HttpClient) so it resolves against the
// page's own origin via a plain relative fetch, avoiding any ambiguity
// with ApiClient's HttpClient (which is base-addressed at the API origin,
// not this app's own host).
const STORAGE_KEY = "lumina-chronica-language";

export function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) || "de";
}

export function setLanguage(language) {
    localStorage.setItem(STORAGE_KEY, language);
}

export async function loadDictionary(language) {
    const response = await fetch(`./i18n/${language}.json`);
    return await response.json();
}
