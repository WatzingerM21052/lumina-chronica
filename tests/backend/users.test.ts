import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
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
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
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

describe("PUT /api/users/me/avatar", () => {
    it("requires authentication", async () => {
        const form = new FormData();
        form.set("avatar", new File(["avatar bytes"], "avatar.jpg", { type: "image/jpeg" }));
        const res = await app.request("/api/users/me/avatar", { method: "PUT", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("uploads an avatar and returns an absolute, publicly-servable URL", async () => {
        const form = new FormData();
        form.set("avatar", new File(["avatar bytes"], "avatar.jpg", { type: "image/jpeg" }));
        const res = await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
        expect(res.status).toBe(200);

        const json = await readJson(res);
        expect(new URL(json.data.avatarUrl).pathname).toBe("/api/users/alice/avatar");

        // The very URL just returned actually serves the uploaded bytes, with
        // zero auth -- an avatar has no privacy concept, unlike a book cover.
        const getRes = await app.request("/api/users/alice/avatar", {}, env);
        expect(getRes.status).toBe(200);
        expect(getRes.headers.get("Content-Type")).toBe("image/jpeg");
        expect(await getRes.text()).toBe("avatar bytes");
    });

    it("replaces an existing avatar, cleaning up the old R2 object", async () => {
        const firstForm = new FormData();
        firstForm.set("avatar", new File(["first avatar"], "avatar.jpg", { type: "image/jpeg" }));
        await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: firstForm }, env);

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        const userId = (await readJson(meRes)).data.id;

        // Replace with a different extension -- the old .jpg object must be cleaned up.
        const secondForm = new FormData();
        secondForm.set("avatar", new File(["second avatar"], "avatar.png", { type: "image/png" }));
        const secondRes = await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: secondForm }, env);
        expect(secondRes.status).toBe(200);

        const getRes = await app.request("/api/users/alice/avatar", {}, env);
        expect(getRes.headers.get("Content-Type")).toBe("image/png");
        expect(await getRes.text()).toBe("second avatar");

        const oldObject = await env.STORAGE.get(`avatars/${userId}/avatar.jpg`);
        expect(oldObject).toBeNull();
    });

    it("rejects a disallowed file type", async () => {
        const form = new FormData();
        form.set("avatar", new File(["not an image"], "avatar.gif", { type: "image/gif" }));
        const res = await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });
});

describe("GET /api/users/:username/avatar", () => {
    it("returns 404 for a user with no avatar set", async () => {
        const res = await app.request("/api/users/alice/avatar", {}, env);
        expect(res.status).toBe(404);
    });

    it("returns 404 for a nonexistent username", async () => {
        const res = await app.request("/api/users/nobody/avatar", {}, env);
        expect(res.status).toBe(404);
    });
});
