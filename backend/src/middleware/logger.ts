import type { Context, Next } from "hono";

// Minimal request logger — Workers logs go to `wrangler tail` / the
// Cloudflare dashboard, no external logging service configured yet.
export async function requestLogger(c: Context, next: Next) {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${ms}ms)`);
}
