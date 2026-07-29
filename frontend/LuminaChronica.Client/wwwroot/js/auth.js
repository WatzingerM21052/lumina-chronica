// Persists the JWT in localStorage. See documentation/Architecture.md for
// the tradeoff (readable by any script on the page, mitigated for now by
// the app rendering no untrusted user-generated HTML).
const STORAGE_KEY = "lumina_auth_token";

export function getToken() {
    return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token) {
    localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(STORAGE_KEY);
}
