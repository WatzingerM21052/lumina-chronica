import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

// Review N-7: tokens carry the user's token_version ("tv"); requireAuth
// rejects tokens of an older session generation or of a deleted account.
let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string; RESEND_API_KEY: string; FRONTEND_URL: string; PASSWORD_CODE_SECRET: string };
let fetchMock: ReturnType<typeof vi.fn>;

function jsonRequest(method: string, body: unknown, token?: string): RequestInit {
    return {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    };
}

async function register(username: string, email: string): Promise<{ token: string; userId: number }> {
    const res = await app.request("/api/auth/register", jsonRequest("POST", { username, email, password: "correct horse" }), env);
    return (await readJson(res)).data;
}

async function login(identifier: string): Promise<string> {
    const res = await app.request("/api/auth/login", jsonRequest("POST", { identifier, password: "correct horse" }), env);
    return (await readJson(res)).data.token;
}

function logoutAll(token: string) {
    return app.request("/api/auth/logout-all", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
}

async function meStatus(token: string): Promise<number> {
    return (await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env)).status;
}

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// A token shaped like the ones issued before migration 0027: no tv claim.
async function legacyToken(userId: number): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const header = base64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const payload = base64Url(encoder.encode(JSON.stringify({ sub: userId, role: "USER", iat: now, exp: now + 3600 })));
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`)));
    return `${header}.${payload}.${base64Url(signature)}`;
}

beforeEach(() => {
    env = {
        DB: createFakeD1(),
        STORAGE: createFakeR2(),
        JWT_SECRET: "test-secret-do-not-use-in-production",
        RESEND_API_KEY: "test-resend-key",
        FRONTEND_URL: "https://example.test",
        PASSWORD_CODE_SECRET: "test-code-secret-do-not-use-in-production",
    };
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/auth/logout-all", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/auth/logout-all", { method: "POST" }, env);
        expect(res.status).toBe(401);
    });

    it("signs out every other device and keeps the calling one signed in with a fresh token", async () => {
        const { token: laptop } = await register("alice", "alice@example.com");
        const phone = await login("alice@example.com");

        const res = await logoutAll(laptop);
        const { data } = await readJson(res);

        expect(res.status).toBe(200);
        expect(await meStatus(laptop)).toBe(401);
        expect(await meStatus(phone)).toBe(401);
        expect(await meStatus(data.token)).toBe(200);
        // A login afterwards is signed with the new generation too.
        expect(await meStatus(await login("alice"))).toBe(200);
    });

    it("only affects the caller's own account", async () => {
        const { token: alice } = await register("alice", "alice@example.com");
        const { token: bob } = await register("bob", "bob@example.com");

        await logoutAll(alice);

        expect(await meStatus(bob)).toBe(200);
    });
});

describe("token_version in requireAuth", () => {
    it("accepts a token without a tv claim while the account is at version 0, so the migration logs nobody out", async () => {
        const { userId } = await register("alice", "alice@example.com");
        const token = await legacyToken(userId);

        expect(await meStatus(token)).toBe(200);

        await env.DB.prepare("UPDATE users SET token_version = 1 WHERE id = ?").bind(userId).run();
        expect(await meStatus(token)).toBe(401);
    });

    it("a password reset signs out older sessions; the token it returns works", async () => {
        const { token: old } = await register("alice", "alice@example.com");
        await app.request("/api/auth/forgot-password", jsonRequest("POST", { identifier: "alice@example.com" }), env);
        const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
        const [, rawToken] = (JSON.parse(init.body as string).html as string).match(/token=([\w-]+)/) ?? [];

        const res = await app.request("/api/auth/reset-password", jsonRequest("POST", { token: rawToken, newPassword: "a whole new horse" }), env);
        const { data } = await readJson(res);

        expect(res.status).toBe(200);
        expect(await meStatus(old)).toBe(401);
        expect(await meStatus(data.token)).toBe(200);
    });

    it("a token from before an account deletion stays invalid after the account is restored", async () => {
        const { token: old } = await register("alice", "alice@example.com");
        await app.request("/api/users/me", jsonRequest("DELETE", { currentPassword: "correct horse" }, old), env);

        const restore = await app.request("/api/auth/restore", jsonRequest("POST", { username: "alice", email: "alice@example.com", password: "another horse" }), env);
        const { data } = await readJson(restore);

        expect(restore.ok).toBe(true);
        expect(await meStatus(old)).toBe(401);
        expect(await meStatus(data.token)).toBe(200);
    });

    it("treats a revoked token as anonymous on optional-auth routes instead of failing", async () => {
        const { token } = await register("alice", "alice@example.com");
        await logoutAll(token);

        const res = await app.request("/api/discover/books", { headers: { Authorization: `Bearer ${token}` } }, env);

        expect(res.status).toBe(200);
    });
});
