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

async function uploadBook(token: string, title = "Test Book", genre?: string): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    if (genre) form.set("genre", genre);
    form.set("file", new File(["book content"], "book.txt", { type: "text/plain" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function setPages(token: string, bookId: number, pages: number): Promise<void> {
    await app.request(
        `/api/books/${bookId}`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pages }),
        },
        env
    );
}

async function saveProgress(token: string, bookId: number, percentage: number): Promise<void> {
    await app.request(
        "/api/reading/update",
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ bookId, percentage }),
        },
        env
    );
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("GET /api/statistics", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/statistics", {}, env);
        expect(res.status).toBe(401);
    });

    it("returns zeroed statistics for a fresh account", async () => {
        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data).toEqual({
            booksRead: 0,
            booksInProgress: 0,
            pagesRead: 0,
            genreBreakdown: [],
            recentActivity: [],
        });
    });

    it("counts finished vs in-progress books scoped to the caller", async () => {
        const finishedId = await uploadBook(tokenA, "Finished Book");
        await saveProgress(tokenA, finishedId, 100);
        const inProgressId = await uploadBook(tokenA, "In Progress Book");
        await saveProgress(tokenA, inProgressId, 40);

        // Bob's own data must not leak into Alice's counts.
        const bobBookId = await uploadBook(tokenB, "Bob's Book");
        await saveProgress(tokenB, bobBookId, 100);

        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.booksRead).toBe(1);
        expect(json.data.booksInProgress).toBe(1);
    });

    it("estimates pages read from book_metadata.pages weighted by progress percentage", async () => {
        const finishedId = await uploadBook(tokenA, "Finished Book");
        await setPages(tokenA, finishedId, 300);
        await saveProgress(tokenA, finishedId, 100);

        const halfId = await uploadBook(tokenA, "Half Read Book");
        await setPages(tokenA, halfId, 200);
        await saveProgress(tokenA, halfId, 50);

        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.pagesRead).toBe(300 + 100);
    });

    it("treats a missing page count as zero pages instead of throwing", async () => {
        const bookId = await uploadBook(tokenA, "No Metadata Book");
        await saveProgress(tokenA, bookId, 75);

        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.pagesRead).toBe(0);
    });

    it("groups started books by genre, most-read first, falling back to Unbekannt", async () => {
        const fantasy1 = await uploadBook(tokenA, "Fantasy 1", "Fantasy");
        await saveProgress(tokenA, fantasy1, 10);
        const fantasy2 = await uploadBook(tokenA, "Fantasy 2", "Fantasy");
        await saveProgress(tokenA, fantasy2, 20);
        const noGenre = await uploadBook(tokenA, "No Genre Book");
        await saveProgress(tokenA, noGenre, 5);

        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.genreBreakdown).toEqual([
            { genre: "Fantasy", count: 2 },
            { genre: "Unbekannt", count: 1 },
        ]);
    });

    it("returns recent activity ordered by most recently opened, capped at 10", async () => {
        for (let i = 0; i < 11; i++) {
            const bookId = await uploadBook(tokenA, `Book ${i}`);
            await saveProgress(tokenA, bookId, 10 + i);
        }

        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.recentActivity).toHaveLength(10);
        expect(json.data.recentActivity[0].book.title).toBe("Book 10");
        expect(json.data.recentActivity[0].percentage).toBe(20);
    });

    it("does not include another user's activity or genres", async () => {
        const bookId = await uploadBook(tokenB, "Bob's Fantasy Book", "Fantasy");
        await saveProgress(tokenB, bookId, 50);

        const res = await app.request("/api/statistics", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.recentActivity).toEqual([]);
        expect(json.data.genreBreakdown).toEqual([]);
    });
});
