import type { Context, Next } from "hono";
import type { AppEnv } from "../models/env";
import { failure } from "../models/response";
import type { JwtPayload } from "../utils/crypto";
import { verifyJwt } from "../utils/crypto";

// Review N-7: a valid signature isn't enough -- the account must still be
// live and the token's session generation ("tv", absent = 0 in tokens from
// before migration 0027) must match users.token_version. One read per
// authenticated request; also on optionalAuth's image routes.
async function isSessionCurrent(db: D1Database, payload: JwtPayload): Promise<boolean> {
    try {
        const row = await db
            .prepare("SELECT token_version FROM users WHERE id = ? AND deleted_at IS NULL")
            .bind(payload.sub)
            .first<{ token_version: number }>();
        return row !== null && row.token_version === (payload.tv ?? 0);
    } catch (err) {
        // Only for the window between deploying this code and applying
        // migration 0027 (the deploy order says migration first): without
        // the column nothing can have been revoked yet, so fall back to
        // "the account exists". Any other error still fails closed.
        if (!String(err).includes("no such column: token_version")) throw err;
        console.error("requireAuth: token_version column missing -- apply migration 0027");
        const row = await db.prepare("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL").bind(payload.sub).first();
        return row !== null;
    }
}

// Applied per-route (not globally) to whichever endpoints need a logged-in
// user — see documentation/Architecture.md for which routes require it.
export async function requireAuth(c: Context<AppEnv>, next: Next) {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
        return c.json(failure("UNAUTHORIZED", "Authentication required."), 401);
    }

    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (!payload || !(await isSessionCurrent(c.env.DB, payload))) {
        return c.json(failure("UNAUTHORIZED", "Invalid or expired token."), 401);
    }

    c.set("userId", payload.sub);
    c.set("role", payload.role);
    await next();
}

// Applied to routes that serve different data (or the same data) whether or
// not the caller is logged in -- e.g. a cover image that's public for a
// PUBLIC-visibility resource but still needs the owner check for a private
// one. Unlike requireAuth, a missing/invalid token is not an error: it just
// means the request proceeds anonymously (c.get("userId") stays unset).
export async function optionalAuth(c: Context<AppEnv>, next: Next) {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (token) {
        // A revoked or deleted account's token just means "anonymous" here.
        const payload = await verifyJwt(token, c.env.JWT_SECRET);
        if (payload && (await isSessionCurrent(c.env.DB, payload))) {
            c.set("userId", payload.sub);
            c.set("role", payload.role);
        }
    }

    await next();
}
