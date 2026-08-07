import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let tokenA: string;
let tokenB: string;

async function registerAndLogin(username: string, email: string): Promise<string> {
    const res = await app.request(
        "/api/auth/register",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password: "correct horse" }),
        },
        env
    );
    return (await readJson(res)).data.token;
}

async function uploadBook(token: string, title = "Test Book"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    form.set("file", new File(["book content"], "book.txt", { type: "text/plain" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("GET /api/bookmarks/:bookId", () => {
    it("requires authentication", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/bookmarks/${bookId}`, {}, env);
        expect(res.status).toBe(401);
    });

    it("returns an empty list for a book with no bookmarks yet", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/bookmarks/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data).toEqual([]);
    });

    it("returns 404 for another user's book", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/bookmarks/${bookId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });

    it("returns bookmarks ordered by percentage, oldest first for ties", async () => {
        const bookId = await uploadBook(tokenA);
        for (const percentage of [50, 10, 30]) {
            await app.request(
                "/api/bookmarks",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                    body: JSON.stringify({ bookId, percentage }),
                },
                env
            );
        }

        const res = await app.request(`/api/bookmarks/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);
        expect(json.data.map((b: { percentage: number }) => b.percentage)).toEqual([10, 30, 50]);
    });
});

describe("POST /api/bookmarks", () => {
    it("requires authentication", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(
            "/api/bookmarks",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId, percentage: 10 }) },
            env
        );
        expect(res.status).toBe(401);
    });

    it("returns 404 for another user's book", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
                body: JSON.stringify({ bookId, percentage: 10 }),
            },
            env
        );
        expect(res.status).toBe(404);
    });

    it("creates a bookmark with chapter/position/percentage/note and GET reflects it", async () => {
        const bookId = await uploadBook(tokenA);
        const createRes = await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, chapter: 3, position: "0.42", percentage: 37.5, note: "Great cliffhanger" }),
            },
            env
        );
        expect(createRes.status).toBe(201);
        const created = await readJson(createRes);
        expect(created.data).toMatchObject({ bookId, chapter: 3, position: "0.42", percentage: 37.5, note: "Great cliffhanger" });

        const getRes = await app.request(`/api/bookmarks/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(getRes);
        expect(json.data).toHaveLength(1);
        expect(json.data[0]).toMatchObject({ note: "Great cliffhanger" });
    });

    it("allows multiple bookmarks on the same book, unlike reading_progress's single row", async () => {
        const bookId = await uploadBook(tokenA);
        for (const percentage of [10, 20, 30]) {
            await app.request(
                "/api/bookmarks",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                    body: JSON.stringify({ bookId, percentage }),
                },
                env
            );
        }

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM bookmarks WHERE book_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(3);
    });
});

describe("PUT /api/bookmarks/:id", () => {
    it("returns 404 for a bookmark owned by another user", async () => {
        const bookId = await uploadBook(tokenA);
        const createRes = await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, percentage: 10 }),
            },
            env
        );
        const bookmarkId = (await readJson(createRes)).data.id;

        const res = await app.request(
            `/api/bookmarks/${bookmarkId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
                body: JSON.stringify({ note: "not mine" }),
            },
            env
        );
        expect(res.status).toBe(404);
    });

    it("updates the note", async () => {
        const bookId = await uploadBook(tokenA);
        const createRes = await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, percentage: 10, note: "original" }),
            },
            env
        );
        const bookmarkId = (await readJson(createRes)).data.id;

        const updateRes = await app.request(
            `/api/bookmarks/${bookmarkId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ note: "updated" }),
            },
            env
        );
        expect(updateRes.status).toBe(200);
        expect((await readJson(updateRes)).data.note).toBe("updated");
    });
});

describe("DELETE /api/bookmarks/:id", () => {
    it("returns 404 for a bookmark owned by another user", async () => {
        const bookId = await uploadBook(tokenA);
        const createRes = await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, percentage: 10 }),
            },
            env
        );
        const bookmarkId = (await readJson(createRes)).data.id;

        const res = await app.request(`/api/bookmarks/${bookmarkId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });

    it("deletes the bookmark", async () => {
        const bookId = await uploadBook(tokenA);
        const createRes = await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, percentage: 10 }),
            },
            env
        );
        const bookmarkId = (await readJson(createRes)).data.id;

        const deleteRes = await app.request(`/api/bookmarks/${bookmarkId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/bookmarks/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(getRes)).data).toEqual([]);
    });
});

describe("DELETE /api/books/:id with existing bookmarks", () => {
    it("deletes the book even when bookmarks reference it", async () => {
        const bookId = await uploadBook(tokenA);
        await app.request(
            "/api/bookmarks",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, percentage: 42 }),
            },
            env
        );

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM bookmarks WHERE book_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
