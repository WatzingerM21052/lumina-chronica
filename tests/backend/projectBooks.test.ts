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

async function createProject(token: string, title = "Aetherfall"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function createBook(token: string, title = "The Silver Vale"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST /api/projects/:id/books/:bookId", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST" }, env);
        expect(res.status).toBe(401);
    });

    it("links a book the caller owns", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);

        const listRes = await app.request(`/api/projects/${projectId}/books`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(listRes);
        expect(json.data).toHaveLength(1);
        expect(json.data[0].title).toBe("The Silver Vale");
    });

    it("is idempotent when linking the same book twice", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);

        const listRes = await app.request(`/api/projects/${projectId}/books`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(listRes);
        expect(json.data).toHaveLength(1);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });

    it("returns 404 linking a book the caller does not own", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenB);
        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("GET /api/projects/:id/books", () => {
    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(`/api/projects/${projectId}/books`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id/books/:bookId", () => {
    it("unlinks a book without deleting it", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);

        const listRes = await app.request(`/api/projects/${projectId}/books`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(0);

        const bookRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(bookRes.status).toBe(200);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        const res = await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/books/:id with linked projects", () => {
    it("deletes the book's project links when the book is deleted", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM project_books WHERE book_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});

describe("DELETE /api/projects/:id with linked books", () => {
    it("deletes the project's book links without deleting the books when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        const bookId = await createBook(tokenA);
        await app.request(`/api/projects/${projectId}/books/${bookId}`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM project_books WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);

        const bookRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(bookRes.status).toBe(200);
    });
});
