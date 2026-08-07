import type { Context, Next } from "hono";
import type { AppEnv } from "../models/env";
import { failure } from "../models/response";
import { verifyJwt } from "../utils/crypto";

// Applied per-route (not globally) to whichever endpoints need a logged-in
// user — see documentation/Architecture.md for which routes require it.
export async function requireAuth(c: Context<AppEnv>, next: Next) {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
        return c.json(failure("UNAUTHORIZED", "Authentication required."), 401);
    }

    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (!payload) {
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
        const payload = await verifyJwt(token, c.env.JWT_SECRET);
        if (payload) {
            c.set("userId", payload.sub);
            c.set("role", payload.role);
        }
    }

    await next();
}
