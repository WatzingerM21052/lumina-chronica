// Throttles POST /api/auth/login and /api/auth/register. D1-backed (see
// database/migrations/0014_auth_rate_limit.sql for why this is a fixed
// window rather than a precise algorithm, and why login keys on (ip,
// identifier) instead of identifier alone).

const WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 8;
export const REGISTER_MAX_ATTEMPTS = 8;

export class RateLimitedError extends Error {
    constructor(public readonly retryAfterSeconds: number) {
        super("Too many attempts.");
    }
}

type ThrottleRow = { attempt_count: number; expires_at: string };

// CF-Connecting-IP is Cloudflare's own edge-verified client IP -- unlike
// X-Forwarded-For, it can't be spoofed by the client. Falls back to a
// shared bucket in local dev (wrangler dev doesn't set it), which just
// means every local request shares one counter -- fine outside production.
function getClientIp(c: { req: { header(name: string): string | undefined } }): string {
    return c.req.header("CF-Connecting-IP") ?? "unknown";
}

// Reads through a "first-primary" session, not the plain db handle -- D1
// replicates reads to regional replicas by default, and a plain read here
// could observe a replica that lags behind another request's very recent
// write, letting the counter's own writes silently outrun its own checks.
// Confirmed live against production: without this, attempt_count kept
// incrementing correctly on the primary but checkLimit never saw it catch
// up, so the 429 never fired.
async function checkLimit(db: D1Database, route: string, ip: string, identifier: string, maxAttempts: number): Promise<void> {
    const nowIso = new Date().toISOString();
    const row = await db
        .withSession("first-primary")
        .prepare("SELECT attempt_count, expires_at FROM auth_rate_limits WHERE route = ? AND ip = ? AND identifier = ? AND expires_at > ?")
        .bind(route, ip, identifier, nowIso)
        .first<ThrottleRow>();

    if (!row || row.attempt_count < maxAttempts) return;

    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 1000));
    throw new RateLimitedError(retryAfterSeconds);
}

// Records one attempt against the window, starting a fresh window if the
// previous one expired. A single atomic UPSERT rather than read-then-write.
// The window-expiry check compares against a JS-computed ISO timestamp
// (nowIso), not SQLite's CURRENT_TIMESTAMP -- CURRENT_TIMESTAMP renders as
// "YYYY-MM-DD HH:MM:SS" (space-separated, no offset) while expires_at is
// stored as toISOString()'s "YYYY-MM-DDTHH:MM:SS.sssZ"; comparing the two
// as text is a silent bug ('T' > ' ' in ASCII, so expires_at > CURRENT_TIMESTAMP
// was always true and the window never actually expired). Binding both
// sides in the same format sidesteps the mismatch entirely.
async function recordAttempt(db: D1Database, route: string, ip: string, identifier: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const freshExpiresAt = new Date(Date.now() + WINDOW_MS).toISOString();
    await db
        .prepare(
            `INSERT INTO auth_rate_limits (route, ip, identifier, attempt_count, expires_at)
             VALUES (?1, ?2, ?3, 1, ?4)
             ON CONFLICT(route, ip, identifier) DO UPDATE SET
                 attempt_count = CASE WHEN expires_at > ?5 THEN attempt_count + 1 ELSE 1 END,
                 expires_at = CASE WHEN expires_at > ?5 THEN expires_at ELSE ?4 END,
                 updated_at = CURRENT_TIMESTAMP`
        )
        .bind(route, ip, identifier, freshExpiresAt, nowIso)
        .run();
}

async function clearAttempts(db: D1Database, route: string, ip: string, identifier: string): Promise<void> {
    await db.prepare("DELETE FROM auth_rate_limits WHERE route = ? AND ip = ? AND identifier = ?").bind(route, ip, identifier).run();
}

// Throws RateLimitedError if the (ip, identifier) pair is already at the
// cap for this window -- call before doing the real (expensive) work.
export async function assertNotRateLimited(c: { env: { DB: D1Database }; req: { header(name: string): string | undefined } }, route: string, identifier: string): Promise<{ ip: string; identifier: string }> {
    const ip = getClientIp(c);
    await checkLimit(c.env.DB, route, ip, identifier, route === "login" ? LOGIN_MAX_ATTEMPTS : REGISTER_MAX_ATTEMPTS);
    return { ip, identifier };
}

export async function recordFailedAttempt(db: D1Database, route: string, ip: string, identifier: string): Promise<void> {
    await recordAttempt(db, route, ip, identifier);
}

export async function clearRateLimit(db: D1Database, route: string, ip: string, identifier: string): Promise<void> {
    await clearAttempts(db, route, ip, identifier);
}
