import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { OAUTH_NO_PASSWORD_SENTINEL, sha256Hex } from "../../backend/src/utils/crypto";
import { FORGOT_PASSWORD_MAX_ATTEMPTS } from "../../backend/src/services/rateLimitService";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

type TestEnv = { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string; RESEND_API_KEY: string; FRONTEND_URL: string };

let env: TestEnv;

beforeEach(() => {
    env = {
        DB: createFakeD1(),
        STORAGE: createFakeR2(),
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
});
