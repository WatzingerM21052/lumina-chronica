import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { OAUTH_NO_PASSWORD_SENTINEL, hmacSha256Hex, sha256Hex } from "../../backend/src/utils/crypto";
import { FORGOT_PASSWORD_MAX_ATTEMPTS, RESET_EMAILS_PER_ACCOUNT_MAX } from "../../backend/src/services/rateLimitService";
import { MAX_CODE_ATTEMPTS } from "../../backend/src/services/passwordResetService";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

type TestEnv = { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string; RESEND_API_KEY: string; FRONTEND_URL: string; PASSWORD_CODE_SECRET: string };

let env: TestEnv;

beforeEach(() => {
    env = {
        DB: createFakeD1(),
        STORAGE: createFakeR2(),
        JWT_SECRET: "test-secret-do-not-use-in-production",
        RESEND_API_KEY: "test-resend-key",
        FRONTEND_URL: "https://example.test/some-app",
        PASSWORD_CODE_SECRET: "test-code-secret-do-not-use-in-production",
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

        // Extract the raw token from the mocked email body and confirm the
        // DB stores only its hash -- not the token itself, not the URL. A
        // weaker `not.toContain("http")` check can't distinguish "hash
        // stored" from "raw token stored" (sha256Hex output is also
        // "http"-free), so this recomputes the real hash and compares.
        const html = JSON.parse(init.body).html as string;
        const [, rawToken] = html.match(/reset-password\?token=([\w-]+)/) ?? [];
        expect(rawToken).toBeTruthy();
        expect(html).toContain(`${env.FRONTEND_URL}/reset-password?token=${rawToken}`);
        expect(row.token_hash).toBe(await sha256Hex(rawToken));
        expect(row.consumed_at).toBeNull();
    });

    it("stores the code only as an HMAC hash, never the raw code", async () => {
        await app.request("/api/auth/register", jsonRequest({ username: "dana", email: "dana@example.com", password: "correct horse" }), env);
        const code = await requestResetAndGetCode("dana@example.com");

        const row = await env.DB
            .prepare("SELECT code_hash FROM password_reset_tokens WHERE user_id = (SELECT id FROM users WHERE email = ?)")
            .bind("dana@example.com")
            .first<{ code_hash: string }>();
        expect(row?.code_hash).toBe(await hmacSha256Hex(env.PASSWORD_CODE_SECRET, code));
    });

    it("a new request invalidates a previously issued token and code (D6)", async () => {
        await app.request("/api/auth/register", jsonRequest({ username: "erin", email: "erin@example.com", password: "correct horse" }), env);
        const firstToken = await requestResetAndGetRawToken("erin@example.com");
        await env.DB.prepare("DELETE FROM auth_rate_limits WHERE route = 'forgot-password-resend'").run();

        await requestResetAndGetRawToken("erin@example.com"); // second request

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: firstToken, newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
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
        // Isolates the 5-per-15-min throttle being tested here from D2's
        // separate 60s resend cooldown (rateLimitService.ts) -- without
        // this, the 2nd loop iteration would already 429 on the cooldown,
        // not the mechanism this test exists to check. Deleting the
        // cooldown's own row between iterations simulates "60s have
        // passed" without touching global time (which real JWT iat/exp
        // checks elsewhere also depend on -- fake timers would risk
        // side-effecting those instead of just this one throttle).
        for (let i = 0; i < FORGOT_PASSWORD_MAX_ATTEMPTS; i++) {
            const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
            expect(res.status).toBe(200);
            await env.DB.prepare("DELETE FROM auth_rate_limits WHERE route = 'forgot-password-resend'").run();
        }

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(429);
        expect(json.error.code).toBe("RATE_LIMITED");
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });

    it("returns 429 on a resend within 60s of the previous request, before any 5-per-15-min throttling kicks in", async () => {
        const first = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        expect(first.status).toBe(200);

        const second = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        const json = await readJson(second);
        expect(second.status).toBe(429);
        expect(json.error.code).toBe("RATE_LIMITED");
        expect(second.headers.get("Retry-After")).not.toBeNull();
    });

    it("resend cooldown fires identically for an existing, a non-existing, and an OAuth-only identifier (D2's enumeration-safety fix)", async () => {
        const register = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "carol", email: "carol@example.com", password: "correct horse" }),
            env
        );
        const { data: registered } = await readJson(register);
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(OAUTH_NO_PASSWORD_SENTINEL, registered.userId).run();

        for (const identifier of ["alice@example.com", "nobody-at-all@example.com", "carol@example.com"]) {
            const first = await app.request("/api/auth/forgot-password", jsonRequest({ identifier }), env);
            expect(first.status).toBe(200);

            const second = await app.request("/api/auth/forgot-password", jsonRequest({ identifier }), env);
            expect(second.status).toBe(429);
            expect((await readJson(second)).error.code).toBe("RATE_LIMITED");
        }
    });

    it("the resend cooldown does not block a different identifier", async () => {
        const first = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        expect(first.status).toBe(200);

        const other = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "someone-else@example.com" }), env);
        expect(other.status).toBe(200);
    });

    it("the resend cooldown can't be skipped by changing the email's case (review N-6)", async () => {
        const first = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        expect(first.status).toBe(200);

        const variant = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: " ALICE@Example.com" }), env);
        expect(variant.status).toBe(429);
        expect(Number(variant.headers.get("Retry-After"))).toBeGreaterThan(0);
    });

    it("a request that fails before issuing a new code leaves the previously issued link intact", async () => {
        // Regression (review K-2): the invalidate-old-rows UPDATE used to run
        // BEFORE the HMAC, so a missing PASSWORD_CODE_SECRET threw only after
        // every live link had already been burned -- the generic 200 hid it,
        // and nobody could reset at all, not even via an older email.
        await app.request("/api/auth/register", jsonRequest({ username: "fay", email: "fay@example.com", password: "correct horse" }), env);
        const firstToken = await requestResetAndGetRawToken("fay@example.com");
        await env.DB.prepare("DELETE FROM auth_rate_limits WHERE route = 'forgot-password-resend'").run();

        const brokenEnv = { ...env, PASSWORD_CODE_SECRET: "" };
        const failed = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "fay@example.com" }), brokenEnv);
        expect(failed.status).toBe(200);

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: firstToken, newPassword: "new password" }), env);
        expect(res.status).toBe(200);
    });

    describe("per-account cap on reset emails (review H-1)", () => {
        // Each request comes from a fresh IP and alternates email/username,
        // i.e. exactly the rotation that walks past every identifier- or
        // (ip, identifier)-keyed throttle. The 60s cooldown row is deleted
        // between requests to simulate "a minute has passed" (same technique
        // as the 5-per-15-min test above).
        async function requestFromFreshIp(identifier: string, i: number) {
            const res = await app.request(
                "/api/auth/forgot-password",
                { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": `203.0.113.${i}` }, body: JSON.stringify({ identifier }) },
                env
            );
            await env.DB.prepare("DELETE FROM auth_rate_limits WHERE route = 'forgot-password-resend'").run();
            return res;
        }

        async function exhaustBudget(email: string, username: string) {
            for (let i = 0; i < RESET_EMAILS_PER_ACCOUNT_MAX; i++) {
                const res = await requestFromFreshIp(i % 2 === 0 ? email : username, i);
                expect(res.status).toBe(200);
            }
            expect(globalThis.fetch).toHaveBeenCalledTimes(RESET_EMAILS_PER_ACCOUNT_MAX);
        }

        it("stops issuing codes past the cap, however the IP and identifier are rotated", async () => {
            const register = await app.request("/api/auth/register", jsonRequest({ username: "gil", email: "gil@example.com", password: "correct horse" }), env);
            const { data: registered } = await readJson(register);
            await exhaustBudget("gil@example.com", "gil");

            const over = await requestFromFreshIp("gil", 99);
            expect(over.status).toBe(200);
            expect(globalThis.fetch).toHaveBeenCalledTimes(RESET_EMAILS_PER_ACCOUNT_MAX);

            const { count } = (await env.DB.prepare("SELECT COUNT(*) AS count FROM password_reset_tokens WHERE user_id = ?").bind(registered.userId).first<{ count: number }>())!;
            expect(count).toBe(RESET_EMAILS_PER_ACCOUNT_MAX);
        });

        it("answers an over-cap request byte-identically to an unknown identifier", async () => {
            await app.request("/api/auth/register", jsonRequest({ username: "hana", email: "hana@example.com", password: "correct horse" }), env);
            await exhaustBudget("hana@example.com", "hana");

            const over = await requestFromFreshIp("hana@example.com", 99);
            const unknown = await requestFromFreshIp("nobody-here@example.com", 100);
            expect(over.status).toBe(unknown.status);
            expect(await over.text()).toBe(await unknown.text());
        });

        it("an over-cap request does not invalidate the last link the owner received", async () => {
            await app.request("/api/auth/register", jsonRequest({ username: "ivo", email: "ivo@example.com", password: "correct horse" }), env);
            await exhaustBudget("ivo@example.com", "ivo");
            const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
            const [, lastToken] = (JSON.parse(init.body).html as string).match(/token=([\w-]+)/) ?? [];

            await requestFromFreshIp("ivo@example.com", 99);

            const res = await app.request("/api/auth/reset-password", jsonRequest({ token: lastToken, newPassword: "new password" }), env);
            expect(res.status).toBe(200);
        });

        it("also caps the OAuth-only informational email", async () => {
            const register = await app.request("/api/auth/register", jsonRequest({ username: "jon", email: "jon@example.com", password: "correct horse" }), env);
            const { data: registered } = await readJson(register);
            await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(OAUTH_NO_PASSWORD_SENTINEL, registered.userId).run();
            await exhaustBudget("jon@example.com", "jon");

            await requestFromFreshIp("jon@example.com", 99);
            expect(globalThis.fetch).toHaveBeenCalledTimes(RESET_EMAILS_PER_ACCOUNT_MAX);
        });

        it("is per account: another account is unaffected", async () => {
            await app.request("/api/auth/register", jsonRequest({ username: "kim", email: "kim@example.com", password: "correct horse" }), env);
            await app.request("/api/auth/register", jsonRequest({ username: "lea", email: "lea@example.com", password: "correct horse" }), env);
            await exhaustBudget("kim@example.com", "kim");

            await requestFromFreshIp("lea@example.com", 99);
            expect(globalThis.fetch).toHaveBeenCalledTimes(RESET_EMAILS_PER_ACCOUNT_MAX + 1);
        });

        it("issues codes again once the window has expired", async () => {
            await app.request("/api/auth/register", jsonRequest({ username: "max", email: "max@example.com", password: "correct horse" }), env);
            await exhaustBudget("max@example.com", "max");
            await env.DB.prepare("UPDATE auth_rate_limits SET expires_at = ? WHERE route = 'forgot-password-account'").bind(new Date(Date.now() - 1000).toISOString()).run();

            await requestFromFreshIp("max@example.com", 99);
            expect(globalThis.fetch).toHaveBeenCalledTimes(RESET_EMAILS_PER_ACCOUNT_MAX + 1);
        });
    });

    it("does not fail the request if the email provider errors", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("server error", { status: 500 })));
        await app.request("/api/auth/register", jsonRequest({ username: "bob", email: "bob@example.com", password: "correct horse" }), env);

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "bob@example.com" }), env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).success).toBe(true);
    });

    it("answers before the reset email is sent when the Worker can finish work in the background (review M-5)", async () => {
        await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }), env);

        let releaseEmail!: () => void;
        const emailGate = new Promise<void>((resolve) => (releaseEmail = resolve));
        const fetchMock = vi.fn(async () => {
            await emailGate;
            return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
        });
        vi.stubGlobal("fetch", fetchMock);
        const background: Promise<unknown>[] = [];
        const executionCtx = { waitUntil: (p: Promise<unknown>) => background.push(p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env, executionCtx);

        // The response is already there while the Resend call is still pending.
        expect(res.status).toBe(200);
        expect(background).toHaveLength(1);
        releaseEmail();
        await Promise.all(background);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM password_reset_tokens").first<{ n: number }>();
        expect(row!.n).toBe(1);
    });

    it("an unknown identifier also goes through the background path, with an identical response", async () => {
        const background: Promise<unknown>[] = [];
        const executionCtx = { waitUntil: (p: Promise<unknown>) => background.push(p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

        const res = await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "nobody@example.com" }), env, executionCtx);

        expect(res.status).toBe(200);
        expect(background).toHaveLength(1);
        expect(await readJson(res)).toEqual({ success: true, data: { message: "If an account exists, a reset email has been sent." } });
    });
});

