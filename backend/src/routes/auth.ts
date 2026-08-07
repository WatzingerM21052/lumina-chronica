import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    EmailTakenError,
    InvalidCredentialsError,
    UsernameTakenError,
    loginUser,
    registerUser,
} from "../services/authService";
import { OAuthExchangeError } from "../services/oauthProviders";
import {
    InvalidProviderError,
    InvalidStateError,
    completeOAuthCallback,
    redeemExchangeCode,
    startOAuth,
    storeExchangeCode,
} from "../services/oauthService";
import { RateLimitedError, assertNotRateLimited, clearRateLimit, recordFailedAttempt } from "../services/rateLimitService";

export const authRoute = new Hono<AppEnv>();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function rateLimitedResponse(c: Context<AppEnv>, err: RateLimitedError) {
    c.header("Retry-After", String(err.retryAfterSeconds));
    return c.json(failure("RATE_LIMITED", `Too many attempts. Try again in ${err.retryAfterSeconds} seconds.`), 429);
}

authRoute.post("/register", async (c) => {
    // Keyed by IP only (not per-email) -- the resource being protected is
    // "how many accounts can this source create," not any one address.
    let rateLimit;
    try {
        rateLimit = await assertNotRateLimited(c, "register", "");
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    const body = await c.req.json<{ username?: string; email?: string; password?: string }>().catch(() => null);
    const { username, email, password } = body ?? {};

    // Every POST counts toward the IP's window regardless of outcome --
    // including validation failures, since a flood of malformed requests is
    // the same resource-abuse shape as a flood of valid-but-duplicate ones.
    await recordFailedAttempt(c.env.DB, "register", rateLimit.ip, "");

    if (!username || !email || !password) {
        return c.json(failure("VALIDATION_ERROR", "username, email, and password are required."), 400);
    }
    if (!EMAIL_PATTERN.test(email)) {
        return c.json(failure("VALIDATION_ERROR", "email is not a valid address."), 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `password must be at least ${MIN_PASSWORD_LENGTH} characters.`), 400);
    }

    try {
        const result = await registerUser(c.env.DB, c.env.JWT_SECRET, { username, email, password });
        return c.json(success(result), 201);
    } catch (err) {
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        throw err;
    }
});

