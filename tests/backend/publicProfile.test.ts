// Community Phase 1 (issue #300) -- public profile + PUBLIC-visibility cover
// access. Every request here that's meant to simulate a logged-out visitor
// deliberately sends no Authorization header at all, not just an invalid one.

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let tokenA: string;

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

async function uploadBook(token: string, cover = false): Promise<number> {
    const form = new FormData();
    form.set("title", "Public Book");
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    if (cover) form.set("cover", new File(["cover-bytes"], "cover.jpg", { type: "image/jpeg" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function createProject(token: string, cover = false): Promise<number> {
    const form = new FormData();
    form.set("title", "Public World");
    if (cover) form.set("cover", new File(["cover-bytes"], "cover.jpg", { type: "image/jpeg" }));
    const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
});

describe("GET /api/users/:username/public", () => {
    it("returns 404 for an unknown username", async () => {
        const res = await app.request("/api/users/nobody/public", {}, env);
        expect(res.status).toBe(404);
    });

    it("requires no Authorization header at all", async () => {
        const res = await app.request("/api/users/alice/public", {}, env);
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.username).toBe("alice");
        expect(json.data.books).toEqual([]);
        expect(json.data.projects).toEqual([]);
    });

    it("excludes PRIVATE books and projects (the default)", async () => {
        await uploadBook(tokenA);
        await createProject(tokenA);

        const res = await app.request("/api/users/alice/public", {}, env);
        const json = await readJson(res);
        expect(json.data.books).toEqual([]);
        expect(json.data.projects).toEqual([]);
    });

    it("includes a book/project once its visibility is set to PUBLIC", async () => {
        const bookId = await uploadBook(tokenA, true);
        const projectId = await createProject(tokenA, true);

        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );
        await app.request(
            `/api/projects/${projectId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        const res = await app.request("/api/users/alice/public", {}, env);
        const json = await readJson(res);

        expect(json.data.books).toHaveLength(1);
        expect(json.data.books[0]).toMatchObject({ id: bookId, title: "Public Book", coverUrl: `/api/books/${bookId}/cover` });
        expect(json.data.projects).toHaveLength(1);
        expect(json.data.projects[0]).toMatchObject({ id: projectId, title: "Public World", coverUrl: `/api/projects/${projectId}/cover` });

        // book/project detail projections leak nothing owner-only.
        expect(json.data.books[0]).not.toHaveProperty("ownerId");
        expect(json.data.books[0]).not.toHaveProperty("isFavorite");
    });

    // "Borrowed reading" (follow-up to #300): SHARED books show the same
    // cover+metadata teaser as PUBLIC ones on the public profile, tagged
    // with visibility so the frontend can offer a "Lesen" button to a
    // logged-in, non-owner viewer instead of the rating widget.
    it("includes a SHARED book in the public listing, tagged with its visibility", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );

        const res = await app.request("/api/users/alice/public", {}, env);
        const json = await readJson(res);

        expect(json.data.books).toHaveLength(1);
        expect(json.data.books[0]).toMatchObject({ id: bookId, visibility: "SHARED" });
    });

    it("rejects an invalid visibility value", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "NONSENSE" }) },
            env
        );
        expect(res.status).toBe(400);
    });
});

describe("GET /api/books/:id/cover and /api/projects/:id/cover (PUBLIC bypass)", () => {
    it("serves a PUBLIC book's cover with no Authorization header", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        const res = await app.request(`/api/books/${bookId}/cover`, {}, env);
        expect(res.status).toBe(200);
    });

    it("still 404s a PRIVATE book's cover with no Authorization header", async () => {
        const bookId = await uploadBook(tokenA, true);
        const res = await app.request(`/api/books/${bookId}/cover`, {}, env);
        expect(res.status).toBe(404);
    });

    it("serves a PUBLIC project's cover with no Authorization header", async () => {
        const projectId = await createProject(tokenA, true);
        await app.request(
            `/api/projects/${projectId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        const res = await app.request(`/api/projects/${projectId}/cover`, {}, env);
        expect(res.status).toBe(200);
    });

    it("never serves the book FILE without auth, even when the book is PUBLIC", async () => {
        const bookId = await uploadBook(tokenA);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        const res = await app.request(`/api/books/${bookId}/file`, {}, env);
        expect(res.status).toBe(401);
    });

    it("serves a SHARED book's cover with no Authorization header, same teaser as PUBLIC", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );

        const res = await app.request(`/api/books/${bookId}/cover`, {}, env);
        expect(res.status).toBe(200);
    });

    it("never serves a SHARED book's FILE without auth (borrowed reading requires being logged in)", async () => {
        const bookId = await uploadBook(tokenA);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );

        const res = await app.request(`/api/books/${bookId}/file`, {}, env);
        expect(res.status).toBe(401);
    });
});
