import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { readJson } from "./testUtils";

type TestEnv = {
    DB: D1Database;
    JWT_SECRET: string;
    FRONTEND_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
};

let env: TestEnv;

beforeEach(() => {
    env = {
        DB: createFakeD1(),
        JWT_SECRET: "test-secret-do-not-use-in-production",
        FRONTEND_URL: "https://example.test",
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
    };
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function jsonRequest(body: unknown) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function base64url(obj: unknown): string {
    const json = JSON.stringify(obj);
    return Buffer.from(json).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeGoogleIdToken(payload: { sub: string; email: string; email_verified: boolean; name?: string; picture?: string }): string {
    return `${base64url({ alg: "none" })}.${base64url(payload)}.sig`;
}

// Stubs global fetch with a queue matched in order by URL substring -- both
// providers call fetch sequentially (token exchange, then profile lookups),
// so a simple ordered queue is enough without needing real URL parsing.
function stubFetchQueue(responses: { match: string; status?: number; json: unknown }[]) {
    const queue = [...responses];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL) => {
            const url = String(input);
            const next = queue.shift();
            if (!next) throw new Error(`Unexpected fetch call with no queued response: ${url}`);
            if (!url.includes(next.match)) throw new Error(`Expected fetch to ${next.match}, got ${url}`);
            return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
        })
    );
}

function extractQueryParam(location: string, key: string): string | null {
    return new URL(location).searchParams.get(key);
}