authRoute.post("/login", async (c) => {
    const body = await c.req.json<{ identifier?: string; password?: string }>().catch(() => null);
    if (!body?.identifier || !body?.password) {
        return c.json(failure("VALIDATION_ERROR", "identifier and password are required."), 400);
    }

    // Keyed by (ip, identifier) rather than identifier alone -- an attacker
    // spamming a victim's username from many IPs must not be able to lock
    // the victim out of logging in from their own IP.
    let rateLimit;
    try {
        rateLimit = await assertNotRateLimited(c, "login", body.identifier);
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    try {
        const result = await loginUser(c.env.DB, c.env.JWT_SECRET, { identifier: body.identifier, password: body.password });
        await clearRateLimit(c.env.DB, "login", rateLimit.ip, rateLimit.identifier);
        return c.json(success(result));
    } catch (err) {
        if (err instanceof InvalidCredentialsError) {
            await recordFailedAttempt(c.env.DB, "login", rateLimit.ip, rateLimit.identifier);
            return c.json(failure("INVALID_CREDENTIALS", "Username/email or password is incorrect."), 401);
        }
        throw err;
    }
});

// Stateless JWT: nothing to invalidate server-side. Logout is a client-side
// token discard; this endpoint exists mainly to require a valid token before
// confirming the session is over. See documentation/Architecture.md.
authRoute.post("/logout", requireAuth, (c) => c.body(null, 204));

// --- OAuth (issue #40) ---------------------------------------------------
// Google/GitHub sign-in alongside the password flow above, never replacing
// it. See documentation/Architecture.md's OAuth row and oauthService.ts's
// module comments for the full design (why the redirect_uri is derived from
// the request's own origin, why the token handoff to the frontend goes
// through a short-lived exchange code rather than a cookie or a token in
// the URL, why there's no PKCE).

type OAuthCredentials = { clientId: string; clientSecret: string };

function credentialsFor(c: { env: { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string } }, provider: string): OAuthCredentials | null {
    if (provider === "google") return { clientId: c.env.GOOGLE_CLIENT_ID, clientSecret: c.env.GOOGLE_CLIENT_SECRET };
    if (provider === "github") return { clientId: c.env.GITHUB_CLIENT_ID, clientSecret: c.env.GITHUB_CLIENT_SECRET };
    return null;
}

// Derived from the incoming request rather than a hardcoded/env value, so
// the exact same code works against local dev (http://127.0.0.1:8787) and
// production without a redirect-uri env var -- the provider's registered
// redirect URI must match whichever origin actually made the request either
// way, so nothing is gained by hardcoding it, and this avoids yet another
// binding to keep in sync between wrangler.toml/.dev.vars/production.
function callbackUrl(c: { req: { url: string } }, provider: string): string {
    return new URL(`/api/auth/oauth/${provider}/callback`, c.req.url).toString();
}

authRoute.get("/oauth/:provider/start", async (c) => {
    const provider = c.req.param("provider");
    const credentials = credentialsFor(c, provider);
    if (!credentials) return c.json(failure("INVALID_PROVIDER", `Unknown OAuth provider "${provider}".`), 400);

    try {
        const { redirectUrl } = await startOAuth(c.env.DB, provider, credentials.clientId, callbackUrl(c, provider));
        return c.redirect(redirectUrl, 302);
    } catch (err) {
        if (err instanceof InvalidProviderError) return c.json(failure("INVALID_PROVIDER", `Unknown OAuth provider "${provider}".`), 400);
        throw err;
    }
});

authRoute.get("/oauth/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const credentials = credentialsFor(c, provider);
    const code = c.req.query("code");
    const state = c.req.query("state");
    // NOT `new URL("/oauth-callback", c.env.FRONTEND_URL)` -- a leading "/"
    // in the second-arg form is root-relative and silently discards the
    // base URL's own path, which on this GitHub Pages *project* site
    // (FRONTEND_URL = ".../lumina-chronica") turned "/oauth-callback" into
    // "https://watzingerm21052.github.io/oauth-callback" -- a real 404,
    // confirmed live. Plain concatenation avoids the relative-resolution
    // semantics entirely. Same bug category as the frontend's own
    // NavigateTo("/...") leading-slash gotcha (issue #38) -- the lesson
    // didn't transfer across languages the first time.
    const frontendCallback = new URL(`${c.env.FRONTEND_URL}/oauth-callback`);

    if (!credentials || !code || !state) {
        frontendCallback.searchParams.set("error", "oauth_failed");
        return c.redirect(frontendCallback.toString(), 302);
    }

    try {
        const { userId } = await completeOAuthCallback(c.env.DB, provider, code, state, credentials, callbackUrl(c, provider));
        const exchangeCode = await storeExchangeCode(c.env.DB, userId);
        frontendCallback.searchParams.set("code", exchangeCode);
        return c.redirect(frontendCallback.toString(), 302);
    } catch (err) {
        const reason =
            err instanceof InvalidProviderError ? "invalid_provider" :
            err instanceof InvalidStateError ? "invalid_state" :
            err instanceof OAuthExchangeError ? "exchange_failed" :
            "oauth_failed";
        frontendCallback.searchParams.set("error", reason);
        return c.redirect(frontendCallback.toString(), 302);
    }
});

authRoute.post("/oauth/exchange", async (c) => {
    const body = await c.req.json<{ code?: string }>().catch(() => null);
    if (!body?.code) return c.json(failure("VALIDATION_ERROR", "code is required."), 400);

    const result = await redeemExchangeCode(c.env.DB, c.env.JWT_SECRET, body.code);
    if (!result) return c.json(failure("INVALID_CODE", "This sign-in link has expired or was already used."), 401);

    return c.json(success(result), 200);
});
