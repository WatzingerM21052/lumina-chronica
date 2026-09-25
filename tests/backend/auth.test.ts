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

describe("POST /api/auth/restore", () => {
    async function registerAndDelete(username: string, email: string): Promise<number> {
        const registerRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username, email, password: "correct horse" }),
            env
        );
        const { token, userId } = (await readJson(registerRes)).data;
        await app.request(
            "/api/users/me",
            {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword: "correct horse" }),
            },
            env
        );
        return userId;
    }

    it("returns 404 when there is no deleted account for this email", async () => {
        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "whoever", email: "never-existed@example.com", password: "a new password" }),
            env
        );
        expect(res.status).toBe(404);
    });

    it("restores the same account id, reattaching its prior content, with a fresh password", async () => {
        const originalId = await registerAndDelete("original", "restore-me@example.com");

        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "reclaimed", email: "restore-me@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.userId).toBe(originalId);

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${json.data.token}` } }, env);
        const me = await readJson(meRes);
        expect(me.data.id).toBe(originalId);
        expect(me.data.username).toBe("reclaimed");
        expect(me.data.email).toBe("restore-me@example.com");

        const loginRes = await app.request(
            "/api/auth/login",
            jsonRequest({ identifier: "restore-me@example.com", password: "a fresh password" }),
            env
        );
        expect(loginRes.status).toBe(200);
    });

    it("rejects a restore username already taken by a different active user", async () => {
        await registerAndDelete("original2", "restore-me2@example.com");
        await app.request("/api/auth/register", jsonRequest({ username: "taken", email: "someone@example.com", password: "correct horse" }), env);

        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "taken", email: "restore-me2@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("USERNAME_TAKEN");
    });

    it("stays possible after a different, brand new account claimed the same email (confirmNewAccount path)", async () => {
        const originalId = await registerAndDelete("original3", "restore-me3@example.com");
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "interim", email: "restore-me3@example.com", password: "correct horse", confirmNewAccount: true }),
            env
        );

        // The email is now live on the interim account -- restoring the
        // original must fail with the ordinary EmailTakenError, not a crash
        // or a silent overwrite.
        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "reclaimed3", email: "restore-me3@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("EMAIL_TAKEN");

        const original = await env.DB.prepare("SELECT deleted_at FROM users WHERE id = ?").bind(originalId).first<{ deleted_at: string | null }>();
        expect(original!.deleted_at).not.toBeNull();
    });

    it("restores the most recently deleted account when the same email has been deleted more than once", async () => {
        // Deleted, reclaimed by a new account (confirmNewAccount), deleted
        // again -- two rows now share the same deleted_email. Without the
        // ORDER BY deleted_at DESC tie-break, whichever row SQLite happened
        // to return first would win; this asserts the most-recently-deleted
        // one does, deterministically.
        const firstId = await registerAndDelete("firstclaim", "twice-deleted@example.com");

        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "secondclaim", email: "twice-deleted@example.com", password: "correct horse", confirmNewAccount: true }),
            env
        );
        // registerAndDelete's own register call would collide with the
        // email already being live on "secondclaim" -- delete that account
        // directly (login, then DELETE /api/users/me) instead of reusing
        // the helper.
        const secondUser = await env.DB.prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL").bind("secondclaim").first<{ id: number }>();
        expect(secondUser).not.toBeNull();
        const loginRes = await app.request("/api/auth/login", jsonRequest({ identifier: "twice-deleted@example.com", password: "correct horse" }), env);
        const { token } = (await readJson(loginRes)).data;
        await app.request(
            "/api/users/me",
            { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: "correct horse" }) },
            env
        );

        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "reclaimed-final", email: "twice-deleted@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.userId).toBe(secondUser!.id);
        expect(json.data.userId).not.toBe(firstId);
    });
});
