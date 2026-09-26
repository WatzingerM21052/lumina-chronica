# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user who forgot their password recover their account via an emailed reset link, reachable both from the Login page and from Settings (for a logged-in user who doesn't know their current password).

**Architecture:** A new `password_reset_tokens` table + `passwordResetService.ts` mirror the existing OAuth exchange-code pattern (`oauth_exchange_codes` / `oauthService.ts`) — a random high-entropy token, only its SHA-256 hash ever stored, single-use, time-boxed. A new `emailService.ts` wraps Resend's HTTP API behind one small, test-mockable function. Two new routes (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) and two new Blazor pages (`ForgotPassword.razor`, `ResetPassword.razor`) round it out, plus a link on Login and a button on Settings.

**Tech Stack:** Hono (Cloudflare Workers) backend, D1/SQLite, Vitest; Blazor WASM frontend, bUnit.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-09-26-forgot-password-design.md` — read it first for the full rationale; this plan implements it task-by-task.
- Reset token TTL: 1 hour (`PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60`).
- `POST /api/auth/forgot-password` never reveals whether the identifier matched an account — always the same `200` response.
- Rate-limited via the existing `rateLimitService.ts` (already used by `/login`/`/register` — do not skip this; an earlier draft of the design spec incorrectly claimed this codebase had no rate limiting at all).
- `/reset-password` itself is NOT rate-limited — its token is a 256-bit random value, matching `oauthService.ts`'s `redeemExchangeCode` (also unthrottled).
- No new dependencies — Resend is called via a plain `fetch()`, matching this Worker's existing style (`crypto.subtle` for password hashing instead of a bcrypt package).
- Every new/changed frontend surface uses `II18nService`/`de.json`/`en.json`/`FakeI18nService`, following the i18n Phase 1 pattern already established in this repo (see `frontend/LuminaChronica.Client/Services/I18nService.cs`).
- Never edit an already-merged migration file — this plan's schema change is a new file, `database/migrations/0025_password_reset.sql`.

---

### Task 1: Reset-token infrastructure + request-a-reset flow

**Files:**
- Create: `database/migrations/0025_password_reset.sql`
- Create: `backend/src/services/emailService.ts`
- Create: `backend/src/services/passwordResetService.ts`
- Modify: `backend/src/models/env.ts` (add `RESEND_API_KEY` to `Bindings`)
- Modify: `backend/.dev.vars` (add `RESEND_API_KEY` placeholder + comment)
- Modify: `backend/src/services/rateLimitService.ts` (add `FORGOT_PASSWORD_MAX_ATTEMPTS`)
- Modify: `backend/src/routes/auth.ts` (add `POST /forgot-password`)
- Test: `tests/backend/passwordReset.test.ts`

**Interfaces:**
- Produces: `sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<void>` (throws on a non-OK HTTP response).
- Produces: `requestPasswordReset(db: D1Database, resendApiKey: string, frontendUrl: string, identifier: string): Promise<void>` — never throws, never reveals whether a match was found.
- Produces: `FORGOT_PASSWORD_MAX_ATTEMPTS` (exported constant, `rateLimitService.ts`).
- Consumes (all pre-existing): `OAUTH_NO_PASSWORD_SENTINEL`, `hashPassword`, `randomToken`, `sha256Hex` from `backend/src/utils/crypto.ts`; `roleName` from `backend/src/services/authService.ts`; `assertNotRateLimited`, `recordFailedAttempt`, `RateLimitedError` from `backend/src/services/rateLimitService.ts`; `failure`/`success` from `backend/src/models/response.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- 0025_password_reset.sql
-- Forgot-password flow. Mirrors oauth_exchange_codes (0005_oauth.sql):
-- only a hash of the raw token is ever stored, single-use via consumed_at,
-- time-boxed via expires_at. TTL is 1 hour (set in
-- passwordResetService.ts) -- much longer than the exchange code's 2
-- minutes, since that one only has to survive an immediate redirect round
-- trip and this one has to survive the user actually checking their email.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Add `RESEND_API_KEY` to the Worker's env types**

In `backend/src/models/env.ts`, add one line to the `Bindings` type (after `BIBLE_API_KEY: string;`):

```ts
    RESEND_API_KEY: string;
```

- [ ] **Step 3: Add a local-dev placeholder for the new secret**

In `backend/.dev.vars`, append:

```
# Forgot-password flow. Get a real key from resend.com once
# luminachronica.com is verified there -- until then, sendEmail() will
# fail and passwordResetService.ts logs it (never surfaced to the user),
# same as OAuth's *_CLIENT_SECRET placeholders above until those are filled in.
RESEND_API_KEY=
```

- [ ] **Step 4: Write `emailService.ts`**

```ts
// Wraps Resend's HTTP API behind one small, test-mockable function -- no
// SDK dependency, consistent with this Worker's "native APIs over
// dependencies" style elsewhere (e.g. crypto.subtle for password hashing
// instead of a bcrypt package).
export async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: "Lumina Chronica <noreply@luminachronica.com>", to, subject, html }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${response.status}`);
}
```

- [ ] **Step 5: Add `FORGOT_PASSWORD_MAX_ATTEMPTS` to `rateLimitService.ts`**

In `backend/src/services/rateLimitService.ts`, change:

```ts
export const LOGIN_MAX_ATTEMPTS = 8;
export const REGISTER_MAX_ATTEMPTS = 8;
```

to:

```ts
export const LOGIN_MAX_ATTEMPTS = 8;
export const REGISTER_MAX_ATTEMPTS = 8;
export const FORGOT_PASSWORD_MAX_ATTEMPTS = 5;
```

Then change `assertNotRateLimited`'s body from:

```ts
export async function assertNotRateLimited(c: { env: { DB: D1Database }; req: { header(name: string): string | undefined } }, route: string, identifier: string): Promise<{ ip: string; identifier: string }> {
    const ip = getClientIp(c);
    await checkLimit(c.env.DB, route, ip, identifier, route === "login" ? LOGIN_MAX_ATTEMPTS : REGISTER_MAX_ATTEMPTS);
    return { ip, identifier };
}
```

to:

```ts
function maxAttemptsFor(route: string): number {
    if (route === "login") return LOGIN_MAX_ATTEMPTS;
    if (route === "forgot-password") return FORGOT_PASSWORD_MAX_ATTEMPTS;
    return REGISTER_MAX_ATTEMPTS;
}

