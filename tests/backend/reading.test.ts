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

describe("GET /api/reading/:bookId", () => {
    it("requires authentication", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/reading/${bookId}`, {}, env);
        expect(res.status).toBe(401);
    });

    it("returns null progress for a book that hasn't been opened yet", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/reading/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data).toBeNull();
    });

    it("returns 404 for another user's book", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/reading/${bookId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("POST /api/reading/update", () => {
    it("requires authentication", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(
            "/api/reading/update",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId, percentage: 10 }) },
            env
        );
        expect(res.status).toBe(401);
    });

    it("returns 404 for another user's book", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(
            "/api/reading/update",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
                body: JSON.stringify({ bookId, percentage: 10 }),
            },
            env
        );
        expect(res.status).toBe(404);
    });

    it("saves progress and GET reflects it", async () => {
        const bookId = await uploadBook(tokenA);
        const saveRes = await app.request(
            "/api/reading/update",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, chapter: 3, position: "0.42", percentage: 37.5 }),
            },
            env
        );
        expect(saveRes.status).toBe(200);

        const getRes = await app.request(`/api/reading/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(getRes);
        expect(json.data).toMatchObject({ chapter: 3, position: "0.42", percentage: 37.5 });
    });

    it("upserts rather than duplicating on repeated saves for the same book", async () => {
        const bookId = await uploadBook(tokenA);
        for (const percentage of [10, 20, 30]) {
            await app.request(
                "/api/reading/update",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                    body: JSON.stringify({ bookId, percentage }),
                },
                env
            );
        }

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM reading_progress WHERE book_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(1);

        const getRes = await app.request(`/api/reading/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(getRes)).data.percentage).toBe(30);
    });
});

describe("DELETE /api/books/:id with existing reading progress", () => {
    it("deletes the book even when a reading_progress row references it", async () => {
        const bookId = await uploadBook(tokenA);
        await app.request(
            "/api/reading/update",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ bookId, percentage: 42 }),
            },
            env
        );

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM reading_progress WHERE book_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
