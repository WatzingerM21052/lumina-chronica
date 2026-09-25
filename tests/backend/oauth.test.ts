import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { OAUTH_NO_PASSWORD_SENTINEL } from "../../backend/src/utils/crypto";
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
        // Deliberately has a path segment, mirroring the real deployment
        // (GitHub Pages *project* site, not a bare domain) -- a bare-domain
        // FRONTEND_URL in this env would never have caught the real bug
        // where new URL("/oauth-callback", FRONTEND_URL) silently dropped
        // that path segment (root-relative resolution). See routes/auth.ts's
        // comment on frontendCallback.
        FRONTEND_URL: "https://example.test/some-app",
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
        expect(location).toContain("https://example.test/some-app/oauth-callback");
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
        expect(location).toContain("https://example.test/some-app/oauth-callback");
        const code = extractQueryParam(location, "code");
        expect(code).toBeTruthy();

        const user = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind("newuser@example.com").first<{
            id: number;
            email: string;
            password_hash: string;
        }>();
        expect(user).not.toBeNull();
        expect(user!.password_hash).toBe(OAUTH_NO_PASSWORD_SENTINEL);

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

describe("GET /api/auth/oauth/:provider/link/start", () => {
    async function registerUser(): Promise<string> {
        const res = await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }), env);
        return (await readJson(res)).data.token;
    }

    it("requires authentication", async () => {
        const res = await app.request("/api/auth/oauth/google/link/start", {}, env);
        expect(res.status).toBe(401);
    });

    it("returns a redirect URL as JSON (not a 302) and stores linking_user_id on the state row", async () => {
        const token = await registerUser();
        const res = await app.request("/api/auth/oauth/google/link/start", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(200);

        const json = await readJson(res);
        expect(json.data.redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");

        const state = new URL(json.data.redirectUrl).searchParams.get("state");
        const stored = await env.DB.prepare("SELECT linking_user_id FROM oauth_states WHERE state = ?").bind(state).first<{ linking_user_id: number }>();
        expect(stored!.linking_user_id).not.toBeNull();
    });
});