export async function assertNotRateLimited(c: { env: { DB: D1Database }; req: { header(name: string): string | undefined } }, route: string, identifier: string): Promise<{ ip: string; identifier: string }> {
    const ip = getClientIp(c);
    await checkLimit(c.env.DB, route, ip, identifier, maxAttemptsFor(route));
    return { ip, identifier };
}
```

This only adds a third branch — `/login` and `/register`'s existing behavior and existing tests (`tests/backend/auth.test.ts`) are unaffected.

- [ ] **Step 6: Write `passwordResetService.ts`'s `requestPasswordReset`**

```ts
import { OAUTH_NO_PASSWORD_SENTINEL, hashPassword, randomToken, sha256Hex, signJwt } from "../utils/crypto";
import { roleName } from "./authService";
import { sendEmail } from "./emailService";

const TOKEN_TTL_SECONDS = 60 * 60;
// Matches authService.ts's own TOKEN_EXPIRY_SECONDS -- a reset-and-login
// should land the user in the same 7-day session as any other login.
const JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export class InvalidResetTokenError extends Error {}

type UserRow = { id: number; email: string; password_hash: string; role_id: number };

async function findUserByIdentifier(db: D1Database, identifier: string): Promise<UserRow | null> {
    // Same lookup as authService.ts's loginUser -- email or username, case
    // as stored, excluding soft-deleted accounts.
    return db
        .prepare("SELECT id, email, password_hash, role_id FROM users WHERE (email = ?1 OR username = ?1) AND deleted_at IS NULL")
        .bind(identifier)
        .first<UserRow>();
}

