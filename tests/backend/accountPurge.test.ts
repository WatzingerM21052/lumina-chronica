// Deleted accounts: restorable for 90 days, then removed for good by the
// daily cleanup -- the account and everything it owns or wrote (user
// decision 2026-10-04, see the privacy policy).

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { purgeExpiredAccounts } from "../../backend/src/services/accountPurgeService";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };

const jsonRequest = (body: unknown, token?: string) => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
});

async function register(username: string): Promise<{ token: string; userId: number }> {
    return (await readJson(await app.request("/api/auth/register", jsonRequest({ username, email: `${username}@example.com`, password: "correct horse" }), env))).data;
}

async function deleteAccount(token: string): Promise<void> {
    await app.request(
        "/api/users/me",
        { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: "correct horse" }) },
        env
    );
}

// Moves an account's deletion this many days into the past.
async function deletedDaysAgo(userId: number, days: number): Promise<void> {
    await env.DB.prepare(`UPDATE users SET deleted_at = datetime('now', '-${days} days') WHERE id = ?`).bind(userId).run();
}

async function count(sql: string, ...params: unknown[]): Promise<number> {
    return (await env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;
}

beforeEach(() => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
});

describe("purgeExpiredAccounts", () => {
    it("removes an account deleted more than 90 days ago with everything it owned and wrote", async () => {
        const alice = await register("alice");
        const bob = await register("bob");
        const auth = { Authorization: `Bearer ${alice.token}` };

        // Alice's own things: a book with its file, a project with a pictured character, a shelf.
        const bookForm = new FormData();
        bookForm.set("title", "Alice's Book");
        bookForm.set("file", new File(["epub"], "a.epub", { type: "application/epub+zip" }));
        const bookId = (await readJson(await app.request("/api/books/upload", { method: "POST", headers: auth, body: bookForm }, env))).data.id;
        const projectForm = new FormData();
        projectForm.set("title", "Alice's World");
        const projectId = (await readJson(await app.request("/api/projects", { method: "POST", headers: auth, body: projectForm }, env))).data.id;
        const characterForm = new FormData();
        characterForm.set("name", "Aldous");
        characterForm.set("image", new File(["png"], "a.png", { type: "image/png" }));
        await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: auth, body: characterForm }, env);
        const shelfForm = new FormData();
        shelfForm.set("name", "Favourites");
        await app.request("/api/shelves", { method: "POST", headers: auth, body: shelfForm }, env);

        // What Alice did on Bob's things: rating, comment, follow.
        const bobForm = new FormData();
        bobForm.set("title", "Bob's Book");
        bobForm.set("file", new File(["epub"], "b.epub", { type: "application/epub+zip" }));
        const bobBook = (await readJson(await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${bob.token}` }, body: bobForm }, env))).data.id;
        await app.request(`/api/books/${bobBook}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bob.token}` }, body: JSON.stringify({ visibility: "PUBLIC" }) }, env);
        await app.request(`/api/books/${bobBook}/rating`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify({ rating: 4 }) }, env);
        await app.request(`/api/books/${bobBook}/comments`, jsonRequest({ content: "Schön!" }, alice.token), env);
        await app.request("/api/users/bob/follow", { method: "POST", headers: auth }, env);

        const stored = (await env.DB.prepare(
            "SELECT file_url AS k FROM book_files WHERE book_id = ?1 UNION ALL SELECT image_url FROM characters WHERE project_id = ?2"
        ).bind(bookId, projectId).all<{ k: string }>()).results.map((r) => r.k);
        expect(stored).toHaveLength(2);

        // Everything really exists before the purge.
        expect(await count("SELECT COUNT(*) AS n FROM shelves WHERE owner_id = ?", alice.userId)).toBe(1);
        expect(await count("SELECT COUNT(*) AS n FROM ratings WHERE user_id = ?", alice.userId)).toBe(1);
        expect(await count("SELECT COUNT(*) AS n FROM comments WHERE user_id = ?", alice.userId)).toBe(1);
        expect(await count("SELECT COUNT(*) AS n FROM followers WHERE follower_id = ?", alice.userId)).toBe(1);

        await deleteAccount(alice.token);
        await deletedDaysAgo(alice.userId, 91);

        expect(await purgeExpiredAccounts(env.DB, env.STORAGE)).toBe(1);

        expect(await count("SELECT COUNT(*) AS n FROM users WHERE id = ?", alice.userId)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM books WHERE owner_id = ?", alice.userId)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?", alice.userId)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM shelves WHERE owner_id = ?", alice.userId)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM ratings WHERE user_id = ?", alice.userId)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM comments WHERE user_id = ?", alice.userId)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM followers WHERE follower_id = ?1 OR following_id = ?1", alice.userId)).toBe(0);
        for (const key of stored) expect(await env.STORAGE.get(key)).toBeNull();
        // Bob and his book are untouched.
        expect(await count("SELECT COUNT(*) AS n FROM books WHERE id = ?", bobBook)).toBe(1);
    });

    it("leaves an account inside its restore window alone", async () => {
        const alice = await register("alice");
        await deleteAccount(alice.token);
        await deletedDaysAgo(alice.userId, 30);

        expect(await purgeExpiredAccounts(env.DB, env.STORAGE)).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM users WHERE id = ?", alice.userId)).toBe(1);
    });
});

describe("restoring a deleted account", () => {
    it("works within 90 days and no longer after", async () => {
        const alice = await register("alice");
        await deleteAccount(alice.token);

        await deletedDaysAgo(alice.userId, 91);
        const late = await app.request("/api/auth/restore", jsonRequest({ username: "alice", email: "alice@example.com", password: "a new password" }), env);
        expect(late.status).toBe(404);

        await deletedDaysAgo(alice.userId, 89);
        const inTime = await app.request("/api/auth/restore", jsonRequest({ username: "alice", email: "alice@example.com", password: "a new password" }), env);
        expect(inTime.status).toBe(200);
    });
});
