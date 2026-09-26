import { cors } from "hono/cors";

// Restrictive CORS per Technical Standards §7 ("CORS wird restriktiv
// konfiguriert") — only the known frontend origins, not "*".
const ALLOWED_ORIGINS = [
    "https://luminachronica.com",
    "https://www.luminachronica.com",
    // Old GitHub Pages project-site origin -- github.io now 301-redirects
    // page loads to the custom domain (see PR #473), so JS should no
    // longer actually run from this origin, but kept for a transition
    // period (cached tabs, bookmarks) rather than cutting it abruptly.
    "https://watzingerm21052.github.io",
    "http://localhost:5289",
    "http://127.0.0.1:5289",
];

export const corsMiddleware = cors({
    origin: ALLOWED_ORIGINS,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
});
