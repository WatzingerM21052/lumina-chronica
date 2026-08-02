// Cloudflare Worker bindings, configured in wrangler.toml (DB, STORAGE) and as
// secrets via `wrangler secret put` (never committed). BIBLE_API_KEY mirrors
// JWT_SECRET's pattern -- api.bible's license terms make this a genuine
// secret, unlike the client-side-embedded Google Books key.
export type Bindings = {
    DB: D1Database;
    STORAGE: R2Bucket;
    JWT_SECRET: string;
    BIBLE_API_KEY: string;
};

// Per-request context set by middleware/auth.ts once a token is verified.
export type Variables = {
    userId: number;
    role: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
