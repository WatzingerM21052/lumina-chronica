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

async function createShelf(token: string, name = "Fantasy Sammlung"): Promise<number> {
    const form = new FormData();
    form.set("name", name);
    const res = await app.request("/api/shelves", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
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

describe("GET /api/dashboard", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/dashboard", {}, env);
        expect(res.status).toBe(401);
    });

    it("returns zeroed overview and empty continue-reading for a fresh account", async () => {
        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.continueReading).toEqual([]);
        expect(json.data.overview).toEqual({ totalBooks: 0, totalShelves: 0, totalFavorites: 0, finishedBooks: 0 });
    });

    it("counts books, shelves, and favorites scoped to the caller", async () => {
        const bookId = await uploadBook(tokenA);
        await createShelf(tokenA);
        await app.request(`/api/books/${bookId}/favorite`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        // Bob's own data must not leak into Alice's counts.
        await uploadBook(tokenB);
        await createShelf(tokenB);

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.overview).toEqual({ totalBooks: 1, totalShelves: 1, totalFavorites: 1, finishedBooks: 0 });
    });

    it("counts a book as finished once its progress reaches 100%", async () => {
        const bookId = await uploadBook(tokenA);
        await saveProgress(tokenA, bookId, 100);

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.overview.finishedBooks).toBe(1);
    });

    it("returns continue-reading items ordered by most recently opened, capped at 5", async () => {
        const bookIds: number[] = [];
        for (let i = 0; i < 6; i++) {
            const bookId = await uploadBook(tokenA, `Book ${i}`);
            bookIds.push(bookId);
            await saveProgress(tokenA, bookId, 10 + i);
        }

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.continueReading).toHaveLength(5);
        // Most recently saved (last uploaded/read) comes first.
        expect(json.data.continueReading[0].book.title).toBe("Book 5");
        expect(json.data.continueReading[0].percentage).toBe(15);
    });

    it("does not include another user's reading progress", async () => {
        const bookId = await uploadBook(tokenB);
        await saveProgress(tokenB, bookId, 50);

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.continueReading).toEqual([]);
    });

    it("recommends unstarted books, newest first, excluding books with progress", async () => {
        const startedId = await uploadBook(tokenA, "Started Book");
        await saveProgress(tokenA, startedId, 5);
        await uploadBook(tokenA, "Unstarted Book 1");
        await uploadBook(tokenA, "Unstarted Book 2");

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.recommendations).toHaveLength(2);
        expect(json.data.recommendations[0].title).toBe("Unstarted Book 2");
        expect(json.data.recommendations.map((b: { title: string }) => b.title)).not.toContain("Started Book");
    });

    it("does not recommend another user's books", async () => {
        await uploadBook(tokenB, "Bob's Book");

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.recommendations).toEqual([]);
    });

    it("caps recommendations at 5", async () => {
        for (let i = 0; i < 6; i++) {
            await uploadBook(tokenA, `Book ${i}`);
        }

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.recommendations).toHaveLength(5);
    });

    // "Borrowed reading" (follow-up to #300): a SHARED book someone else
    // owns shows up in the caller's own continue-reading list once the
    // caller has progress on it, tagged with the owner's username so the
    // frontend can render a "Geliehen von" badge instead of the favorite star.
    it("includes a borrowed SHARED book in continue-reading, tagged with the owner's username", async () => {
        const ownBookId = await uploadBook(tokenA, "Alice's Own Book");
        await saveProgress(tokenA, ownBookId, 20);

        const sharedBookId = await uploadBook(tokenB, "Bob's Shared Book");
        await app.request(
            `/api/books/${sharedBookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );
        await saveProgress(tokenA, sharedBookId, 40);

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.continueReading).toHaveLength(2);
        const own = json.data.continueReading.find((item: { book: { title: string } }) => item.book.title === "Alice's Own Book");
        const borrowed = json.data.continueReading.find((item: { book: { title: string } }) => item.book.title === "Bob's Shared Book");
        expect(own).toMatchObject({ ownerUsername: null });
        expect(borrowed).toMatchObject({ ownerUsername: "bob" });
    });

    it("drops a borrowed book from continue-reading once the owner flips it back to PRIVATE", async () => {
        const sharedBookId = await uploadBook(tokenB, "Bob's Shared Book");
        await app.request(
            `/api/books/${sharedBookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );
        await saveProgress(tokenA, sharedBookId, 40);

        await app.request(
            `/api/books/${sharedBookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PRIVATE" }) },
            env
        );

        const res = await app.request("/api/dashboard", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);
        expect(json.data.continueReading).toEqual([]);
    });
});