// Never throws and never reveals whether a match was found -- the caller
// (the /forgot-password route) always returns the same generic response
// regardless of what happens in here. Token generation mirrors
// oauthService.ts's storeExchangeCode: randomToken() + sha256Hex(), only
// the hash stored.
export async function requestPasswordReset(db: D1Database, resendApiKey: string, frontendUrl: string, identifier: string): Promise<void> {
    const user = await findUserByIdentifier(db, identifier);
    if (!user) return;

    if (user.password_hash === OAUTH_NO_PASSWORD_SENTINEL) {
        await sendEmail(
            resendApiKey,
            user.email,
            "Lumina Chronica: Kein Passwort zum Zurücksetzen",
            "<p>Dieser Account meldet sich über Google oder GitHub an und hat kein eigenes Passwort. Melde dich stattdessen über den jeweiligen Button an.</p>"
        );
        return;
    }

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
    await db
        .prepare("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(tokenHash, user.id, expiresAt)
        .run();

    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    await sendEmail(
        resendApiKey,
        user.email,
        "Lumina Chronica: Passwort zurücksetzen",
        `<p>Klicke auf den folgenden Link, um dein Passwort zurückzusetzen (1 Stunde gültig):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    );
}
```

`resetPassword` (the consuming half) is added in Task 2 — `hashPassword`, `signJwt`, and `JWT_EXPIRY_SECONDS` above are unused until then, which is expected and will not cause a lint/build failure (they're exported-module-level imports, TypeScript doesn't flag unused imports as errors in this project's config — confirm by running the build in Step 9 below).

- [ ] **Step 7: Add the `POST /forgot-password` route**

In `backend/src/routes/auth.ts`, add to the existing import block:

```ts
import { requestPasswordReset } from "../services/passwordResetService";
```

Then add this route (after `/restore`, before `/login` — matches the design doc's ordering, doesn't functionally matter):

```ts
authRoute.post("/forgot-password", async (c) => {
    const body = await c.req.json<{ identifier?: string }>().catch(() => null);
    if (!body?.identifier) {
        return c.json(failure("VALIDATION_ERROR", "identifier is required."), 400);
    }

    // Keyed by (ip, identifier), same rationale as /login: an attacker must
    // not be able to email-bomb one victim's inbox from many IPs, while the
    // victim can still request their own reset from their own IP. Every
    // attempt counts regardless of outcome (like /register), since this
    // route has no distinguishable success/failure to condition on -- that
    // asymmetry is the whole point of the generic response below.
    let rateLimit;
    try {
        rateLimit = await assertNotRateLimited(c, "forgot-password", body.identifier);
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }
    await recordFailedAttempt(c.env.DB, "forgot-password", rateLimit.ip, rateLimit.identifier);

    try {
        await requestPasswordReset(c.env.DB, c.env.RESEND_API_KEY, c.env.FRONTEND_URL, body.identifier);
    } catch (err) {
        // An email-provider outage shouldn't leak through as a
        // distinguishable response, or 500 the request -- the token row
        // (if any) already exists by this point regardless.
        console.error("forgot-password: sendEmail failed", err);
    }

    return c.json(success({ message: "If an account exists, a reset email has been sent." }));
});
```

- [ ] **Step 8: Write the failing tests**

Create `tests/backend/passwordReset.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { OAUTH_NO_PASSWORD_SENTINEL } from "../../backend/src/utils/crypto";
import { FORGOT_PASSWORD_MAX_ATTEMPTS } from "../../backend/src/services/rateLimitService";
import { createFakeD1 } from "./fakeD1";
import { readJson } from "./testUtils";

type TestEnv = { DB: D1Database; JWT_SECRET: string; RESEND_API_KEY: string; FRONTEND_URL: string };

let env: TestEnv;

beforeEach(() => {
    env = {
        DB: createFakeD1(),
        JWT_SECRET: "test-secret-do-not-use-in-production",
        RESEND_API_KEY: "test-resend-key",
        FRONTEND_URL: "https://example.test/some-app",
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "email-id" }), { status: 200 })));
});

function jsonRequest(body: unknown) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

describe("POST /api/auth/forgot-password", () => {
    it("sends a reset email for an existing account and stores a hashed token", async () => {
        const register = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }),
            env
        );
        const { data: registered } = await readJson(register);

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).success).toBe(true);

        expect(globalThis.fetch).toHaveBeenCalledOnce();
        const [url, init] = (globalThis.fetch as any).mock.calls[0];
        expect(url).toBe("https://api.resend.com/emails");
        expect(JSON.parse(init.body).to).toBe("alice@example.com");

        const row = await env.DB.prepare("SELECT * FROM password_reset_tokens WHERE user_id = ?").bind(registered.userId).first<any>();
        expect(row).not.toBeNull();
        expect(row.token_hash).not.toContain("http"); // never the raw URL/token, just its hash
        expect(row.consumed_at).toBeNull();
    });

    it("returns the same generic response for a non-existent identifier, and sends no email", async () => {
        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "nobody@example.com" }), env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).success).toBe(true);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("sends an informational email (no token) for an OAuth-only account", async () => {
        const register = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "oauthuser", email: "oauth@example.com", password: "correct horse" }),
            env
        );
        const { data: registered } = await readJson(register);
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(OAUTH_NO_PASSWORD_SENTINEL, registered.userId).run();

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "oauth@example.com" }), env);
        expect(res.status).toBe(200);

        expect(globalThis.fetch).toHaveBeenCalledOnce();
        const [, init] = (globalThis.fetch as any).mock.calls[0];
        expect(JSON.parse(init.body).subject).toContain("Kein Passwort");

        const row = await env.DB.prepare("SELECT * FROM password_reset_tokens WHERE user_id = ?").bind(registered.userId).first();
        expect(row).toBeNull();
    });

    it("rejects a missing identifier with 400", async () => {
        const res = await app.request("/api/auth/forgot-password", jsonRequest({}), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 429 after too many requests against the same identifier", async () => {
        for (let i = 0; i < FORGOT_PASSWORD_MAX_ATTEMPTS; i++) {
            const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
            expect(res.status).toBe(200);
        }

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(429);
        expect(json.error.code).toBe("RATE_LIMITED");
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });

    it("does not fail the request if the email provider errors", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("server error", { status: 500 })));
        await app.request("/api/auth/register", jsonRequest({ username: "bob", email: "bob@example.com", password: "correct horse" }), env);

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "bob@example.com" }), env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).success).toBe(true);
    });
});
```

- [ ] **Step 9: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run passwordReset.test.ts`
Expected: FAIL — `Cannot find module '../../backend/src/services/passwordResetService'` or similar, since `requestPasswordReset` isn't wired into the route yet if you're doing this test-first (if you wrote Steps 1-7 first as instructed above, this file should mostly PASS already except any typos — either order is fine here since this task's steps are already presented implementation-first for readability; if tests fail for a reason other than "not implemented yet", fix the implementation, not the test).

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run passwordReset.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 11: Run the full backend suite and the build**

Run: `cd tests/backend && npx vitest run` (expect all prior tests still passing, including `auth.test.ts`'s login/register rate-limit tests, unaffected by Step 5)
Run: `cd backend && npx tsc --noEmit` (or the project's existing typecheck command — confirms the currently-unused `hashPassword`/`signJwt`/`JWT_EXPIRY_SECONDS` imports in `passwordResetService.ts` don't break the build)

- [ ] **Step 12: Commit**

```bash
git add database/migrations/0025_password_reset.sql backend/src/services/emailService.ts backend/src/services/passwordResetService.ts backend/src/models/env.ts backend/.dev.vars backend/src/services/rateLimitService.ts backend/src/routes/auth.ts tests/backend/passwordReset.test.ts
git commit -m "feat: forgot-password request flow (token issuance + email)"
```

---

### Task 2: Reset-password consumption flow

**Files:**
- Modify: `backend/src/services/passwordResetService.ts` (add `resetPassword`)
- Modify: `backend/src/routes/auth.ts` (add `POST /reset-password`)
- Test: `tests/backend/passwordReset.test.ts` (extend)

**Interfaces:**
- Consumes: `InvalidResetTokenError`, `TOKEN_TTL_SECONDS` pattern and `password_reset_tokens` table from Task 1.
- Produces: `resetPassword(db: D1Database, jwtSecret: string, rawToken: string, newPassword: string): Promise<{ token: string; userId: number }>` — throws `InvalidResetTokenError` if the token is missing/expired/already used.

- [ ] **Step 1: Write the failing tests**

Append to `tests/backend/passwordReset.test.ts`:

```ts
async function requestResetAndGetRawToken(identifier: string): Promise<string> {
    await app.request("/api/auth/forgot-password", jsonRequest({ identifier }), env);
    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const html = JSON.parse(init.body).html as string;
    const match = html.match(/token=([\w-]+)/);
    if (!match) throw new Error("no token found in the stubbed email body");
    return match[1];
}

describe("POST /api/auth/reset-password", () => {
    beforeEach(async () => {
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "alice@example.com", password: "old password" }),
            env
        );
    });

    it("sets a new password, consumes the token, and logs the user in", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(typeof json.data.token).toBe("string");
        expect(typeof json.data.userId).toBe("number");

        const login = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "new password" }), env);
        expect(login.status).toBe(200);

        const oldLogin = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "old password" }), env);
        expect(oldLogin.status).toBe(401);
    });

    it("rejects re-using an already-consumed token", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");
        await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "another password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("rejects an unknown token", async () => {
        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: "not-a-real-token", newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("rejects an expired token", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");
        await env.DB.prepare("UPDATE password_reset_tokens SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)")
            .bind(new Date(Date.now() - 1000).toISOString(), "alice@example.com")
            .run();

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("rejects a too-short new password", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");
        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "short" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run passwordReset.test.ts`
Expected: FAIL — `resetPassword is not a function` / route returns 404, since neither exists yet.

- [ ] **Step 3: Add `resetPassword` to `passwordResetService.ts`**

Append to `backend/src/services/passwordResetService.ts`:

```ts
export async function resetPassword(db: D1Database, jwtSecret: string, rawToken: string, newPassword: string): Promise<{ token: string; userId: number }> {
    const tokenHash = await sha256Hex(rawToken);
    // Atomic consume -- same UPDATE ... RETURNING pattern as
    // oauthService.ts's redeemExchangeCode, so a token can never be
    // consumed twice even under concurrent requests.
    const row = await db
        .prepare(
            "UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP " +
                "WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP " +
                "RETURNING user_id"
        )
        .bind(tokenHash)
        .first<{ user_id: number }>();
    if (!row) throw new InvalidResetTokenError();

    const passwordHash = await hashPassword(newPassword);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, row.user_id).run();

    const user = await db.prepare("SELECT role_id FROM users WHERE id = ?").bind(row.user_id).first<{ role_id: number }>();
    const role = user ? await roleName(db, user.role_id) : "USER";
    const token = await signJwt({ sub: row.user_id, role }, jwtSecret, JWT_EXPIRY_SECONDS);
    return { token, userId: row.user_id };
}
```

- [ ] **Step 4: Add the `POST /reset-password` route**

In `backend/src/routes/auth.ts`, extend the `passwordResetService` import:

```ts
import { InvalidResetTokenError, requestPasswordReset, resetPassword } from "../services/passwordResetService";
```

Then add, right after the `/forgot-password` route:

```ts
authRoute.post("/reset-password", async (c) => {
    const body = await c.req.json<{ token?: string; newPassword?: string }>().catch(() => null);
    if (!body?.token || !body?.newPassword) {
        return c.json(failure("VALIDATION_ERROR", "token and newPassword are required."), 400);
    }
    if (body.newPassword.length < MIN_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters.`), 400);
    }

    try {
        const result = await resetPassword(c.env.DB, c.env.JWT_SECRET, body.token, body.newPassword);
        return c.json(success(result));
    } catch (err) {
        if (err instanceof InvalidResetTokenError) {
            return c.json(failure("INVALID_RESET_TOKEN", "This reset link is invalid or has expired."), 400);
        }
        throw err;
    }
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run passwordReset.test.ts`
Expected: PASS, all 11 tests (6 from Task 1 + 5 new).

- [ ] **Step 6: Run the full backend suite**

Run: `cd tests/backend && npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/passwordResetService.ts backend/src/routes/auth.ts tests/backend/passwordReset.test.ts
git commit -m "feat: reset-password consumption flow"
```

---

### Task 3: Frontend models + i18n keys

**Files:**
- Modify: `frontend/LuminaChronica.Client/Models/Auth.cs` (add `ForgotPasswordRequest`, `ResetPasswordRequest`)
- Modify: `frontend/LuminaChronica.Client/wwwroot/i18n/de.json`
- Modify: `frontend/LuminaChronica.Client/wwwroot/i18n/en.json`
- Modify: `tests/frontend/FakeI18nService.cs`

**Interfaces:**
- Produces: `ForgotPasswordRequest { Identifier }`, `ResetPasswordRequest { Token, NewPassword }` — consumed by Tasks 4 and 5.
- Produces: i18n keys `login.forgotPasswordLink`, `forgotPassword.*`, `resetPassword.*`, `settings.passwordReset*` — consumed by Tasks 4-6.

- [ ] **Step 1: Add the request models**

In `frontend/LuminaChronica.Client/Models/Auth.cs`, add after `LoginRequest`'s closing brace:

```csharp
public class ForgotPasswordRequest
{
    [JsonPropertyName("identifier")]
    public string Identifier { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    [JsonPropertyName("token")]
    public string Token { get; set; } = string.Empty;

    [JsonPropertyName("newPassword")]
    public string NewPassword { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Add German keys (source of truth)**

In `frontend/LuminaChronica.Client/wwwroot/i18n/de.json`, change:

```json
  "login.noAccount": "Noch kein Konto?",
  "login.registerLink": "Registrieren",
  "login.defaultError": "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
```

to:

```json
  "login.noAccount": "Noch kein Konto?",
  "login.registerLink": "Registrieren",
  "login.defaultError": "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
  "login.forgotPasswordLink": "Passwort vergessen?",
```

and, right before the closing `}`, replace:

```json
  "oauth.divider": "oder",
  "oauth.google": "Mit Google anmelden",
  "oauth.github": "Mit GitHub anmelden"
}
```

with:

```json
  "oauth.divider": "oder",
  "oauth.google": "Mit Google anmelden",
  "oauth.github": "Mit GitHub anmelden",

  "forgotPassword.title": "Passwort vergessen",
  "forgotPassword.identifierLabel": "E-Mail oder Benutzername",
  "forgotPassword.submitButton": "Reset-Link senden",
  "forgotPassword.submitting": "Wird gesendet...",
  "forgotPassword.successMessage": "Falls ein Konto mit diesen Angaben existiert, wurde eine E-Mail mit einem Reset-Link verschickt.",
  "forgotPassword.defaultError": "Anfrage fehlgeschlagen. Bitte versuche es erneut.",
  "forgotPassword.backToLogin": "Zurück zur Anmeldung",

  "resetPassword.title": "Neues Passwort setzen",
  "resetPassword.newPasswordLabel": "Neues Passwort",
  "resetPassword.confirmPasswordLabel": "Passwort bestätigen",
  "resetPassword.submitButton": "Passwort setzen",
  "resetPassword.submitting": "Wird gesetzt...",
  "resetPassword.passwordMismatch": "Die Passwörter stimmen nicht überein.",
  "resetPassword.invalidToken": "Dieser Link ist ungültig oder abgelaufen.",
  "resetPassword.backToForgotPassword": "Neuen Link anfordern",
  "resetPassword.successToast": "Passwort erfolgreich geändert.",
  "resetPassword.defaultError": "Zurücksetzen fehlgeschlagen. Bitte versuche es erneut.",

  "settings.passwordResetTitle": "Passwort",
  "settings.passwordResetButton": "Passwort-Reset-Link senden",
  "settings.passwordResetToast": "Reset-Link wurde an deine E-Mail-Adresse gesendet.",
  "settings.passwordResetError": "Senden fehlgeschlagen. Bitte versuche es erneut."
}
```

- [ ] **Step 3: Mirror the same keys in English**

In `frontend/LuminaChronica.Client/wwwroot/i18n/en.json`, change:

```json
  "login.noAccount": "Don't have an account yet?",
  "login.registerLink": "Register",
  "login.defaultError": "Sign-in failed. Please try again.",
```

to:

```json
  "login.noAccount": "Don't have an account yet?",
  "login.registerLink": "Register",
  "login.defaultError": "Sign-in failed. Please try again.",
  "login.forgotPasswordLink": "Forgot your password?",
```

and replace:

```json
  "oauth.divider": "or",
  "oauth.google": "Sign in with Google",
  "oauth.github": "Sign in with GitHub"
}
```

with:

```json
  "oauth.divider": "or",
  "oauth.google": "Sign in with Google",
  "oauth.github": "Sign in with GitHub",

  "forgotPassword.title": "Forgot Password",
  "forgotPassword.identifierLabel": "Email or Username",
  "forgotPassword.submitButton": "Send Reset Link",
  "forgotPassword.submitting": "Sending...",
  "forgotPassword.successMessage": "If an account with these details exists, an email with a reset link has been sent.",
  "forgotPassword.defaultError": "Request failed. Please try again.",
  "forgotPassword.backToLogin": "Back to Sign In",

  "resetPassword.title": "Set New Password",
  "resetPassword.newPasswordLabel": "New Password",
  "resetPassword.confirmPasswordLabel": "Confirm Password",
  "resetPassword.submitButton": "Set Password",
  "resetPassword.submitting": "Setting...",
  "resetPassword.passwordMismatch": "The passwords do not match.",
  "resetPassword.invalidToken": "This link is invalid or has expired.",
  "resetPassword.backToForgotPassword": "Request a New Link",
  "resetPassword.successToast": "Password changed successfully.",
  "resetPassword.defaultError": "Reset failed. Please try again.",

  "settings.passwordResetTitle": "Password",
  "settings.passwordResetButton": "Send Password Reset Link",
  "settings.passwordResetToast": "A reset link has been sent to your email address.",
  "settings.passwordResetError": "Sending failed. Please try again."
}
```

- [ ] **Step 4: Extend `FakeI18nService`'s German dictionary (must stay complete — it's the fallback)**

In `tests/frontend/FakeI18nService.cs`, change:

```csharp
        ["login.noAccount"] = "Noch kein Konto?",
        ["login.registerLink"] = "Registrieren",
        ["login.defaultError"] = "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
