// Usernames are unique and found regardless of case: "anna" could be
// registered next to "Anna" (impersonation on /u/{username}), and signing
// in, sharing or opening /u/... with a different case failed.

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };

function post(path: string, body: unknown, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return app.request(path, { method: "POST", headers, body: JSON.stringify(body) }, env);
}

async function register(username: string, email: string): Promise<{ token: string; userId: number }> {
    const res = await post("/api/auth/register", { username, email, password: "correct horse" });
    expect(res.status).toBe(201);
    return (await readJson(res)).data;
}

beforeEach(() => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
});

describe("username case", () => {
    it("rejects a username that differs from a taken one only in case", async () => {
        await register("Anna", "anna@example.com");

        const res = await post("/api/auth/register", { username: "anna", email: "other@example.com", password: "correct horse" });

        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("USERNAME_TAKEN");
    });

    it("rejects renaming to another user's name in a different case", async () => {
        await register("Anna", "anna@example.com");
        const bob = await register("bob", "bob@example.com");

        const res = await app.request(
            "/api/users/me",
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bob.token}` }, body: JSON.stringify({ username: "ANNA" }) },
            env
        );

        expect(res.status).toBe(409);
    });

    it("still lets a user change the case of their own name", async () => {
        const anna = await register("anna", "anna@example.com");

        const res = await app.request(
            "/api/users/me",
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anna.token}` }, body: JSON.stringify({ username: "Anna" }) },
            env
        );

        expect(res.status).toBe(200);
    });

    it("signs in with the username in any case", async () => {
        const anna = await register("Anna", "anna@example.com");

        const res = await post("/api/auth/login", { identifier: "anna", password: "correct horse" });

        expect(res.status).toBe(200);
        expect((await readJson(res)).data.userId).toBe(anna.userId);
    });

    it("prefers the exact spelling when older rows differ only in case", async () => {
        const first = await register("Anna", "anna@example.com");
        const second = await register("other", "other@example.com");
        await env.DB.prepare("UPDATE users SET username = 'anna' WHERE id = ?").bind(second.userId).run();

        const exact = await post("/api/auth/login", { identifier: "anna", password: "correct horse" });
        const exactProfile = await readJson(await app.request("/api/users/ANNA/public", {}, env));
        const ownProfile = await readJson(await app.request("/api/users/Anna/public", {}, env));

        expect((await readJson(exact)).data.userId).toBe(second.userId);
        expect(exactProfile.data.username).toBe("Anna"); // no exact match: oldest
        expect(ownProfile.data.username).toBe("Anna");
        expect(first.userId).toBeLessThan(second.userId);
    });

    it("finds the public profile, follow and share targets in any case", async () => {
        await register("Anna", "anna@example.com");
        const bob = await register("bob", "bob@example.com");

        const profile = await app.request("/api/users/anna/public", {}, env);
        const follow = await post("/api/users/ANNA/follow", {}, bob.token);

        const form = new FormData();
        form.set("title", "Shared");
        form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
        const upload = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${bob.token}` }, body: form }, env);
        const bookId = (await readJson(upload)).data.id;
        const share = await post(`/api/books/${bookId}/shares`, { username: "anna" }, bob.token);

        expect(profile.status).toBe(200);
        expect((await readJson(profile)).data.username).toBe("Anna");
        expect(follow.status).toBe(204);
        expect(share.status).toBe(204);
    });
});
