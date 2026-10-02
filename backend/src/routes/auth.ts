import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    DeletedAccountFoundError,
    EmailTakenError,
    InvalidCredentialsError,
    InvalidUsernameError,
    NoDeletedAccountError,
    UsernameTakenError,
    loginUser,
    logoutOtherSessions,
    registerUser,
    restoreUser,
} from "../services/authService";
import { OAuthExchangeError } from "../services/oauthProviders";
import {
    InvalidProviderError,
    InvalidStateError,
    LinkExchangeFailedError,
    OAuthAlreadyLinkedError,
    OAuthUnlinkBlockedError,
    completeOAuthCallback,
    getLinkedProviders,
    redeemExchangeCode,
    startOAuth,
    storeExchangeCode,
    unlinkProvider,
} from "../services/oauthService";
import type { ResetPasswordCredential } from "../services/passwordResetService";
import { InvalidResetTokenError, requestPasswordReset, resetPassword, verifyResetCode } from "../services/passwordResetService";
import { RateLimitedError, assertNotRateLimited, clearRateLimit, consumeRateLimit, consumeResendCooldown, recordFailedAttempt } from "../services/rateLimitService";
import { runAfterResponse } from "../utils/background";
import { EMAIL_PATTERN, MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, USERNAME_RULE_MESSAGE, isBoundedString, normalizeIdentifier } from "../utils/identity";

export const authRoute = new Hono<AppEnv>();

// Review N-3: every body field is type- and length-checked before it reaches
// a service -- an object or number used to 500 deep inside a query. These
// are format checks that answer the same for every account, so they don't
// weaken the anti-enumeration rules of the reset routes.
const MAX_IDENTIFIER_LENGTH = MAX_EMAIL_LENGTH;
const MAX_USERNAME_INPUT_LENGTH = 64; // the real rule is USERNAME_PATTERN in the service; this only bounds garbage
const MAX_TOKEN_LENGTH = 512;
const RESET_CODE_PATTERN = /^\d{6}$/;

function rateLimitedResponse(c: Context<AppEnv>, err: RateLimitedError) {
    c.header("Retry-After", String(err.retryAfterSeconds));
    return c.json(failure("RATE_LIMITED", `Too many attempts. Try again in ${err.retryAfterSeconds} seconds.`), 429);
}

type AccountBody = { username: string; email: string; password: string };

// Shared by /register and /restore. Returns an error message, or null when
// the body is well-formed.
function accountBodyError(body: Record<string, unknown> | null): string | null {
    if (!body || !isBoundedString(body.username, MAX_USERNAME_INPUT_LENGTH) || !isBoundedString(body.email, MAX_EMAIL_LENGTH) || typeof body.password !== "string" || !body.password) {
        return "username, email, and password are required.";
    }
    if (!EMAIL_PATTERN.test(body.email.trim())) return "email is not a valid address.";
    if (body.password.length < MIN_PASSWORD_LENGTH) return `password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (body.password.length > MAX_PASSWORD_LENGTH) return `password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
    return null;
}

