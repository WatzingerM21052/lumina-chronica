import { cors } from "hono/cors";

// Restrictive CORS per Technical Standards §7 ("CORS wird restriktiv
// konfiguriert") — only the known frontend origins, not "*".
const ALLOWED_ORIGINS = [
    "https://watzingerm21052.github.io",
    "http://localhost:5289",
    "http://127.0.0.1:5289",
];

export const corsMiddleware = cors({
    origin: ALLOWED_ORIGINS,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
});
