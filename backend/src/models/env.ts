// Cloudflare Worker bindings, configured in wrangler.toml (DB, STORAGE,
// FRONTEND_URL) and as secrets via `wrangler secret put` (never committed).
// BIBLE_API_KEY mirrors JWT_SECRET's pattern -- api.bible's license terms
// make this a genuine secret, unlike the client-side-embedded Google Books
// key. The four OAuth values (issue #40) follow the same split: *_CLIENT_ID
// isn't really sensitive but lives alongside its secret for symmetry;
// *_CLIENT_SECRET is a real secret and must never be committed.
export type Bindings = {
    DB: D1Database;
    STORAGE: R2Bucket;
    JWT_SECRET: string;
    BIBLE_API_KEY: string;
    RESEND_API_KEY: string;
    // Keys the HMAC-SHA256 hash of password-reset codes (a plain sha256Hex
    // over a 6-digit / 10^6 keyspace would be reversible in milliseconds --
    // see passwordResetService.ts). Separate from JWT_SECRET so rotating one
    // never invalidates the other.
    PASSWORD_CODE_SECRET: string;
    FRONTEND_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
};

// Per-request context set by middleware/auth.ts once a token is verified.
export type Variables = {
    userId: number;
    role: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