async function requestResetAndGetRawToken(identifier: string): Promise<string> {
    await app.request("/api/auth/forgot-password", jsonRequest({ identifier }), env);
    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const html = JSON.parse(init.body).html as string;
    const match = html.match(/token=([\w-]+)/);
    if (!match) throw new Error("no token found in the stubbed email body");
    return match[1];
}

// The code appears as its own line in the plain-text part
// (passwordResetCode.ts's text array) -- unlike the HTML part, it's not
// visually spaced out there, so a plain 6-digit line match is unambiguous.
async function requestResetAndGetCode(identifier: string): Promise<string> {
    await app.request("/api/auth/forgot-password", jsonRequest({ identifier }), env);
    const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
    const text = JSON.parse(init.body).text as string;
    const match = text.match(/^\d{6}$/m);
    if (!match) throw new Error("no code found in the stubbed email body");
    return match[0];
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

    it("rejects a reset for an account that was soft-deleted after the token was issued", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");

        const login = await app.request(
            "/api/auth/login",
            jsonRequest({ identifier: "alice@example.com", password: "old password" }),
            env
        );
        const { data: loginData } = await readJson(login);

        const deleteRes = await app.request(
            "/api/users/me",
            {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginData.token}` },
                body: JSON.stringify({ currentPassword: "old password" }),
            },
            env
        );
        expect(deleteRes.status).toBe(200);

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("sets a new password via code, consumes it, and logs the user in", async () => {
        const code = await requestResetAndGetCode("alice@example.com");

        const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "new password" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(typeof json.data.token).toBe("string");

        const login = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "new password" }), env);
        expect(login.status).toBe(200);
    });

    it("rejects re-using an already-consumed code", async () => {
        const code = await requestResetAndGetCode("alice@example.com");
        await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "new password" }), env);

        const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "another password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("rejects a wrong code", async () => {
        await requestResetAndGetCode("alice@example.com");
        const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code: "000000", newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("the link token and the code consume the SAME row -- using the link first invalidates the code too", async () => {
        await app.request("/api/auth/forgot-password", jsonRequest({ identifier: "alice@example.com" }), env);
        const [, init] = (globalThis.fetch as any).mock.calls.at(-1);
        const body = JSON.parse(init.body);
        const tokenMatch = (body.html as string).match(/token=([\w-]+)/);
        const codeMatch = (body.text as string).match(/^\d{6}$/m);
        if (!tokenMatch || !codeMatch) throw new Error("token or code not found in stubbed email");
        const [rawToken, code] = [tokenMatch[1], codeMatch[0]];

        const tokenReset = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);
        expect(tokenReset.status).toBe(200);

        const codeReset = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "another password" }), env);
        expect(codeReset.status).toBe(400);
        expect((await readJson(codeReset)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("locks the code after MAX_CODE_ATTEMPTS wrong guesses via verify-reset-code, even if the final guess is correct", async () => {
        const code = await requestResetAndGetCode("alice@example.com");

        for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
            const res = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com", code: "000000" }), env);
            expect((await readJson(res)).data.attemptsLeft).toBe(MAX_CODE_ATTEMPTS - i - 1);
        }

        const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("a correct code on the last allowed live check still works for the reset (a match never burns an attempt)", async () => {
        // Regression (review M-1): verify used to increment unconditionally,
        // so 9 typos + the right code showed "valid, 0 left" in the dialog
        // and the following submit then failed on the exhausted row.
        const code = await requestResetAndGetCode("alice@example.com");

        for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i++) {
            await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com", code: "000000" }), env);
        }

        const verify = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com", code }), env);
        expect((await readJson(verify)).data).toEqual({ valid: true, attemptsLeft: 1 });

        const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "new password" }), env);
        expect(res.status).toBe(200);
    });

    it("also locks the code when every wrong guess goes straight through reset-password, bypassing verify-reset-code entirely", async () => {
        // Regression test: consumeByCode used to filter by code_hash in its
        // WHERE clause, so a wrong guess matched no row and never touched
        // attempt_count -- an attacker could skip /verify-reset-code
        // completely and spray this endpoint at zero cost per guess. Clear
        // the OUTER (ip, identifier) throttle between iterations so this
        // test isolates the row-level code cap, not that unrelated backstop.
        const code = await requestResetAndGetCode("alice@example.com");

        for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
            const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code: "000000", newPassword: "new password" }), env);
            expect(res.status).toBe(400);
            expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
            await env.DB.prepare("DELETE FROM auth_rate_limits WHERE route = 'reset-password'").run();
        }

        const res = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_RESET_TOKEN");
    });

    it("rejects a body with both a token and an identifier+code (ambiguous)", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");
        const res = await app.request(
            "/api/auth/reset-password",
            jsonRequest({ token: rawToken, identifier: "alice@example.com", code: "123456", newPassword: "new password" }),
            env
        );
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a body with neither a token nor an identifier+code", async () => {
        const res = await app.request("/api/auth/reset-password", jsonRequest({ newPassword: "new password" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("sends the password-changed confirmation email only after the password write succeeds", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");
        const callsBeforeReset = (globalThis.fetch as any).mock.calls.length;

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);
        expect(res.status).toBe(200);

        const callsAfterReset = (globalThis.fetch as any).mock.calls as any[];
        expect(callsAfterReset.length).toBe(callsBeforeReset + 1);
        const [, confirmationInit] = callsAfterReset.at(-1);
        const confirmationBody = JSON.parse(confirmationInit.body);
        expect(confirmationBody.to).toBe("alice@example.com");
        expect(confirmationBody.subject).toContain("geändert");
    });

    it("still succeeds, and the login still works, even when the confirmation email send throws", async () => {
        const rawToken = await requestResetAndGetRawToken("alice@example.com");
        vi.stubGlobal("fetch", vi.fn(async () => new Response("server error", { status: 500 })));

        const res = await app.request("/api/auth/reset-password", jsonRequest({ token: rawToken, newPassword: "new password" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(typeof json.data.token).toBe("string");

        const login = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "new password" }), env);
        expect(login.status).toBe(200);
    });
});

describe("POST /api/auth/verify-reset-code", () => {
    beforeEach(async () => {
        await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "old password" }), env);
    });

    it("returns valid:true for the correct code, without consuming it (can still be used afterward)", async () => {
        const code = await requestResetAndGetCode("alice@example.com");

        const res = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com", code }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.valid).toBe(true);

        const resetRes = await app.request("/api/auth/reset-password", jsonRequest({ identifier: "alice@example.com", code, newPassword: "new password" }), env);
        expect(resetRes.status).toBe(200);
    });

    it("returns valid:false and decrements attemptsLeft for a wrong code", async () => {
        await requestResetAndGetCode("alice@example.com");

        const res = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com", code: "000000" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.valid).toBe(false);
        expect(json.data.attemptsLeft).toBe(MAX_CODE_ATTEMPTS - 1);
    });

    it("returns the byte-identical { valid: false, attemptsLeft: 0 } shape for a non-existent identifier", async () => {
        const res = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "nobody@example.com", code: "123456" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data).toEqual({ valid: false, attemptsLeft: 0 });
    });

    it("returns { valid: false, attemptsLeft: 0 } when no live code exists (never requested)", async () => {
        const res = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com", code: "123456" }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data).toEqual({ valid: false, attemptsLeft: 0 });
    });

    it("rejects a missing identifier or code with 400", async () => {
        const res = await app.request("/api/auth/verify-reset-code", jsonRequest({ identifier: "alice@example.com" }), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });
});