describe("GET /api/auth/oauth/:provider/start", () => {
    it("rejects an unknown provider", async () => {
        const res = await app.request("/api/auth/oauth/facebook/start", {}, env);
        expect(res.status).toBe(400);
    });

    it("redirects to Google's authorize endpoint with a state, and persists that state", async () => {
        const res = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);

        const location = res.headers.get("location")!;
        expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
        expect(extractQueryParam(location, "client_id")).toBe("google-client-id");
        expect(extractQueryParam(location, "redirect_uri")).toContain("/api/auth/oauth/google/callback");

        const state = extractQueryParam(location, "state");
        expect(state).toBeTruthy();
        const stored = await env.DB.prepare("SELECT provider FROM oauth_states WHERE state = ?").bind(state).first();
        expect(stored).not.toBeNull();
    });

    it("redirects to GitHub's authorize endpoint for the github provider", async () => {
        const res = await app.request("/api/auth/oauth/github/start", { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toContain("https://github.com/login/oauth/authorize");
    });
});

describe("GET /api/auth/oauth/:provider/callback", () => {
    async function getGoogleState(): Promise<string> {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        return extractQueryParam(startRes.headers.get("location")!, "state")!;
    }

    it("rejects an unknown/expired state without touching the database", async () => {
        const res = await app.request(
            "/api/auth/oauth/google/callback?code=abc&state=not-a-real-state",
            { redirect: "manual" } as RequestInit,
            env
        );
        expect(res.status).toBe(302);
        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/oauth-callback");
        expect(extractQueryParam(location, "error")).toBe("invalid_state");
    });

    it("creates a new user on first Google sign-in and redirects with an exchange code", async () => {
        const state = await getGoogleState();
        stubFetchQueue([
            {
                match: "oauth2.googleapis.com/token",
                json: { id_token: fakeGoogleIdToken({ sub: "google-1", email: "newuser@example.com", email_verified: true, name: "New User" }) },
            },
        ]);

        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/oauth-callback");
        const code = extractQueryParam(location, "code");
        expect(code).toBeTruthy();

        const user = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind("newuser@example.com").first<{
            id: number;
            email: string;
            password_hash: string | null;
        }>();
        expect(user).not.toBeNull();
        expect(user!.password_hash).toBeNull();

        const identity = await env.DB.prepare("SELECT * FROM oauth_identities WHERE provider_user_id = ?").bind("google-1").first();
        expect(identity).not.toBeNull();

        const settings = await env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(user!.id).first();
        expect(settings).not.toBeNull();

        // The state row must be consumed, not reusable.
        const staleState = await env.DB.prepare("SELECT * FROM oauth_states WHERE state = ?").bind(state).first();
        expect(staleState).toBeNull();
    });

    it("reuses the same user on a second sign-in with the same Google identity", async () => {
        const profile = { sub: "google-2", email: "repeat@example.com", email_verified: true };

        const state1 = await getGoogleState();
        stubFetchQueue([{ match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken(profile) } }]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state1}`, { redirect: "manual" } as RequestInit, env);

        const firstUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(profile.email).first<{ id: number }>();

        const state2 = await getGoogleState();
        stubFetchQueue([{ match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken(profile) } }]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state2}`, { redirect: "manual" } as RequestInit, env);

        const usersWithEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(profile.email).all<{ id: number }>();
        expect(usersWithEmail.results).toHaveLength(1);

        const identities = await env.DB.prepare("SELECT * FROM oauth_identities WHERE provider_user_id = ?").bind("google-2").all();
        expect(identities.results).toHaveLength(1);

        expect(firstUser).not.toBeNull();
    });

    it("auto-links to an existing password account with the same verified email", async () => {
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "existinguser", email: "shared@example.com", password: "correct horse" }),
            env
        );
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("shared@example.com").first<{ id: number }>();

        const state = await getGoogleState();
        stubFetchQueue([
            {
                match: "oauth2.googleapis.com/token",
                json: { id_token: fakeGoogleIdToken({ sub: "google-3", email: "shared@example.com", email_verified: true }) },
            },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);

        const usersWithEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind("shared@example.com").all<{ id: number }>();
        expect(usersWithEmail.results).toHaveLength(1);

        const identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-3").first<{
            user_id: number;
        }>();
        expect(identity!.user_id).toBe(existing!.id);
    });

    it("creates a user via GitHub, falling back to the emails endpoint when /user.email is null", async () => {
        const startRes = await app.request("/api/auth/oauth/github/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;

        stubFetchQueue([
            { match: "github.com/login/oauth/access_token", json: { access_token: "gh-access-token" } },
            { match: "api.github.com/user", json: { id: 999, login: "ghuser", name: "GH User", avatar_url: "https://x/y.png", email: null } },
            {
                match: "api.github.com/user/emails",
                json: [
                    { email: "unverified@example.com", primary: false, verified: false },
                    { email: "verified@example.com", primary: true, verified: true },
                ],
            },
        ]);

        const res = await app.request(`/api/auth/oauth/github/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        expect(extractQueryParam(res.headers.get("location")!, "code")).toBeTruthy();

        const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind("verified@example.com").first();
        expect(user).not.toBeNull();
    });

    it("redirects with an error if the provider exchange fails", async () => {
        const state = await getGoogleState();
        stubFetchQueue([{ match: "oauth2.googleapis.com/token", status: 400, json: { error: "invalid_grant" } }]);

        const res = await app.request(`/api/auth/oauth/google/callback?code=bad&state=${state}`, { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        expect(extractQueryParam(res.headers.get("location")!, "error")).toBe("exchange_failed");
    });
});

describe("POST /api/auth/oauth/exchange", () => {
    async function signInViaGoogle(email: string, sub: string): Promise<string> {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([{ match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub, email, email_verified: true }) } }]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        return extractQueryParam(callbackRes.headers.get("location")!, "code")!;
    }

    it("returns a real token for a valid exchange code, and rejects reuse", async () => {
        const code = await signInViaGoogle("exchange@example.com", "google-exchange-1");

        const res = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(typeof json.data.token).toBe("string");
        expect(typeof json.data.userId).toBe("number");

        const replay = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        expect(replay.status).toBe(401);
    });

    it("rejects an unknown code", async () => {
        const res = await app.request("/api/auth/oauth/exchange", jsonRequest({ code: "not-a-real-code" }), env);
        expect(res.status).toBe(401);
    });

    it("rejects a missing code with 400", async () => {
        const res = await app.request("/api/auth/oauth/exchange", jsonRequest({}), env);
        expect(res.status).toBe(400);
    });
});

describe("password login against an OAuth-only account", () => {
    it("fails cleanly with 401, not a crash, since password_hash is null", async () => {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            {
                match: "oauth2.googleapis.com/token",
                json: { id_token: fakeGoogleIdToken({ sub: "google-nullpw", email: "nullpw@example.com", email_verified: true }) },
            },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);

        const res = await app.request(
            "/api/auth/login",
            jsonRequest({ identifier: "nullpw@example.com", password: "anything" }),
            env
        );
        expect(res.status).toBe(401);
    });
});
