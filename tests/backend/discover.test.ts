// Discovery Phase 4 (issue #310) -- cross-user public book browsing (sort)
// and username search.

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

async function uploadBook(token: string, title: string, visibility: "PUBLIC" | "PRIVATE" = "PUBLIC"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const uploadRes = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    const bookId = (await readJson(uploadRes)).data.id;
    if (visibility === "PUBLIC") {
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );
    }
    return bookId;
}

async function rate(token: string, bookId: number, rating: number) {
    await app.request(
        `/api/books/${bookId}/rating`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating }) },
        env
    );
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("GET /api/discover/books", () => {
    it("requires no auth and excludes PRIVATE books", async () => {
        await uploadBook(tokenA, "Public One", "PUBLIC");
        await uploadBook(tokenA, "Private One", "PRIVATE");

        const res = await app.request("/api/discover/books", {}, env);
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.items).toHaveLength(1);
        expect(json.data.items[0].title).toBe("Public One");
    });

    it("includes public books from every user, with the owner's username", async () => {
        await uploadBook(tokenA, "Alice's Book", "PUBLIC");
        await uploadBook(tokenB, "Bob's Book", "PUBLIC");

        const res = await app.request("/api/discover/books", {}, env);
        const json = await readJson(res);
        expect(json.data.items).toHaveLength(2);
        expect(json.data.items.map((b: { ownerUsername: string }) => b.ownerUsername).sort()).toEqual(["alice", "bob"]);
    });

    it("sorts by newest by default", async () => {
        const first = await uploadBook(tokenA, "First");
        const second = await uploadBook(tokenA, "Second");

        const res = await app.request("/api/discover/books", {}, env);
        const json = await readJson(res);
        expect(json.data.items.map((b: { id: number }) => b.id)).toEqual([second, first]);
    });

    it("sorts by highest-rated when sort=rating, unrated books last", async () => {
        const lowRated = await uploadBook(tokenA, "Low");
        const highRated = await uploadBook(tokenA, "High");
        const unrated = await uploadBook(tokenA, "Unrated");
        await rate(tokenB, lowRated, 2);
        await rate(tokenB, highRated, 5);

        const res = await app.request("/api/discover/books?sort=rating", {}, env);
        const json = await readJson(res);
        expect(json.data.items.map((b: { id: number }) => b.id)).toEqual([highRated, lowRated, unrated]);
    });

    it("reflects the caller's own myRating when authenticated", async () => {
        const bookId = await uploadBook(tokenA, "Rate Me");
        await rate(tokenB, bookId, 4);

        const asRater = await app.request("/api/discover/books", { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect((await readJson(asRater)).data.items[0].myRating).toBe(4);

        const anonymous = await app.request("/api/discover/books", {}, env);
        expect((await readJson(anonymous)).data.items[0].myRating).toBeNull();
    });

    it("paginates", async () => {
        for (let i = 0; i < 5; i++) await uploadBook(tokenA, `Book ${i}`);

        const res = await app.request("/api/discover/books?pageSize=2&page=2", {}, env);
        const json = await readJson(res);
        expect(json.data.items).toHaveLength(2);
        expect(json.data.total).toBe(5);
        expect(json.data.page).toBe(2);
    });
});

describe("GET /api/discover/users", () => {
    it("requires no auth", async () => {
        const res = await app.request("/api/discover/users?search=ali", {}, env);
        expect(res.status).toBe(200);
    });

    it("returns an empty result for a blank search rather than listing every user", async () => {
        const res = await app.request("/api/discover/users", {}, env);
        const json = await readJson(res);
        expect(json.data.items).toEqual([]);
        expect(json.data.total).toBe(0);
    });

    it("finds a user by a partial, case-sensitive-agnostic-in-SQLite substring", async () => {
        const res = await app.request("/api/discover/users?search=ali", {}, env);
        const json = await readJson(res);
        expect(json.data.items.map((u: { username: string }) => u.username)).toEqual(["alice"]);
    });

    it("returns no results for a non-matching search", async () => {
        const res = await app.request("/api/discover/users?search=zzz-nobody", {}, env);
        const json = await readJson(res);
        expect(json.data.items).toEqual([]);
    });
});