```

to:

```csharp
        ["login.noAccount"] = "Noch kein Konto?",
        ["login.registerLink"] = "Registrieren",
        ["login.defaultError"] = "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
        ["login.forgotPasswordLink"] = "Passwort vergessen?",
```

and change:

```csharp
        ["oauth.divider"] = "oder",
        ["oauth.google"] = "Mit Google anmelden",
        ["oauth.github"] = "Mit GitHub anmelden",
    };
```

to:

```csharp
        ["oauth.divider"] = "oder",
        ["oauth.google"] = "Mit Google anmelden",
        ["oauth.github"] = "Mit GitHub anmelden",

        ["forgotPassword.title"] = "Passwort vergessen",
        ["forgotPassword.identifierLabel"] = "E-Mail oder Benutzername",
        ["forgotPassword.submitButton"] = "Reset-Link senden",
        ["forgotPassword.submitting"] = "Wird gesendet...",
        ["forgotPassword.successMessage"] = "Falls ein Konto mit diesen Angaben existiert, wurde eine E-Mail mit einem Reset-Link verschickt.",
        ["forgotPassword.defaultError"] = "Anfrage fehlgeschlagen. Bitte versuche es erneut.",
        ["forgotPassword.backToLogin"] = "Zurück zur Anmeldung",

        ["resetPassword.title"] = "Neues Passwort setzen",
        ["resetPassword.newPasswordLabel"] = "Neues Passwort",
        ["resetPassword.confirmPasswordLabel"] = "Passwort bestätigen",
        ["resetPassword.submitButton"] = "Passwort setzen",
        ["resetPassword.submitting"] = "Wird gesetzt...",
        ["resetPassword.passwordMismatch"] = "Die Passwörter stimmen nicht überein.",
        ["resetPassword.invalidToken"] = "Dieser Link ist ungültig oder abgelaufen.",
        ["resetPassword.backToForgotPassword"] = "Neuen Link anfordern",
        ["resetPassword.successToast"] = "Passwort erfolgreich geändert.",
        ["resetPassword.defaultError"] = "Zurücksetzen fehlgeschlagen. Bitte versuche es erneut.",

        ["settings.passwordResetTitle"] = "Passwort",
        ["settings.passwordResetButton"] = "Passwort-Reset-Link senden",
        ["settings.passwordResetToast"] = "Reset-Link wurde an deine E-Mail-Adresse gesendet.",
        ["settings.passwordResetError"] = "Senden fehlgeschlagen. Bitte versuche es erneut.",
    };
