// Daily cleanup (review N-13): expired auth rows otherwise pile up forever.
// Run by the Worker's cron trigger (src/worker.ts, wrangler.toml).
//
// All expires_at values are written as toISOString() ("...T...Z"), so they
// are compared with ISO strings here too, never with CURRENT_TIMESTAMP (see
// rateLimitService.ts on why mixing the two formats silently breaks).
//
// Rate-limit rows can go as soon as they expire: an expired row already
// counts as no row (recordAttempt restarts at 1). Tokens and OAuth rows get
// a day of grace so a support question about "my link didn't work" can
// still be looked at.
const GRACE_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = {
    rateLimits: number;
    passwordResetTokens: number;
    oauthStates: number;
    oauthExchangeCodes: number;
};

export async function cleanupExpiredRows(db: D1Database, now: Date = new Date()): Promise<CleanupResult> {
    const nowIso = now.toISOString();
    const graceIso = new Date(now.getTime() - GRACE_MS).toISOString();
    const [rateLimits, resetTokens, oauthStates, exchangeCodes] = await db.batch([
        db.prepare("DELETE FROM auth_rate_limits WHERE expires_at < ?").bind(nowIso),
        db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < ?").bind(graceIso),
        db.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(graceIso),
        db.prepare("DELETE FROM oauth_exchange_codes WHERE expires_at < ?").bind(graceIso),
    ]);
    return {
        rateLimits: rateLimits.meta.changes ?? 0,
        passwordResetTokens: resetTokens.meta.changes ?? 0,
        oauthStates: oauthStates.meta.changes ?? 0,
        oauthExchangeCodes: exchangeCodes.meta.changes ?? 0,
    };
}
