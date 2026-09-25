import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { LOGIN_MAX_ATTEMPTS, REGISTER_MAX_ATTEMPTS } from "../../backend/src/services/rateLimitService";
import { createFakeD1 } from "./fakeD1";
import { readJson } from "./testUtils";

let env: { DB: D1Database; JWT_SECRET: string };

beforeEach(() => {
    env = { DB: createFakeD1(), JWT_SECRET: "test-secret-do-not-use-in-production" };
});

function jsonRequest(body: unknown) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

describe("POST /api/auth/register", () => {
    it("creates a user + settings row and returns a token", async () => {
        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }),
            env
        );
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.success).toBe(true);
        expect(typeof json.data.token).toBe("string");
        expect(typeof json.data.userId).toBe("number");

        const settings = await env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(json.data.userId).first();
        expect(settings).not.toBeNull();
    });

    it("rejects a duplicate email with 409", async () => {
        await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "dup@example.com", password: "correct horse" }), env);
        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "someoneelse", email: "dup@example.com", password: "correct horse" }),
            env
        );

        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("EMAIL_TAKEN");
    });

    it("rejects a duplicate username with 409", async () => {
        await app.request("/api/auth/register", jsonRequest({ username: "dupname", email: "one@example.com", password: "correct horse" }), env);
        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "dupname", email: "two@example.com", password: "correct horse" }),
            env
        );

        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("USERNAME_TAKEN");
    });

    it("rejects a password shorter than 8 characters", async () => {
        const res = await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "short" }), env);

        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an invalid email address", async () => {
        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "not-an-email", password: "correct horse" }),
            env
        );

        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });
});

describe("POST /api/auth/login", () => {
    beforeEach(async () => {
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }),
            env
        );
    });

    it("returns a token for correct credentials using the email", async () => {
        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "correct horse" }), env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(typeof json.data.token).toBe("string");
    });

    it("returns a token for correct credentials using the username", async () => {
        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "alice", password: "correct horse" }), env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(typeof json.data.token).toBe("string");
    });

    it("rejects an incorrect password with 401", async () => {
        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "wrong password" }), env);

        expect(res.status).toBe(401);
        expect((await readJson(res)).error.code).toBe("INVALID_CREDENTIALS");
    });

    it("rejects an unknown identifier with 401", async () => {
        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "nobody@example.com", password: "correct horse" }), env);

        expect(res.status).toBe(401);
        expect((await readJson(res)).error.code).toBe("INVALID_CREDENTIALS");
    });
});

describe("POST /api/auth/login rate limiting", () => {
    beforeEach(async () => {
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }),
            env
        );
    });

    it("returns 429 after too many failed attempts against the same identifier", async () => {
        for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
            const res = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "wrong" }), env);
            expect(res.status).toBe(401);
        }

        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "wrong" }), env);
        const json = await readJson(res);

        expect(res.status).toBe(429);
        expect(json.error.code).toBe("RATE_LIMITED");
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });

    it("does not throttle a different identifier after another account's attempts are exhausted", async () => {
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "bob", email: "bob@example.com", password: "correct horse" }),
            env
        );
        for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
            await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "wrong" }), env);
        }

        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "bob@example.com", password: "correct horse" }), env);
        expect(res.status).toBe(200);
    });

    it("resets the counter after a successful login", async () => {
        for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
            await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "wrong" }), env);
        }
        const successRes = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "correct horse" }), env);
        expect(successRes.status).toBe(200);

        const res = await app.request("/api/auth/login", jsonRequest({ identifier: "alice@example.com", password: "wrong" }), env);
        expect(res.status).toBe(401);
    });
});

describe("POST /api/auth/register rate limiting", () => {
    it("returns 429 after too many registration attempts from the same source", async () => {
        for (let i = 0; i < REGISTER_MAX_ATTEMPTS; i++) {
            await app.request(
                "/api/auth/register",
                jsonRequest({ username: `user${i}`, email: `user${i}@example.com`, password: "correct horse" }),
                env
            );
        }

        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "onemore", email: "onemore@example.com", password: "correct horse" }),
            env
        );
        const json = await readJson(res);

        expect(res.status).toBe(429);
        expect(json.error.code).toBe("RATE_LIMITED");
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });
});

describe("POST /api/auth/logout", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/auth/logout", { method: "POST" }, env);
        expect(res.status).toBe(401);
    });

    it("returns 204 with a valid token", async () => {
        const registerRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }),
            env
        );
        const { token } = (await readJson(registerRes)).data;

        const res = await app.request("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(204);
    });
});

describe("POST /api/auth/register against a deleted account's email", () => {
    async function registerAndDelete(email: string): Promise<void> {
        const registerRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "original", email, password: "correct horse" }),
            env
        );
        const token = (await readJson(registerRes)).data.token;
        await app.request(
            "/api/users/me",
            {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword: "correct horse" }),
            },
            env
        );
    }

    it("returns 409 DELETED_ACCOUNT_FOUND instead of creating or restoring", async () => {
        await registerAndDelete("deleted@example.com");

        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "newname", email: "deleted@example.com", password: "a new password" }),
            env
        );
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("DELETED_ACCOUNT_FOUND");

        const stillFree = await env.DB.prepare("SELECT id FROM users WHERE email = 'deleted@example.com' AND deleted_at IS NULL").first();
        expect(stillFree).toBeNull();
    });

    it("creates a brand new, independent account when confirmNewAccount is true", async () => {
        await registerAndDelete("deleted2@example.com");

        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "brandnew", email: "deleted2@example.com", password: "a new password", confirmNewAccount: true }),
            env
        );
        expect(res.status).toBe(201);

        const users = await env.DB.prepare("SELECT id FROM users WHERE email = 'deleted2@example.com'").all();
        expect(users.results).toHaveLength(1);
    });

    it("registers normally when there is no matching deleted account", async () => {
        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "freshuser", email: "never-deleted@example.com", password: "a new password" }),
            env
        );
        expect(res.status).toBe(201);
    });

    it("returns 409 EMAIL_TAKEN when deleted email has been reclaimed by active account", async () => {
        // Step 1: Register and delete account A
        await registerAndDelete("reclaimed@example.com");

        // Step 2: Register account B with the same email (with confirmNewAccount override)
        const registerBRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "accountb", email: "reclaimed@example.com", password: "a new password", confirmNewAccount: true }),
            env
        );
        expect(registerBRes.status).toBe(201);

        // Step 3: Try to register account C with the same email (without confirmNewAccount)
        // Expected: 409 EMAIL_TAKEN (not DELETED_ACCOUNT_FOUND), since email is actively held by B
        const registerCRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "accountc", email: "reclaimed@example.com", password: "a new password" }),
            env
        );
        expect(registerCRes.status).toBe(409);
        expect((await readJson(registerCRes)).error.code).toBe("EMAIL_TAKEN");
    });
});