```

Leave the `English` dictionary as-is for now — Tasks 4-6 add exactly the English entries their own new tests assert on, per this file's own stated policy (English only needs the subset actually tested, German must stay complete since it's the fallback).

- [ ] **Step 5: Build to confirm nothing broke**

Run: `cd frontend/LuminaChronica.Client && dotnet build --nologo`
Expected: Build succeeds (this task adds no new page/component, so no new test run is meaningful yet — Task 4 covers that).

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/Models/Auth.cs frontend/LuminaChronica.Client/wwwroot/i18n/de.json frontend/LuminaChronica.Client/wwwroot/i18n/en.json tests/frontend/FakeI18nService.cs
git commit -m "feat: forgot-password frontend models and i18n keys"
```

---

### Task 4: Login link + ForgotPassword page

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Login.razor`
- Create: `frontend/LuminaChronica.Client/Pages/ForgotPassword.razor`
- Test: `tests/frontend/LoginPageTests.cs` (extend)
- Test: `tests/frontend/ForgotPasswordPageTests.cs` (new)

**Interfaces:**
- Consumes: `ForgotPasswordRequest` (Task 3), `ApiClient.PostAsync<TRequest>(url, body)` bool-returning overload (pre-existing, `frontend/LuminaChronica.Client/Services/ApiClient.cs:138`), `II18nService`, `RoutedFakeHttpMessageHandler`/`FakeHttpMessageHandler`/`FakeI18nService` (pre-existing test infra).

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/ForgotPasswordPageTests.cs`:

```csharp
using System.Net;
using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ForgotPasswordPageTests : BunitContext
{
    private static void RegisterServices(BunitContext context, FakeHttpMessageHandler handler)
    {
        context.Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        context.Services.AddSingleton<ApiClient>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void ForgotPassword_RendersIdentifierField()
    {
        RegisterServices(this, new FakeHttpMessageHandler("""{"success":true}"""));

        var cut = Render<ForgotPassword>();

        Assert.NotNull(cut.Find("#identifier"));
        Assert.NotNull(cut.Find("button[type=submit]"));
    }

    [Fact]
    public void ForgotPassword_OnSubmit_ShowsGenericSuccessMessage()
    {
        RegisterServices(this, new FakeHttpMessageHandler("""{"success":true,"data":{"message":"ok"}}"""));

        var cut = Render<ForgotPassword>();
        cut.Find("#identifier").Change("alice@example.com");
        cut.Find("form").Submit();

        Assert.Contains("Falls ein Konto mit diesen Angaben existiert", cut.Markup);
        Assert.Null(cut.FindAll("#identifier").FirstOrDefault());
    }

    [Fact]
    public void ForgotPassword_OnFailure_ShowsErrorMessage()
    {
        // FakeHttpMessageHandler always returns 200 OK regardless of body,
        // so it can't simulate a failure for ApiClient's bool-returning
        // PostAsync<TRequest> overload (checks IsSuccessStatusCode only,
        // ignores the response body entirely). RoutedFakeHttpMessageHandler
        // with a custom status code is what's actually needed here.
        var handler = new RoutedFakeHttpMessageHandler().When(_ => true, _ => new HttpResponseMessage(HttpStatusCode.TooManyRequests));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();

        var cut = Render<ForgotPassword>();
        cut.Find("#identifier").Change("alice@example.com");
        cut.Find("form").Submit();

        Assert.Contains("Anfrage fehlgeschlagen", cut.Markup);
    }
}
```

Add `using System.Net;` to this file's usings (needed for `HttpStatusCode`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests/frontend && dotnet test --filter ForgotPasswordPageTests`
Expected: FAIL to compile — `ForgotPassword` type doesn't exist yet.

