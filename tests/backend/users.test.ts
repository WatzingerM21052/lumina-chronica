import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { readJson } from "./testUtils";

let env: { DB: D1Database; JWT_SECRET: string };
let token: string;

function jsonRequest(method: string, body: unknown, authToken?: string) {
    return {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
    };
}

beforeEach(async () => {
    env = { DB: createFakeD1(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    const registerRes = await app.request(
        "/api/auth/register",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "alice", email: "alice@example.com", password: "correct horse" }),
        },
        env
    );
    token = (await readJson(registerRes)).data.token;
});

describe("GET /api/users/me", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/me", {}, env);
        expect(res.status).toBe(401);
    });

    it("returns the current user's profile without the password hash", async () => {
        const res = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.username).toBe("alice");
        expect(json.data.email).toBe("alice@example.com");
        expect(json.data.roleName).toBe("USER");
        expect(json.data.password_hash).toBeUndefined();
        expect(json.data.passwordHash).toBeUndefined();
    });
});

describe("PUT /api/users/me", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice2" }), env);
        expect(res.status).toBe(401);
    });

    it("updates the username and persists it", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice2" }, token), env);
        expect(res.status).toBe(200);

        const getRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(getRes)).data.username).toBe("alice2");
    });

    it("rejects a username already taken by another user", async () => {
        await app.request(
            "/api/auth/register",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "bob", email: "bob@example.com", password: "correct horse" }),
            },
            env
        );

        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "bob" }, token), env);
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("USERNAME_TAKEN");
    });

    it("rejects a password change with the wrong current password", async () => {
        const res = await app.request(
            "/api/users/me",
            jsonRequest("PUT", { currentPassword: "wrong password", newPassword: "new password 123" }, token),
            env
        );
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_PASSWORD");
    });

    it("changes the password and allows login with the new one", async () => {
        const updateRes = await app.request(
            "/api/users/me",
            jsonRequest("PUT", { currentPassword: "correct horse", newPassword: "new password 123" }, token),
            env
        );
        expect(updateRes.status).toBe(200);

        const loginRes = await app.request(
            "/api/auth/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: "alice@example.com", password: "new password 123" }),
            },
            env
        );
        expect(loginRes.status).toBe(200);
    });
});