describe("GET /api/auth/oauth/:provider/callback -- linking an identity onto an existing session", () => {
    async function registerUser(email = "alice@example.com"): Promise<{ token: string; userId: number }> {
        // username derived from the email's local part (not hardcoded "alice")
        // so this helper can register more than one distinct user per test --
        // several tests in this describe block need two separate accounts.
        const res = await app.request("/api/auth/register", jsonRequest({ username: email.split("@")[0], email, password: "correct horse" }), env);
        return (await readJson(res)).data;
    }

    async function startLink(token: string): Promise<string> {
        const res = await app.request("/api/auth/oauth/google/link/start", { headers: { Authorization: `Bearer ${token}` } }, env);
        const json = await readJson(res);
        return new URL(json.data.redirectUrl).searchParams.get("state")!;
    }

    it("links the identity to the caller and redirects to /profile?linked=google without issuing an exchange code", async () => {
        const { token, userId } = await registerUser();
        const state = await startLink(token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-1", email: "alice@gmail.com", email_verified: true }) } },
        ]);

        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/some-app/profile");
        expect(extractQueryParam(location, "linked")).toBe("google");
        expect(extractQueryParam(location, "code")).toBeNull();

        const identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-link-1").first<{ user_id: number }>();
        expect(identity!.user_id).toBe(userId);
    });

    it("redirects to /profile?linkError=already_linked when the identity belongs to a different user", async () => {
        // First user links google-link-2 to themselves.
        const owner = await registerUser("owner@example.com");
        const ownerState = await startLink(owner.token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-2", email: "owner@gmail.com", email_verified: true }) } },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${ownerState}`, { redirect: "manual" } as RequestInit, env);

        // A second, different user tries to link the SAME provider identity.
        const other = await registerUser("other@example.com");
        const otherState = await startLink(other.token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-2", email: "owner@gmail.com", email_verified: true }) } },
        ]);
        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${otherState}`, { redirect: "manual" } as RequestInit, env);

        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/some-app/profile");
        expect(extractQueryParam(location, "linkError")).toBe("already_linked");

        const identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-link-2").first<{ user_id: number }>();
        expect(identity!.user_id).toBe(owner.userId);
    });

    it("redirects a failed link attempt's provider exchange to /profile?linkError=exchange_failed, not /oauth-callback", async () => {
        const { token } = await registerUser();
        const state = await startLink(token);
        stubFetchQueue([{ match: "oauth2.googleapis.com/token", status: 400, json: { error: "invalid_grant" } }]);

        const res = await app.request(`/api/auth/oauth/google/callback?code=bad&state=${state}`, { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/some-app/profile");
        expect(extractQueryParam(location, "linkError")).toBe("exchange_failed");
        expect(extractQueryParam(location, "code")).toBeNull();
    });

    it("is idempotent when re-linking the same identity the caller already has", async () => {
        const { token, userId } = await registerUser();
        const firstState = await startLink(token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-3", email: "alice@gmail.com", email_verified: true }) } },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${firstState}`, { redirect: "manual" } as RequestInit, env);

        const secondState = await startLink(token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-3", email: "alice@gmail.com", email_verified: true }) } },
        ]);
        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${secondState}`, { redirect: "manual" } as RequestInit, env);
        expect(extractQueryParam(res.headers.get("location")!, "linked")).toBe("google");

        const identities = await env.DB.prepare("SELECT * FROM oauth_identities WHERE provider_user_id = ?").bind("google-link-3").all();
        expect(identities.results).toHaveLength(1);
        expect((identities.results[0] as { user_id: number }).user_id).toBe(userId);
    });
});

describe("account deletion closes the OAuth sign-in hole", () => {
    it("an OAuth-only account that gets soft-deleted can no longer sign in via its old (deleted) identity row, but IS restored by matching email (Task 10)", async () => {
        // 1. Create an OAuth-only account via Google sign-in.
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            {
                match: "oauth2.googleapis.com/token",
                json: { id_token: fakeGoogleIdToken({ sub: "google-deleteme", email: "deleteme@example.com", email_verified: true }) },
            },
        ]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        const code = extractQueryParam(callbackRes.headers.get("location")!, "code")!;
        const exchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        const { token, userId } = (await readJson(exchangeRes)).data;

        // Sanity: the identity row exists before deletion.
        const identityBefore = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-deleteme").first<{ user_id: number }>();
        expect(identityBefore!.user_id).toBe(userId);

        // 2. Soft-delete the account. OAuth-only -- no currentPassword needed
        // (mirrors userService.ts's deleteUser asymmetry, same as
        // updateUserProfile's password-change check).
        const deleteRes = await app.request("/api/users/me", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }, env);
        expect(deleteRes.status).toBe(200);

        // 3. The oauth_identities row must be gone.
        const identityAfter = await env.DB.prepare("SELECT * FROM oauth_identities WHERE provider_user_id = ?").bind("google-deleteme").first();
        expect(identityAfter).toBeNull();

        // The user row itself is soft-deleted (anonymized), not resurrected.
        const deletedUserRow = await env.DB.prepare("SELECT deleted_at, email FROM users WHERE id = ?").bind(userId).first<{ deleted_at: string | null; email: string }>();
        expect(deletedUserRow!.deleted_at).not.toBeNull();
        expect(deletedUserRow!.email).not.toBe("deleteme@example.com");

        // 4. Signing in again via the SAME Google identity finds no identity
        // row (deleted above) -- so on its own, the old identity can't be
        // used to sign back in by luck. But findOrCreateUserForOAuth also now
        // checks deleted_email (Task 10), and this profile's email DOES
        // match this account's deleted_email, so it correctly RESTORES the
        // same account (same id) rather than creating a brand-new one --
        // the intentional counterpart to the "no resurrection" behavior this
        // describe block is named for: matching email is a deliberate,
        // automatic restore, not an accidental one.
        const secondStartRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const secondState = extractQueryParam(secondStartRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            {
                match: "oauth2.googleapis.com/token",
                json: { id_token: fakeGoogleIdToken({ sub: "google-deleteme", email: "deleteme@example.com", email_verified: true }) },
            },
        ]);
        const secondCallbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${secondState}`, { redirect: "manual" } as RequestInit, env);
        const secondCode = extractQueryParam(secondCallbackRes.headers.get("location")!, "code")!;
        expect(secondCode).toBeTruthy();
        const secondExchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code: secondCode }), env);
        const secondResult = (await readJson(secondExchangeRes)).data;

        expect(secondResult.userId).toBe(userId);

        const newIdentity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-deleteme").first<{ user_id: number }>();
        expect(newIdentity!.user_id).toBe(userId);

        const restoredRow = await env.DB.prepare("SELECT deleted_at, email FROM users WHERE id = ?").bind(userId).first<{ deleted_at: string | null; email: string }>();
        expect(restoredRow!.deleted_at).toBeNull();
        expect(restoredRow!.email).toBe("deleteme@example.com");
    });

    it("also cleans up any live oauth_exchange_codes / linking oauth_states rows for the deleted user", async () => {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            {
                match: "oauth2.googleapis.com/token",
                json: { id_token: fakeGoogleIdToken({ sub: "google-cleanup", email: "cleanup@example.com", email_verified: true }) },
            },
        ]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        const code = extractQueryParam(callbackRes.headers.get("location")!, "code")!;
        const exchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        const { token, userId } = (await readJson(exchangeRes)).data;

        // Mint another exchange code for this same user directly (simulating
        // a code issued seconds before deletion, not yet redeemed) and a
        // pending link-flow oauth_states row.
        await env.DB.prepare("INSERT INTO oauth_exchange_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .bind("fake-hash-for-test", userId, new Date(Date.now() + 60_000).toISOString())
            .run();
        await env.DB.prepare("INSERT INTO oauth_states (state, provider, expires_at, linking_user_id) VALUES (?, ?, ?, ?)")
            .bind("fake-link-state-for-test", "google", new Date(Date.now() + 60_000).toISOString(), userId)
            .run();

        const deleteRes = await app.request("/api/users/me", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" }, env);
        expect(deleteRes.status).toBe(200);

        const remainingCodes = await env.DB.prepare("SELECT * FROM oauth_exchange_codes WHERE user_id = ?").bind(userId).all();
        expect(remainingCodes.results).toHaveLength(0);

        const remainingStates = await env.DB.prepare("SELECT * FROM oauth_states WHERE linking_user_id = ?").bind(userId).all();
        expect(remainingStates.results).toHaveLength(0);
    });
});

