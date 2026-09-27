// Throttles POST /api/auth/login, /api/auth/register, and
// /api/auth/forgot-password. D1-backed (see
// database/migrations/0014_auth_rate_limit.sql for why this is a fixed
// window rather than a precise algorithm, and why login keys on (ip,
// identifier) instead of identifier alone).

const WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 8;
export const REGISTER_MAX_ATTEMPTS = 8;
export const FORGOT_PASSWORD_MAX_ATTEMPTS = 5;

// D2 (docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md
// §3.4 step 0): the 60s "Code erneut senden" cooldown for the popup's resend
// button. A SEPARATE, additional throttle from forgot-password's own
// 5-per-15-min one above -- that one is the abuse backstop, this one is the
// fast, obvious "why is the resend button disabled" UX signal. Reuses this
// same table/mechanism (and the route's existing RATE_LIMITED/429 response
// shape, including Retry-After -- the frontend drives the visible countdown
// straight off that header, no separate response shape needed) rather than
// inventing a new one.
export const FORGOT_PASSWORD_RESEND_MAX_ATTEMPTS = 1;
const FORGOT_PASSWORD_RESEND_WINDOW_MS = 60 * 1000;

// §3.5: outer backstops against *spraying identifiers* at these two new
// routes -- NOT the brute-force defense (that's MAX_CODE_ATTEMPTS, living
// on the password_reset_tokens row itself, immune to IP rotation). Generous
// on purpose: verify-reset-code fires on every keystroke-driven live check
// (§4.3), so a tight cap here would break normal typing, not just abuse.
export const VERIFY_RESET_CODE_MAX_ATTEMPTS = 30;
export const RESET_PASSWORD_MAX_ATTEMPTS = 10;

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
async function recordAttempt(db: D1Database, route: string, ip: string, identifier: string, windowMs: number): Promise<void> {
    const nowIso = new Date().toISOString();
    const freshExpiresAt = new Date(Date.now() + windowMs).toISOString();
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

function maxAttemptsFor(route: string): number {
    if (route === "login") return LOGIN_MAX_ATTEMPTS;
    if (route === "forgot-password") return FORGOT_PASSWORD_MAX_ATTEMPTS;
    if (route === "forgot-password-resend") return FORGOT_PASSWORD_RESEND_MAX_ATTEMPTS;
    if (route === "verify-reset-code") return VERIFY_RESET_CODE_MAX_ATTEMPTS;
    if (route === "reset-password") return RESET_PASSWORD_MAX_ATTEMPTS;
    return REGISTER_MAX_ATTEMPTS;
}

function windowMsFor(route: string): number {
    if (route === "forgot-password-resend") return FORGOT_PASSWORD_RESEND_WINDOW_MS;
    return WINDOW_MS;
}

// Throws RateLimitedError if the (ip, identifier) pair is already at the
// cap for this window -- call before doing the real (expensive) work.
export async function assertNotRateLimited(c: { env: { DB: D1Database }; req: { header(name: string): string | undefined } }, route: string, identifier: string): Promise<{ ip: string; identifier: string }> {
    const ip = getClientIp(c);
    await checkLimit(c.env.DB, route, ip, identifier, maxAttemptsFor(route));
    return { ip, identifier };
}

// D2's resend cooldown (see the const above): deliberately IP-INDEPENDENT
// (ip = "", matching `register`'s existing bucket shape) and callable with
// a bare identifier string, not a Hono context -- it must be checkable
// before any user lookup, and its whole point is that the response is
// identical whether or not `identifier` resolves to a real account. Do not
// key this one on IP; an attacker probing identifiers would just rotate IPs
// to dodge the cooldown, undermining the exact symmetry this exists for.
export async function assertResendNotRateLimited(db: D1Database, identifier: string): Promise<void> {
    await checkLimit(db, "forgot-password-resend", "", identifier, FORGOT_PASSWORD_RESEND_MAX_ATTEMPTS);
}

export async function recordResendAttempt(db: D1Database, identifier: string): Promise<void> {
    await recordAttempt(db, "forgot-password-resend", "", identifier, windowMsFor("forgot-password-resend"));
}

export async function recordFailedAttempt(db: D1Database, route: string, ip: string, identifier: string): Promise<void> {
    await recordAttempt(db, route, ip, identifier, windowMsFor(route));
}

export async function clearRateLimit(db: D1Database, route: string, ip: string, identifier: string): Promise<void> {
    await clearAttempts(db, route, ip, identifier);
}