- [ ] **Step 3: Add the "Passwort vergessen?" link to Login.razor**

In `frontend/LuminaChronica.Client/Pages/Login.razor`, change:

```razor
    <div class="form-group">
        <label for="password">@I18n.T("login.passwordLabel")</label>
        <InputText id="password" type="password" @bind-Value="_request.Password" />
    </div>

    @if (_isSubmitting)
```

to:

```razor
    <div class="form-group">
        <label for="password">@I18n.T("login.passwordLabel")</label>
        <InputText id="password" type="password" @bind-Value="_request.Password" />
    </div>

    <p class="text-muted"><a href="forgot-password">@I18n.T("login.forgotPasswordLink")</a></p>

    @if (_isSubmitting)
```

- [ ] **Step 4: Write `ForgotPassword.razor`**

```razor
@page "/forgot-password"
@using LuminaChronica.Client.Components
@using LuminaChronica.Client.Models
@using LuminaChronica.Client.Services
@inject ApiClient ApiClient
@inject II18nService I18n

<PageTitle>@I18n.T("forgotPassword.title") — Lumina Chronica</PageTitle>

<h1>@I18n.T("forgotPassword.title")</h1>

@if (_submitted)
{
    <p>@I18n.T("forgotPassword.successMessage")</p>
}
else
{
    <EditForm Model="_request" OnValidSubmit="SubmitAsync" class="auth-form">
        <DataAnnotationsValidator />

        @if (_errorMessage is not null)
        {
            <p class="form-error">@_errorMessage</p>
        }

        <div class="form-group">
            <label for="identifier">@I18n.T("forgotPassword.identifierLabel")</label>
            <InputText id="identifier" @bind-Value="_request.Identifier" />
        </div>

        @if (_isSubmitting)
        {
            <LoadingIndicator Text="@I18n.T("forgotPassword.submitting")" />
        }
        else
        {
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">@I18n.T("forgotPassword.submitButton")</button>
            </div>
        }
    </EditForm>
}

<p class="text-muted"><a href="login">@I18n.T("forgotPassword.backToLogin")</a></p>

@code {
    private readonly ForgotPasswordRequest _request = new();
    private bool _isSubmitting;
    private bool _submitted;
    private string? _errorMessage;

    private async Task SubmitAsync()
    {
        _isSubmitting = true;
        _errorMessage = null;

        var ok = await ApiClient.PostAsync("/api/auth/forgot-password", _request);

        if (ok)
        {
            _submitted = true;
        }
        else
        {
            _errorMessage = I18n.T("forgotPassword.defaultError");
        }
        _isSubmitting = false;
    }
}
```

- [ ] **Step 5: Add the Login-link test**

Append to `tests/frontend/LoginPageTests.cs` (inside the `LoginPageTests` class, after `Login_RendersInEnglish_WhenLanguageIsEnglish`):

```csharp
    [Fact]
    public void Login_RendersForgotPasswordLink()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_CREDENTIALS","message":"unused"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<Login>();

        var link = cut.Find("a[href='forgot-password']");
        Assert.Equal("Passwort vergessen?", link.TextContent);
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd tests/frontend && dotnet test --filter "ForgotPasswordPageTests|Login_RendersForgotPasswordLink"`
Expected: PASS, all 4 new tests.

- [ ] **Step 7: Run the full frontend suite**