// Task 10: unlike the password-based restore flow (authService.ts's
// registerUser/restoreUser), which requires an explicit confirm step because
// registering blind with someone else's email is a real risk, OAuth restore
// is automatic and silent -- the provider has already verified the email,
// and this codebase already auto-links onto a *live* account under that same
// trust model (see "auto-links to an existing password account" above), so
// restoring a *deleted* account by the same verified email is consistent,
// not a new risk.
describe("OAuth login restores a previously soft-deleted account (Task 10)", () => {
    async function registerPasswordUser(username: string, email: string, confirmNewAccount = false): Promise<{ token: string; userId: number }> {
        const res = await app.request("/api/auth/register", jsonRequest({ username, email, password: "correct horse", confirmNewAccount }), env);
        return (await readJson(res)).data;
    }

    async function deleteAccount(token: string): Promise<void> {
        const res = await app.request(
            "/api/users/me",
            { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: "correct horse" }) },
            env
        );
        expect(res.status).toBe(200);
    }

    async function signInViaGoogle(email: string, sub: string): Promise<{ userId: number }> {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([{ match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub, email, email_verified: true }) } }]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        const code = extractQueryParam(callbackRes.headers.get("location")!, "code")!;
        const exchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        return (await readJson(exchangeRes)).data;
    }

    it("restores the deleted account (same id, same reattached user_settings row) on the next Google sign-in with the matching email", async () => {
        const { token, userId } = await registerPasswordUser("restoreme", "restoreme@example.com");
        const settingsBefore = await env.DB.prepare("SELECT user_id FROM user_settings WHERE user_id = ?").bind(userId).first();
        expect(settingsBefore).not.toBeNull();

        await deleteAccount(token);
        const deletedRow = await env.DB.prepare("SELECT deleted_at, deleted_email, deleted_username FROM users WHERE id = ?").bind(userId).first<{
            deleted_at: string | null;
            deleted_email: string | null;
            deleted_username: string | null;
        }>();
        expect(deletedRow!.deleted_at).not.toBeNull();
        expect(deletedRow!.deleted_email).toBe("restoreme@example.com");

        const { userId: restoredUserId } = await signInViaGoogle("restoreme@example.com", "google-restore-1");

        // Same id -- this is what makes owned content (e.g. shelves, entries)
        // reattach automatically instead of starting over on a fresh account.
        expect(restoredUserId).toBe(userId);

        const restoredRow = await env.DB.prepare("SELECT username, email, deleted_at, deleted_email, deleted_username, avatar_key, password_hash FROM users WHERE id = ?")
            .bind(userId)
            .first<{
                username: string;
                email: string;
                deleted_at: string | null;
                deleted_email: string | null;
                deleted_username: string | null;
                avatar_key: string | null;
                password_hash: string;
            }>();
        expect(restoredRow!.deleted_at).toBeNull();
        expect(restoredRow!.deleted_email).toBeNull();
        expect(restoredRow!.deleted_username).toBeNull();
        expect(restoredRow!.username).toBe("restoreme");
        expect(restoredRow!.email).toBe("restoreme@example.com");
        expect(restoredRow!.avatar_key).toBeNull();
        // password_hash from before deletion is untouched -- deleteUser never
        // clears it, so a returning user could still log in with their old
        // password too (not exercised by this OAuth-focused test).
        expect(restoredRow!.password_hash).not.toBe("");

        // user_settings was never deleted by deleteUser -- restoring must not
        // insert a second row for this user.
        const settingsAfter = await env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).all();
        expect(settingsAfter.results).toHaveLength(1);

        const identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-restore-1").first<{ user_id: number }>();
        expect(identity!.user_id).toBe(userId);
    });

    it("falls back to a generated username when the deleted account's original username has since been taken by a different active user", async () => {
        const { token, userId } = await registerPasswordUser("collideme", "collide1@example.com");
        await deleteAccount(token);

        // "collideme" is free again post-deletion (the live username column
        // was overwritten with the deleted-user-<id> placeholder) -- a
        // different person registers it for themselves.
        const other = await registerPasswordUser("collideme", "collide2@example.com");
        expect(other.userId).not.toBe(userId);

        const { userId: restoredUserId } = await signInViaGoogle("collide1@example.com", "google-collide-1");
        expect(restoredUserId).toBe(userId);

        const restoredRow = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first<{ username: string }>();
        expect(restoredRow!.username).not.toBe("collideme");
        expect(restoredRow!.username).not.toBe("");

        // The other, unrelated active account keeps its own username untouched.
        const otherRow = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(other.userId).first<{ username: string }>();
        expect(otherRow!.username).toBe("collideme");
    });

    it("restores the correct (old) account by email even when a different, unrelated account was registered in the meantime", async () => {
        const { token, userId } = await registerPasswordUser("multiold", "multi1@example.com");
        await deleteAccount(token);

        // An entirely unrelated new account, unrelated email, created after
        // the deletion -- must not be confused with the deleted one.
        const unrelated = await registerPasswordUser("multinew", "multi2@example.com");

        const { userId: restoredUserId } = await signInViaGoogle("multi1@example.com", "google-multi-1");
        expect(restoredUserId).toBe(userId);
        expect(restoredUserId).not.toBe(unrelated.userId);
    });

    it("still prioritizes a LIVE account over a deleted one sharing the same email (deleted-then-reclaimed email)", async () => {
        const { token: token1, userId: userId1 } = await registerPasswordUser("reclaimold", "reclaim@example.com");
        await deleteAccount(token1);

        // The email is reclaimed by a brand-new live registration.
        const { userId: userId2 } = await registerPasswordUser("reclaimnew", "reclaim@example.com", true);
        expect(userId2).not.toBe(userId1);

        const { userId: signedInUserId } = await signInViaGoogle("reclaim@example.com", "google-reclaim-1");

        // The live account must win, exactly like the existing "auto-links
        // to an existing password account" behavior -- a currently-active
        // account is never silently swapped out for a deleted one.
        expect(signedInUserId).toBe(userId2);
    });
});

