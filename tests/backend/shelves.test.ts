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

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST /api/shelves", () => {
    it("requires authentication", async () => {
        const form = new FormData();
        form.set("name", "My Shelf");
        const res = await app.request("/api/shelves", { method: "POST", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("creates a shelf with a cover and returns it", async () => {
        const form = new FormData();
        form.set("name", "Schulbücher");
        form.set("description", "Für die Schule");
        form.set("cover", new File(["fake image bytes"], "cover.jpg", { type: "image/jpeg" }));

        const res = await app.request("/api/shelves", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.name).toBe("Schulbücher");
        expect(json.data.description).toBe("Für die Schule");
        expect(json.data.bookCount).toBe(0);
        expect(json.data.coverUrl).toBe(`/api/shelves/${json.data.id}/cover`);
    });

    it("rejects a missing name", async () => {
        const form = new FormData();
        const res = await app.request("/api/shelves", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });
});

describe("GET /api/shelves and /:id", () => {
    it("only returns the caller's own shelves", async () => {
        await createShelf(tokenA, "Alice's Shelf");
        await createShelf(tokenB, "Bob's Shelf");

        const res = await app.request("/api/shelves", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data).toHaveLength(1);
        expect(json.data[0].name).toBe("Alice's Shelf");
    });

    it("returns 404 for another user's shelf", async () => {
        const shelfId = await createShelf(tokenA);
        const res = await app.request(`/api/shelves/${shelfId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/shelves/:id", () => {
    it("updates name and description", async () => {
        const shelfId = await createShelf(tokenA, "Original Name");
        const res = await app.request(
            `/api/shelves/${shelfId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ name: "Updated Name" }) },
            env
        );
        expect(res.status).toBe(200);
        expect((await readJson(res)).data.name).toBe("Updated Name");
    });

    it("returns 404 updating/deleting another user's shelf", async () => {
        const shelfId = await createShelf(tokenA);

        const putRes = await app.request(
            `/api/shelves/${shelfId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ name: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);

        const deleteRes = await app.request(`/api/shelves/${shelfId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(deleteRes.status).toBe(404);
    });

    it("deletes a shelf and its shelf_books rows, but leaves the books themselves", async () => {
        const shelfId = await createShelf(tokenA);
        const bookId = await uploadBook(tokenA);
        await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const deleteRes = await app.request(`/api/shelves/${shelfId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const membershipRows = await env.DB.prepare("SELECT COUNT(*) AS total FROM shelf_books WHERE shelf_id = ?").bind(shelfId).first<{ total: number }>();
        expect(membershipRows?.total).toBe(0);

        const bookRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(bookRes.status).toBe(200);
    });

    it("replaces the cover via PUT /:id/cover", async () => {
        const shelfId = await createShelf(tokenA);

        const form = new FormData();
        form.set("cover", new File(["cover bytes"], "cover.png", { type: "image/png" }));
        const res = await app.request(`/api/shelves/${shelfId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).data.coverUrl).toBe(`/api/shelves/${shelfId}/cover`);

        const coverRes = await app.request(`/api/shelves/${shelfId}/cover`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(coverRes.status).toBe(200);
    });

    it("returns 404 replacing another user's shelf cover", async () => {
        const shelfId = await createShelf(tokenA);

        const form = new FormData();
        form.set("cover", new File(["cover bytes"], "cover.jpg", { type: "image/jpeg" }));
        const res = await app.request(`/api/shelves/${shelfId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(res.status).toBe(404);
    });
});

describe("POST/DELETE /api/shelves/:id/books/:bookId", () => {
    it("adds and removes a book, idempotently", async () => {
        const shelfId = await createShelf(tokenA);
        const bookId = await uploadBook(tokenA);

        const addRes = await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(addRes.status).toBe(204);
        // Adding again must not duplicate the membership row.
        await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM shelf_books WHERE shelf_id = ? AND book_id = ?").bind(shelfId, bookId).first<{ total: number }>();
        expect(rows?.total).toBe(1);

        const shelfRes = await app.request(`/api/shelves/${shelfId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(shelfRes)).data.bookCount).toBe(1);

        const removeRes = await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(removeRes.status).toBe(204);

        const shelfAfterRes = await app.request(`/api/shelves/${shelfId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(shelfAfterRes)).data.bookCount).toBe(0);
    });

    it("returns 404 for another user's shelf or another user's book", async () => {
        const shelfId = await createShelf(tokenA);
        const bookId = await uploadBook(tokenA);
        const otherBookId = await uploadBook(tokenB);

        const wrongShelfRes = await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(wrongShelfRes.status).toBe(404);

        const wrongBookRes = await app.request(`/api/shelves/${shelfId}/books/${otherBookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(wrongBookRes.status).toBe(404);
    });
});

describe("GET /api/shelves/:id/books", () => {
    it("lists only the books on that shelf", async () => {
        const shelfId = await createShelf(tokenA);
        const onShelfId = await uploadBook(tokenA, "On Shelf");
        await uploadBook(tokenA, "Not On Shelf");
        await app.request(`/api/shelves/${shelfId}/books/${onShelfId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request(`/api/shelves/${shelfId}/books`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.items).toHaveLength(1);
        expect(json.data.items[0].title).toBe("On Shelf");
    });
});

describe("GET /api/books/:id/shelves", () => {
    it("lists the ids of shelves the book belongs to", async () => {
        const shelfId = await createShelf(tokenA, "Shelf One");
        const otherShelfId = await createShelf(tokenA, "Shelf Two");
        const bookId = await uploadBook(tokenA);
        await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request(`/api/books/${bookId}/shelves`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data).toEqual([shelfId]);
        expect(json.data).not.toContain(otherShelfId);
    });

    it("returns 404 for another user's book", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/books/${bookId}/shelves`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/books/:id with existing shelf membership", () => {
    it("deletes the book even when a shelf_books row references it", async () => {
        const shelfId = await createShelf(tokenA);
        const bookId = await uploadBook(tokenA);
        await app.request(`/api/shelves/${shelfId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM shelf_books WHERE book_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
