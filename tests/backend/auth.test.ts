import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
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