Run: `cd tests/frontend && dotnet test --nologo`
Expected: PASS, no regressions (423 + 4 new = 427).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Login.razor frontend/LuminaChronica.Client/Pages/ForgotPassword.razor tests/frontend/LoginPageTests.cs tests/frontend/ForgotPasswordPageTests.cs
git commit -m "feat: forgot-password link on Login + ForgotPassword page"
```

---

### Task 5: ResetPassword page

**Files:**
- Create: `frontend/LuminaChronica.Client/Pages/ResetPassword.razor`
- Test: `tests/frontend/ResetPasswordPageTests.cs` (new)

**Interfaces:**
- Consumes: `ResetPasswordRequest` (Task 3), `AuthResult` (pre-existing), `ApiClient.PostAsync<TRequest, TResponse>` (pre-existing), `LuminaAuthStateProvider.MarkUserAsAuthenticatedAsync(string)` (pre-existing), `ToastService.Show(string, ToastKind)` (pre-existing), the manual query-string-parsing pattern from `OAuthCallback.razor` (pre-existing, mirrored here for `?token=`).

- [ ] **Step 1: Write the failing tests**

Create `tests/frontend/ResetPasswordPageTests.cs`:

```csharp
using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ResetPasswordPageTests : BunitContext
{
    private static void RegisterAuthServices(BunitContext context)
    {
        context.Services.AddSingleton<TokenStore>();
        context.Services.AddSingleton<LuminaAuthStateProvider>();
        context.Services.AddSingleton<ToastService>();
        context.Services.AddSingleton<II18nService, FakeI18nService>();
    }

    [Fact]
    public void ResetPassword_WithToken_RendersForm()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();

        Assert.NotNull(cut.Find("#newPassword"));
        Assert.NotNull(cut.Find("#confirmPassword"));
    }

    [Fact]
    public void ResetPassword_WithoutToken_ShowsInvalidTokenMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);

        var cut = Render<ResetPassword>();

        Assert.Contains("Dieser Link ist ungültig oder abgelaufen.", cut.Markup);
        Assert.Empty(cut.FindAll("#newPassword"));
    }

    [Fact]
    public void ResetPassword_MismatchedPasswords_ShowsErrorWithoutCallingApi()
    {
        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();
        cut.Find("#newPassword").Change("new password");
        cut.Find("#confirmPassword").Change("does not match");
        cut.Find("form").Submit();

        Assert.Contains("Die Passwörter stimmen nicht überein.", cut.Markup);
    }

    [Fact]
    public void ResetPassword_OnSuccess_LogsInAndNavigatesHome()
    {
        // Loose mode: a successful reset calls MarkUserAsAuthenticatedAsync,
        // which lazy-imports js/auth.js via TokenStore -- unrelated to what
        // this test actually verifies. Same pattern as
        // OAuthCallbackPageTests.cs's OAuthCallback_WithValidCode_LogsInAndRedirectsHome
        // (ResetPassword.razor's success path is structurally identical to
        // OAuthCallback.razor's).
        JSInterop.Mode = JSRuntimeMode.Loose;

        var handler = new FakeHttpMessageHandler("""{"success":true,"data":{"token":"jwt-value","userId":1}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        var navManager = Services.GetRequiredService<NavigationManager>();
        navManager.NavigateTo("reset-password?token=abc123");

        var cut = Render<ResetPassword>();
        cut.Find("#newPassword").Change("new password");
        cut.Find("#confirmPassword").Change("new password");
        cut.Find("form").Submit();

        Assert.Equal(navManager.BaseUri, navManager.Uri);
    }

    [Fact]
    public void ResetPassword_OnInvalidTokenError_ShowsInvalidTokenMessage()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"INVALID_RESET_TOKEN","message":"This reset link is invalid or has expired."}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        RegisterAuthServices(this);
        Services.GetRequiredService<NavigationManager>().NavigateTo("reset-password?token=expired-token");

        var cut = Render<ResetPassword>();
        cut.Find("#newPassword").Change("new password");
        cut.Find("#confirmPassword").Change("new password");
        cut.Find("form").Submit();

        Assert.Contains("Dieser Link ist ungültig oder abgelaufen.", cut.Markup);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests/frontend && dotnet test --filter ResetPasswordPageTests`
Expected: FAIL to compile — `ResetPassword` type doesn't exist yet.

- [ ] **Step 3: Write `ResetPassword.razor`**

```razor
@page "/reset-password"
@using LuminaChronica.Client.Components
@using LuminaChronica.Client.Models
@using LuminaChronica.Client.Services
@inject ApiClient ApiClient
@inject LuminaAuthStateProvider AuthStateProvider
@inject NavigationManager NavigationManager
@inject ToastService ToastService
@inject II18nService I18n

<PageTitle>@I18n.T("resetPassword.title") — Lumina Chronica</PageTitle>

<h1>@I18n.T("resetPassword.title")</h1>

@if (_invalidToken)
{
    <p class="form-error">@I18n.T("resetPassword.invalidToken")</p>
    <p class="text-muted"><a href="forgot-password">@I18n.T("resetPassword.backToForgotPassword")</a></p>
}
else
{
    <EditForm Model="_form" OnValidSubmit="SubmitAsync" class="auth-form">
        <DataAnnotationsValidator />

        @if (_errorMessage is not null)
        {
            <p class="form-error">@_errorMessage</p>
        }

        <div class="form-group">
            <label for="newPassword">@I18n.T("resetPassword.newPasswordLabel")</label>
            <InputText id="newPassword" type="password" @bind-Value="_form.NewPassword" />
        </div>

        <div class="form-group">
            <label for="confirmPassword">@I18n.T("resetPassword.confirmPasswordLabel")</label>
            <InputText id="confirmPassword" type="password" @bind-Value="_form.ConfirmPassword" />
        </div>

        @if (_isSubmitting)
        {
            <LoadingIndicator Text="@I18n.T("resetPassword.submitting")" />
        }
        else
        {
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">@I18n.T("resetPassword.submitButton")</button>
            </div>
        }
    </EditForm>
}

@code {
    private readonly ResetPasswordFormModel _form = new();
    private string? _token;
    private bool _isSubmitting;
    private bool _invalidToken;
    private string? _errorMessage;

    // Same manual query-string parse as OAuthCallback.razor -- no
    // dependency needed for a single "?token=" param.
    protected override void OnInitialized()
    {
        var query = new Uri(NavigationManager.Uri).Query.TrimStart('?');
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 2 && parts[0] == "token") _token = Uri.UnescapeDataString(parts[1]);
        }

        if (_token is null) _invalidToken = true;
    }

    private async Task SubmitAsync()
    {
        _errorMessage = null;

        if (_form.NewPassword != _form.ConfirmPassword)
        {
            _errorMessage = I18n.T("resetPassword.passwordMismatch");
            return;
        }

        _isSubmitting = true;

        var request = new ResetPasswordRequest { Token = _token!, NewPassword = _form.NewPassword };
        var response = await ApiClient.PostAsync<ResetPasswordRequest, AuthResult>("/api/auth/reset-password", request);

        if (response is { Success: true, Data: not null })
        {
            await AuthStateProvider.MarkUserAsAuthenticatedAsync(response.Data.Token);
            ToastService.Show(I18n.T("resetPassword.successToast"), ToastKind.Success);
            await Task.Yield();
            NavigationManager.NavigateTo("");
            return;
        }

        if (response?.Error?.Code == "INVALID_RESET_TOKEN")
        {
            _invalidToken = true;
            _isSubmitting = false;
            return;
        }

        _errorMessage = response?.Error?.Message ?? I18n.T("resetPassword.defaultError");
        _isSubmitting = false;
    }

    private class ResetPasswordFormModel
    {
        public string NewPassword { get; set; } = string.Empty;
        public string ConfirmPassword { get; set; } = string.Empty;
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd tests/frontend && dotnet test --filter ResetPasswordPageTests`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd tests/frontend && dotnet test --nologo`
Expected: PASS, no regressions (427 + 5 new = 432).

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/ResetPassword.razor tests/frontend/ResetPasswordPageTests.cs
git commit -m "feat: ResetPassword page"
```

---

### Task 6: Settings page button

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Settings.razor`
- Test: `tests/frontend/SettingsPageTests.cs` (extend)

**Interfaces:**
- Consumes: `UserProfile` (pre-existing, `Email` field), `GET /api/users/me` (pre-existing route), `ForgotPasswordRequest` (Task 3), `ApiClient.PostAsync<TRequest>` bool overload (pre-existing), `ToastService` (pre-existing).

- [ ] **Step 1: Write the failing test**

Append to `tests/frontend/SettingsPageTests.cs`, inside the `SettingsPageTests` class:

```csharp
    private const string ProfileJson = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01T00:00:00Z"}}""";

    [Fact]
    public void Settings_PasswordResetButton_SendsRequestWithOwnEmail()
    {
        HttpRequestMessage? postRequest = null;
        string? postBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                postRequest = r;
                postBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true}""");
            })
            .WhenPathEndsWith("/preferences", AllEnabledPreferencesJson)
            .WhenPathEndsWith("/users/me", ProfileJson);
        UseHandler(handler);

        var cut = Render<Settings>();
        cut.Find("button.password-reset-button").Click();

        Assert.NotNull(postRequest);
        Assert.EndsWith("/forgot-password", postRequest!.RequestUri!.AbsolutePath);
        Assert.Contains("\"alice@example.com\"", postBody);
    }
```

Check `RoutedFakeHttpMessageHandler`'s exact `WhenPathEndsWith`/`When`/`JsonResponse` signatures against its own source (used extensively elsewhere in this file already) before running — this test's shape mirrors `Settings_TogglingCheckbox_SendsPutWithTypeAndEnabled` in the same file, adjust only if a helper name differs.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests/frontend && dotnet test --filter Settings_PasswordResetButton_SendsRequestWithOwnEmail`
Expected: FAIL — no element matches `button.password-reset-button`, and/or `/users/me` isn't fetched yet.

- [ ] **Step 3: Fetch the user's own email and add the button**

In `frontend/LuminaChronica.Client/Pages/Settings.razor`, add `ToastService` to the injected services:

```razor
@inject IThemeService ThemeService
@inject ApiClient ApiClient
@inject IJSRuntime JsRuntime
@inject II18nService I18n
@inject NavigationManager NavigationManager
@inject ToastService ToastService
```

Add a new settings-card, right after the "Sprache" card and before the "Bibliothek" card:

```razor
<div class="settings-card">
    <h2>@I18n.T("settings.passwordResetTitle")</h2>
    <button class="btn password-reset-button" disabled="@(_userEmail is null)" @onclick="SendPasswordResetAsync">
        @I18n.T("settings.passwordResetButton")
    </button>
</div>
```

In the `@code` block, add a field:

```csharp
    private string? _userEmail;
```

Change `OnInitializedAsync` from:

```csharp
    protected override async Task OnInitializedAsync()
    {
        _currentTheme = await ThemeService.GetThemeAsync();
        var response = await ApiClient.GetAsync<NotificationPreferences>("/api/notifications/preferences");
        _preferences = response is { Success: true, Data: not null } ? response.Data : new NotificationPreferences();

        _shelfCoverTextModule = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelfCoverText.js");
        _showShelfCoverText = await _shelfCoverTextModule.InvokeAsync<bool>("getShowCoverText");
    }
```

to:

```csharp
    protected override async Task OnInitializedAsync()
    {
        _currentTheme = await ThemeService.GetThemeAsync();
        var response = await ApiClient.GetAsync<NotificationPreferences>("/api/notifications/preferences");
        _preferences = response is { Success: true, Data: not null } ? response.Data : new NotificationPreferences();

        var profile = await ApiClient.GetAsync<UserProfile>("/api/users/me");
        _userEmail = profile is { Success: true, Data: not null } ? profile.Data.Email : null;

        _shelfCoverTextModule = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelfCoverText.js");
        _showShelfCoverText = await _shelfCoverTextModule.InvokeAsync<bool>("getShowCoverText");
    }
```

Add a new method, near `SetLanguageAsync`:

```csharp
    // Reuses the same generic-response endpoint as the Login-page flow --
    // the only difference is Settings already knows who's asking, so there's
    // no identifier to type in.
    private async Task SendPasswordResetAsync()
    {
        if (_userEmail is null) return;
        var ok = await ApiClient.PostAsync("/api/auth/forgot-password", new ForgotPasswordRequest { Identifier = _userEmail });
        ToastService.Show(
            ok ? I18n.T("settings.passwordResetToast") : I18n.T("settings.passwordResetError"),
            ok ? ToastKind.Success : ToastKind.Error);
    }
```

- [ ] **Step 4: Update the other Settings tests for the new `/users/me` fetch**

`RoutedFakeHttpMessageHandler.SendAsync` throws `InvalidOperationException` for any request that matches none of its configured routes (confirmed from its source: `if (route.Respond is null) throw new InvalidOperationException(...)`). Every existing test in `tests/frontend/SettingsPageTests.cs` that builds a handler via `UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", ...))` will now also hit `OnInitializedAsync`'s new `GetAsync<UserProfile>("/api/users/me")` call and throw, since no route matches it yet. Add `.WhenPathEndsWith("/users/me", ProfileJson)` to every one of this file's `UseHandler(new RoutedFakeHttpMessageHandler()...)` call sites, e.g. change:

```csharp
UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));
```

to:

```csharp
UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson).WhenPathEndsWith("/users/me", ProfileJson));
```

Apply this to all seven pre-existing call sites in the file (six `[Fact]` methods use `UseHandler(...)` directly with this shape, one — `Settings_LanguagePicker_HighlightsTheCurrentLanguage` — too).

- [ ] **Step 5: Run the full Settings test file**

Run: `cd tests/frontend && dotnet test --filter SettingsPageTests`
Expected: PASS, all 8 tests (7 existing + 1 new).

- [ ] **Step 6: Run the full frontend suite**

Run: `cd tests/frontend && dotnet test --nologo`
Expected: PASS, no regressions (432 + 1 new = 433).

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Settings.razor tests/frontend/SettingsPageTests.cs
git commit -m "feat: password-reset button on Settings page"
```

---

## Post-implementation (not part of this plan's automated work)

- `wrangler secret put RESEND_API_KEY` against the real Worker, once `luminachronica.com` is verified in Resend's dashboard.
- `wrangler d1 migrations apply --remote` for `0025_password_reset.sql` — the backend deploy process is 2 separate steps (code deploy + D1 migration), per this project's established convention; don't assume the migration ran just because the deploy workflow succeeded.
- Manual end-to-end verification in a real browser once the above are done: request a reset, click the emailed link, set a new password, confirm login works with it and not the old password.
- Once `FRONTEND_URL` is switched over to `https://luminachronica.com` (after DNS is verified — see the design spec's "Prerequisite infrastructure" section), reset links will point there instead of the github.io URL; no code change needed for that switch, it's a `wrangler.toml`/secret value change only.

## Self-Review

- **Spec coverage:** data model (Task 1), `emailService.ts`/Resend (Task 1), `requestPasswordReset` + enumeration-safety + OAuth-only path (Task 1), rate limiting (Task 1), `resetPassword`/consumption (Task 2), frontend models + i18n (Task 3), Login link + ForgotPassword page (Task 4), ResetPassword page (Task 5), Settings button (Task 6). Every section of `2026-09-26-forgot-password-design.md` maps to a task.
- **Placeholder scan:** no TBDs. The few "check X against the actual file" notes (Task 4 Step 1's `FakeHttpMessageHandler.StatusCode`, Task 5 Step 1's `TokenStore` property name, Task 6 Step 1/4's `RoutedFakeHttpMessageHandler` helper signatures) are deliberate — they name the exact existing file to check and the exact fallback behavior, not an unresolved design question.
- **Type consistency:** `ForgotPasswordRequest`/`ResetPasswordRequest` (Task 3) are used with matching property names in Tasks 4-6; `requestPasswordReset`/`resetPassword`/`InvalidResetTokenError` (Tasks 1-2) match their route-layer usage; `FORGOT_PASSWORD_MAX_ATTEMPTS` (Task 1) matches its test import (Task 1's own test file).