authRoute.post("/register", async (c) => {
    // Keyed by IP only (not per-email) -- the resource being protected is
    // "how many accounts can this source create," not any one address.
    // Every POST counts toward the IP's window regardless of outcome --
    // including validation failures, since a flood of malformed requests is
    // the same resource-abuse shape as a flood of valid-but-duplicate ones.
    try {
        await consumeRateLimit(c, "register", "");
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    const validationError = accountBodyError(body);
    if (validationError) return c.json(failure("VALIDATION_ERROR", validationError), 400);
    if (body!.confirmNewAccount !== undefined && typeof body!.confirmNewAccount !== "boolean") {
        return c.json(failure("VALIDATION_ERROR", "confirmNewAccount must be a boolean."), 400);
    }
    const { username, email, password } = body as AccountBody;
    const confirmNewAccount = body!.confirmNewAccount as boolean | undefined;

    try {
        const result = await registerUser(c.env.DB, c.env.JWT_SECRET, { username, email, password, confirmNewAccount });
        return c.json(success(result), 201);
    } catch (err) {
        if (err instanceof InvalidUsernameError) return c.json(failure("VALIDATION_ERROR", USERNAME_RULE_MESSAGE), 400);
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        if (err instanceof DeletedAccountFoundError) {
            return c.json(failure("DELETED_ACCOUNT_FOUND", "A deleted account exists with this email. Restore it, or confirm you want a new one."), 409);
        }
        throw err;
    }
});

authRoute.post("/restore", async (c) => {
    try {
        await consumeRateLimit(c, "register", "");
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    const validationError = accountBodyError(body);
    if (validationError) return c.json(failure("VALIDATION_ERROR", validationError), 400);
    const { username, email, password } = body as AccountBody;

    try {
        const result = await restoreUser(c.env.DB, c.env.JWT_SECRET, { username, email, password });
        return c.json(success(result), 200);
    } catch (err) {
        if (err instanceof InvalidUsernameError) return c.json(failure("VALIDATION_ERROR", USERNAME_RULE_MESSAGE), 400);
        if (err instanceof NoDeletedAccountError) return c.json(failure("NOT_FOUND", "No deleted account found for this email."), 404);
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        throw err;
    }
});

authRoute.post("/forgot-password", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!isBoundedString(body?.identifier, MAX_IDENTIFIER_LENGTH)) {
        return c.json(failure("VALIDATION_ERROR", "identifier is required."), 400);
    }
    // Throttle keys use the normalized form (review N-6): "Foo@x.at" and
    // "foo@x.at" share one cooldown and one abuse bucket. The lookup itself
    // gets the typed casing, so an exact-case legacy row still wins there
    // (see authService.ts's findLiveUserByIdentifier).
    const identifier = normalizeIdentifier(body.identifier);

    // D2's 60s resend cooldown (docs/superpowers/specs/2026-09-27-password-
    // reset-modernization-design.md §3.4 step 0) -- checked FIRST, before
    // the identifier is looked up against any user, and before the existing
    // (ip, identifier) abuse throttle below. Deliberately IP-independent and
    // keyed on the identifier alone: the point is that "please wait" (a
    // 429, same shape as the abuse throttle) fires identically whether or
    // not this identifier resolves to a real account, so submitting twice
    // fast can't be used to confirm account existence. Check and record are
    // one atomic step (review M-9): two parallel requests can't both pass.
    try {
        await consumeResendCooldown(c.env.DB, identifier);
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    // Keyed by (ip, identifier), same rationale as /login: an attacker must
    // not be able to email-bomb one victim's inbox from many IPs, while the
    // victim can still request their own reset from their own IP. Every
    // attempt counts regardless of outcome (like /register), since this
    // route has no distinguishable success/failure to condition on -- that
    // asymmetry is the whole point of the generic response below.
    try {
        await consumeRateLimit(c, "forgot-password", identifier);
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    // Review M-5 (timing): the lookup, token write and Resend call run after
    // the response is sent. Awaited, a real account answered noticeably
    // slower (one HTTP round trip to Resend) than an unknown identifier,
    // which returns at the first query. A failure anywhere in there is only
    // logged -- it must never become a distinguishable response.
    const identifierAsTyped = body.identifier;
    await runAfterResponse(c, "forgot-password: requestPasswordReset", () => requestPasswordReset(c.env.DB, c.env, identifierAsTyped));

    return c.json(success({ message: "If an account exists, a reset email has been sent." }));
});

// §3.5: always 200 with { valid, attemptsLeft } -- never a distinct error
// shape for "no such user" vs "wrong code" vs "code locked/expired", that
// uniformity is the whole anti-enumeration point (see
// passwordResetService.ts's verifyResetCode doc comment). Throttled
// generously since the dialog's live check (§4.3) fires on every completed
// 6-digit entry while typing, not just on deliberate submits.
authRoute.post("/verify-reset-code", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!isBoundedString(body?.identifier, MAX_IDENTIFIER_LENGTH) || typeof body.code !== "string" || !RESET_CODE_PATTERN.test(body.code)) {
        return c.json(failure("VALIDATION_ERROR", "identifier and a 6-digit code are required."), 400);
    }
    const identifier = normalizeIdentifier(body.identifier);

    try {
        await consumeRateLimit(c, "verify-reset-code", identifier);
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    const result = await verifyResetCode(c.env.DB, c.env.PASSWORD_CODE_SECRET, body.identifier, body.code);
    return c.json(success(result));
});

authRoute.post("/reset-password", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body || typeof body.newPassword !== "string" || !body.newPassword) {
        return c.json(failure("VALIDATION_ERROR", "newPassword is required."), 400);
    }
    if (body.newPassword.length < MIN_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters.`), 400);
    }
    if (body.newPassword.length > MAX_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `newPassword must be at most ${MAX_PASSWORD_LENGTH} characters.`), 400);
    }

    // Exactly one credential (D3's hybrid: a link token, or an
    // identifier+code pair) -- never both, never neither. Reject ambiguous,
    // incomplete or malformed bodies before doing any throttling/DB work.
    const hasToken = body.token !== undefined && body.token !== null && body.token !== "";
    const hasCode = (body.identifier !== undefined && body.identifier !== null && body.identifier !== "") || (body.code !== undefined && body.code !== null && body.code !== "");
    if (hasToken === hasCode) {
        return c.json(failure("VALIDATION_ERROR", "Provide exactly one of: token, or identifier+code."), 400);
    }
    let credential: ResetPasswordCredential;
    if (hasToken) {
        if (!isBoundedString(body.token, MAX_TOKEN_LENGTH)) return c.json(failure("VALIDATION_ERROR", "token is invalid."), 400);
        credential = { kind: "token", rawToken: body.token };
    } else {
        if (!isBoundedString(body.identifier, MAX_IDENTIFIER_LENGTH) || typeof body.code !== "string" || !RESET_CODE_PATTERN.test(body.code)) {
            return c.json(failure("VALIDATION_ERROR", "Provide exactly one of: token, or identifier+code."), 400);
        }
        credential = { kind: "code", identifier: body.identifier, code: body.code };
    }

    const throttleKey = credential.kind === "token" ? credential.rawToken : normalizeIdentifier(credential.identifier);
    try {
        await consumeRateLimit(c, "reset-password", throttleKey);
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    try {
        const result = await resetPassword(c.env.DB, c.env, credential, body.newPassword);
        return c.json(success(result));
    } catch (err) {
        if (err instanceof InvalidResetTokenError) {
            return c.json(failure("INVALID_RESET_TOKEN", "This reset link or code is invalid or has expired."), 400);
        }
        throw err;
    }
});

authRoute.post("/login", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!isBoundedString(body?.identifier, MAX_IDENTIFIER_LENGTH) || !isBoundedString(body.password, MAX_PASSWORD_LENGTH)) {
        return c.json(failure("VALIDATION_ERROR", "identifier and password are required."), 400);
    }
    const identifier = normalizeIdentifier(body.identifier);

    // Keyed by (ip, identifier) rather than identifier alone -- an attacker
    // spamming a victim's username from many IPs must not be able to lock
    // the victim out of logging in from their own IP.
    let rateLimit;
    try {
        rateLimit = await assertNotRateLimited(c, "login", identifier);
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

// Logging out this one device is a client-side token discard; this endpoint
// exists mainly to require a valid token before confirming the session is
// over. See documentation/Architecture.md.
authRoute.post("/logout", requireAuth, (c) => c.body(null, 204));

// Review N-7: signs out every other device by bumping token_version; the
// response carries a fresh token so the calling device stays signed in.
authRoute.post("/logout-all", requireAuth, async (c) => {
    const result = await logoutOtherSessions(c.env.DB, c.env.JWT_SECRET, c.get("userId"));
    return c.json(success(result));
});

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

// Unlike /start above, this must carry the caller's Bearer token, so it
// can't be a bare 302 target for a plain browser navigation -- the frontend
// calls it via the authenticated ApiClient, gets { redirectUrl } back as
// JSON, then navigates the browser there itself (NavigationManager with
// forceLoad, leaving the SPA).
authRoute.get("/oauth/:provider/link/start", requireAuth, async (c) => {
    // `?? ""` rather than a bare c.req.param(): same requireAuth + path-param
    // combo widens the return type to `string | undefined` under the current
    // TypeScript 7 preview compiler elsewhere too (see books.ts's
    // `c.req.param("username") ?? ""` on the /:id/shares/:username route) --
    // Hono still guarantees the value is present given the route's own
    // ":provider" segment, so this never actually falls back at runtime.
    const provider = c.req.param("provider") ?? "";
    const credentials = credentialsFor(c, provider);
    if (!credentials) return c.json(failure("INVALID_PROVIDER", `Unknown OAuth provider "${provider}".`), 400);

    try {
        const { redirectUrl } = await startOAuth(c.env.DB, provider, credentials.clientId, callbackUrl(c, provider), c.get("userId"));
        return c.json(success({ redirectUrl }));
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
    // See the existing comment below on plain-concatenation vs `new URL("/x",
    // base)` for why both of these are built the same deliberate way.
    const loginRedirect = new URL(`${c.env.FRONTEND_URL}/oauth-callback`);
    const profileRedirect = new URL(`${c.env.FRONTEND_URL}/profile`);

    if (!credentials || !code || !state) {
        loginRedirect.searchParams.set("error", "oauth_failed");
        return c.redirect(loginRedirect.toString(), 302);
    }

    try {
        const { userId, linked } = await completeOAuthCallback(c.env.DB, provider, code, state, credentials, callbackUrl(c, provider));
        if (linked) {
            // No new JWT is issued for a link -- the caller already has a
            // valid session; nothing to hand back through an exchange code.
            profileRedirect.searchParams.set("linked", provider);
            return c.redirect(profileRedirect.toString(), 302);
        }
        const exchangeCode = await storeExchangeCode(c.env.DB, userId);
        loginRedirect.searchParams.set("code", exchangeCode);
        return c.redirect(loginRedirect.toString(), 302);
    } catch (err) {
        if (err instanceof OAuthAlreadyLinkedError) {
            profileRedirect.searchParams.set("linkError", "already_linked");
            return c.redirect(profileRedirect.toString(), 302);
        }
        if (err instanceof LinkExchangeFailedError) {
            // Same underlying failure as OAuthExchangeError below (the
            // provider token exchange failed), but this was a link attempt
            // (see oauthService.ts's LinkExchangeFailedError comment) --
            // send it to the profile page, not the login-oriented one.
            profileRedirect.searchParams.set("linkError", "exchange_failed");
            return c.redirect(profileRedirect.toString(), 302);
        }
        const reason =
            err instanceof InvalidProviderError ? "invalid_provider" :
            err instanceof InvalidStateError ? "invalid_state" :
            err instanceof OAuthExchangeError ? "exchange_failed" :
            "oauth_failed";
        loginRedirect.searchParams.set("error", reason);
        return c.redirect(loginRedirect.toString(), 302);
    }
});

authRoute.post("/oauth/exchange", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!isBoundedString(body?.code, MAX_TOKEN_LENGTH)) return c.json(failure("VALIDATION_ERROR", "code is required."), 400);

    const result = await redeemExchangeCode(c.env.DB, c.env.JWT_SECRET, body.code);
    if (!result) return c.json(failure("INVALID_CODE", "This sign-in link has expired or was already used."), 401);

    return c.json(success(result), 200);
});

authRoute.get("/oauth/linked", requireAuth, async (c) => {
    const providers = await getLinkedProviders(c.env.DB, c.get("userId"));
    return c.json(success(providers));
});

// 200 { data: null } rather than a bare 204 -- see the plan's Global
// Constraints for why (UNLINK_BLOCKED needs to carry a message through the
// same envelope).
authRoute.delete("/oauth/:provider", requireAuth, async (c) => {
    try {
        await unlinkProvider(c.env.DB, c.get("userId"), c.req.param("provider") ?? ""); // same requireAuth + path-param typing gap as the /oauth/:provider/link route above
        return c.json(success(null));
    } catch (err) {
        if (err instanceof OAuthUnlinkBlockedError) {
            return c.json(failure("UNLINK_BLOCKED", "You can't remove your last sign-in method while no password is set."), 409);
        }
        throw err;
    }
});