describe("password login against an OAuth-only account", () => {
    it("fails cleanly with 401 since password_hash is the OAUTH_NO_PASSWORD_SENTINEL, not a real hash", async () => {
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

describe("GET /api/auth/oauth/linked and DELETE /api/auth/oauth/:provider", () => {
    async function registerAndLinkGoogle(): Promise<{ token: string; userId: number }> {
        const registerRes = await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }), env);
        const { token, userId } = (await readJson(registerRes)).data;

        const startRes = await app.request("/api/auth/oauth/google/link/start", { headers: { Authorization: `Bearer ${token}` } }, env);
        const state = new URL((await readJson(startRes)).data.redirectUrl).searchParams.get("state")!;
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-manage-1", email: "alice@gmail.com", email_verified: true }) } },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);

        return { token, userId };
    }

    it("requires authentication for both endpoints", async () => {
        expect((await app.request("/api/auth/oauth/linked", {}, env)).status).toBe(401);
        expect((await app.request("/api/auth/oauth/google", { method: "DELETE" }, env)).status).toBe(401);
    });

    it("lists a linked provider", async () => {
        const { token } = await registerAndLinkGoogle();
        const res = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        const json = await readJson(res);
        expect(json.data).toHaveLength(1);
        expect(json.data[0].provider).toBe("google");
        expect(json.data[0].email).toBe("alice@gmail.com");
    });

    it("unlinks a provider when the account still has a real password", async () => {
        const { token } = await registerAndLinkGoogle();
        const res = await app.request("/api/auth/oauth/google", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(200);

        const listRes = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(0);
    });

    it("blocks unlinking the only sign-in method for an OAuth-only account", async () => {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-onlyauth", email: "onlyauth@example.com", email_verified: true }) } },
        ]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        const code = extractQueryParam(callbackRes.headers.get("location")!, "code")!;
        const exchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        const token = (await readJson(exchangeRes)).data.token;

        const res = await app.request("/api/auth/oauth/google", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("UNLINK_BLOCKED");

        const listRes = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(1);
    });

    it("treats unlinking a never-linked provider as a successful no-op for OAuth-only accounts", async () => {
        // Create an OAuth-only account with only google linked
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-noop-test", email: "noop@example.com", email_verified: true }) } },
        ]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        const code = extractQueryParam(callbackRes.headers.get("location")!, "code")!;
        const exchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        const token = (await readJson(exchangeRes)).data.token;

        // Attempt to unlink github (never linked) on an OAuth-only account with only google
        // This should be a silent no-op success (200), not a 409 block
        const res = await app.request("/api/auth/oauth/github", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(200);

        // Verify google is still linked (the no-op didn't touch anything)
        const listRes = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        const listJson = await readJson(listRes);
        expect(listJson.data).toHaveLength(1);
        expect(listJson.data[0].provider).toBe("google");
    });
});
