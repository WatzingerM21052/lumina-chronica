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

    it("lists only readers who share something for a blank search, not every account", async () => {
        const empty = await readJson(await app.request("/api/discover/users", {}, env));
        expect(empty.data.items).toEqual([]);
        expect(empty.data.total).toBe(0);

        await uploadBook(tokenA, "Alice Shares", "PUBLIC");
        await uploadBook(tokenB, "Bob Keeps", "PRIVATE");
        const json = await readJson(await app.request("/api/discover/users", {}, env));
        expect(json.data.items.map((u: { username: string }) => u.username)).toEqual(["alice"]);
        expect(json.data.total).toBe(1);
    });

    it("counts a public project as sharing something", async () => {
        await createProject(tokenB, "Bob's World", null, "PUBLIC");
        const json = await readJson(await app.request("/api/discover/users", {}, env));
        expect(json.data.items.map((u: { username: string }) => u.username)).toEqual(["bob"]);
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

async function createProject(token: string, title: string, description: string | null, visibility: "PUBLIC" | "PRIVATE" = "PUBLIC"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    if (description) form.set("description", description);
    const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    const id = (await readJson(res)).data.id;
    if (visibility === "PUBLIC") {
        await app.request(
            `/api/projects/${id}`,
            { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title, description, visibility: "PUBLIC" }) },
            env
        );
    }
    return id;
}

describe("GET /api/discover/books?search=", () => {
    it("narrows public books by title, author or genre, case-insensitively", async () => {
        await uploadBook(tokenA, "Der Drachenhort");
        await uploadBook(tokenB, "Stille Wasser");
        await uploadBook(tokenA, "Drachen privat", "PRIVATE");

        const res = await app.request("/api/discover/books?search=drachen", {}, env);
        const json = await readJson(res);

        expect(json.data.total).toBe(1);
        expect(json.data.items.map((b: { title: string }) => b.title)).toEqual(["Der Drachenhort"]);
    });

    it("treats % and _ in the search as plain characters", async () => {
        await uploadBook(tokenA, "100% Fantasy");
        await uploadBook(tokenA, "1000 Seiten");

        const res = await app.request(`/api/discover/books?search=${encodeURIComponent("100%")}`, {}, env);
        const json = await readJson(res);

        expect(json.data.items.map((b: { title: string }) => b.title)).toEqual(["100% Fantasy"]);
    });
});

describe("GET /api/discover/projects", () => {
    it("lists only public projects of every user, newest first, with the owner", async () => {
        await createProject(tokenA, "Die Gärten", "Terrassen und Kanäle");
        await createProject(tokenB, "Sternenhafen", null);
        await createProject(tokenA, "Geheimes Projekt", null, "PRIVATE");

        const res = await app.request("/api/discover/projects", {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.total).toBe(2);
        expect(json.data.items.map((p: { title: string; ownerUsername: string }) => [p.title, p.ownerUsername])).toEqual([
            ["Sternenhafen", "bob"],
            ["Die Gärten", "alice"],
        ]);
    });

    it("searches title and description", async () => {
        await createProject(tokenA, "Die Gärten", "Terrassen und Kanäle");
        await createProject(tokenB, "Sternenhafen", "Ein Hafen am Meer");

        const byDescription = await readJson(await app.request("/api/discover/projects?search=kanäle", {}, env));
        const byTitle = await readJson(await app.request("/api/discover/projects?search=STERN", {}, env));

        expect(byDescription.data.items.map((p: { title: string }) => p.title)).toEqual(["Die Gärten"]);
        expect(byTitle.data.items.map((p: { title: string }) => p.title)).toEqual(["Sternenhafen"]);
    });

    it("pages", async () => {
        for (let i = 0; i < 3; i++) await createProject(tokenA, `Projekt ${i}`, null);

        const json = await readJson(await app.request("/api/discover/projects?page=2&pageSize=2", {}, env));

        expect(json.data.total).toBe(3);
        expect(json.data.items).toHaveLength(1);
    });
});
