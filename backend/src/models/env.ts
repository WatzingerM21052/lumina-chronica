// Cloudflare Worker bindings, configured in wrangler.toml (DB) and as a
// secret via `wrangler secret put JWT_SECRET` (never committed).
export type Bindings = {
    DB: D1Database;
    JWT_SECRET: string;
};

// Per-request context set by middleware/auth.ts once a token is verified.
export type Variables = {
    userId: number;
    role: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
