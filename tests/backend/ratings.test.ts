// Community Phase 3 (issue #307) -- ratings on PUBLIC books, no self-rating,
// upsert semantics, and the public profile's averageRating/ratingCount/myRating.

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let tokenA: string;
let tokenB: string;
let tokenC: string;

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

async function uploadPublicBook(token: string): Promise<number> {
    const form = new FormData();
    form.set("title", "Ratable Book");
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const uploadRes = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    const bookId = (await readJson(uploadRes)).data.id;
    await app.request(
        `/api/books/${bookId}`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
        env
    );
    return bookId;
}

async function getPublicBook(username: string, bookId: number, token?: string) {
    const res = await app.request(`/api/users/${username}/public`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}, env);
    const json = await readJson(res);
    return json.data.books.find((b: { id: number }) => b.id === bookId);
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
    tokenC = await registerAndLogin("carol", "carol@example.com");
});

describe("PUT/DELETE /api/books/:id/rating", () => {
    it("requires authentication", async () => {
        const bookId = await uploadPublicBook(tokenA);
        const res = await app.request(`/api/books/${bookId}/rating`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) }, env);
        expect(res.status).toBe(401);
    });

    it("rejects rating your own book", async () => {
        const bookId = await uploadPublicBook(tokenA);
        const res = await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) },
            env
        );
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects rating a PRIVATE book", async () => {
        const form = new FormData();
        form.set("title", "Private Book");
        form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
        const uploadRes = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const bookId = (await readJson(uploadRes)).data.id;

        const res = await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown book", async () => {
        const res = await app.request(
            "/api/books/999999/rating",
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) },
            env
        );
        expect(res.status).toBe(404);
    });

    it.each([0, 6, 3.5, -1])("rejects an out-of-range rating (%s)", async (rating) => {
        const bookId = await uploadPublicBook(tokenA);
        const res = await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("rates a public book and reflects average/count/myRating correctly per viewer", async () => {
        const bookId = await uploadPublicBook(tokenA);

        const rateRes = await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 4 }) },
            env
        );
        expect(rateRes.status).toBe(204);

        const asRater = await getPublicBook("alice", bookId, tokenB);
        expect(asRater).toMatchObject({ averageRating: 4, ratingCount: 1, myRating: 4 });

        const asStranger = await getPublicBook("alice", bookId, tokenC);
        expect(asStranger).toMatchObject({ averageRating: 4, ratingCount: 1, myRating: null });

        const anonymous = await getPublicBook("alice", bookId);
        expect(anonymous).toMatchObject({ averageRating: 4, ratingCount: 1, myRating: null });
    });

    it("upserts on re-rating instead of creating a duplicate", async () => {
        const bookId = await uploadPublicBook(tokenA);

        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 2 }) },
            env
        );
        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) },
            env
        );

        const book = await getPublicBook("alice", bookId);
        expect(book).toMatchObject({ averageRating: 5, ratingCount: 1 });
    });

    it("averages multiple raters correctly", async () => {
        const bookId = await uploadPublicBook(tokenA);

        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 2 }) },
            env
        );
        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenC}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 4 }) },
            env
        );

        const book = await getPublicBook("alice", bookId);
        expect(book).toMatchObject({ averageRating: 3, ratingCount: 2 });
    });

    it("unrates, and unrating a non-rating is a harmless no-op", async () => {
        const bookId = await uploadPublicBook(tokenA);
        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 3 }) },
            env
        );

        const res = await app.request(`/api/books/${bookId}/rating`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(204);

        const book = await getPublicBook("alice", bookId);
        expect(book).toMatchObject({ averageRating: null, ratingCount: 0 });

        const res2 = await app.request(`/api/books/${bookId}/rating`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res2.status).toBe(204);
    });

    it("a book with no ratings has averageRating null and ratingCount 0", async () => {
        const bookId = await uploadPublicBook(tokenA);
        const book = await getPublicBook("alice", bookId);
        expect(book).toMatchObject({ averageRating: null, ratingCount: 0, myRating: null });
    });
});
