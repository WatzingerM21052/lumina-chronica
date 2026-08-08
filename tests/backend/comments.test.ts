// v3.3 (Community follow-up), Phase 2 (issue #325) -- comments on books
// and projects. The two target types deliberately use different access
// rules: a book is commentable by anyone who can actually read it (owner,
// PUBLIC-logged-in, or SHARED-listed -- the same rule as reading the book,
// not ratings' PUBLIC-only rule); a project is commentable only if PUBLIC
// (projects have no share-list equivalent to books' book_shares).

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
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password: "correct horse" }) },
        env
    );
    return (await readJson(res)).data.token;
}

async function uploadBook(token: string): Promise<number> {
    const form = new FormData();
    form.set("title", "Commentable Book");
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function setBookVisibility(token: string, bookId: number, visibility: string) {
    return app.request(
        `/api/books/${bookId}`,
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ visibility }) },
        env
    );
}

async function shareBook(ownerToken: string, bookId: number, username: string) {
    return app.request(
        `/api/books/${bookId}/shares`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ username }) },
        env
    );
}

async function createProject(token: string): Promise<number> {
    const form = new FormData();
    form.set("title", "Commentable World");
    const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function setProjectVisibility(token: string, projectId: number, visibility: string) {
    return app.request(
        `/api/projects/${projectId}`,
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ visibility }) },
        env
    );
}

async function postComment(token: string, path: string, content: string) {
    return app.request(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) }, env);
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
    tokenC = await registerAndLogin("carol", "carol@example.com");
});

describe("POST/GET /api/books/:id/comments", () => {
    it("requires authentication", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await app.request(`/api/books/${bookId}/comments`, {}, env);
        expect(res.status).toBe(401);
    });

    it("404s for a PRIVATE book, even for the owner's comment attempt target being findable via other routes", async () => {
        const bookId = await uploadBook(tokenA);
        // PRIVATE books ARE commentable by the owner (isBookAccessibleTo's
        // owner_id branch) -- this asserts a non-owner gets 404, not that
        // the owner does.
        const res = await postComment(tokenB, `/api/books/${bookId}/comments`, "Hello");
        expect(res.status).toBe(404);
    });

    it("lets the owner comment on their own PRIVATE book (self-commenting is allowed, unlike rating/following)", async () => {
        const bookId = await uploadBook(tokenA);
        const res = await postComment(tokenA, `/api/books/${bookId}/comments`, "Note to self");
        expect(res.status).toBe(204);

        const listRes = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(listRes);
        expect(json.data).toHaveLength(1);
        expect(json.data[0]).toMatchObject({ username: "alice", content: "Note to self" });
    });

    it("lets any logged-in non-owner comment on a PUBLIC book", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");

        const res = await postComment(tokenB, `/api/books/${bookId}/comments`, "Great read!");
        expect(res.status).toBe(204);
    });

    it("lets a SHARED-listed user comment, but 404s a non-listed user (the canRead rule, not ratings' PUBLIC-only rule)", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "SHARED");
        await shareBook(tokenA, bookId, "bob");

        const listedRes = await postComment(tokenB, `/api/books/${bookId}/comments`, "Thanks for sharing");
        expect(listedRes.status).toBe(204);

        const nonListedRes = await postComment(tokenC, `/api/books/${bookId}/comments`, "Can I read this too?");
        expect(nonListedRes.status).toBe(404);
    });

    it("rejects empty content", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        const res = await postComment(tokenB, `/api/books/${bookId}/comments`, "   ");
        expect(res.status).toBe(400);
    });

    it("lists comments newest first", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await postComment(tokenA, `/api/books/${bookId}/comments`, "First");
        await postComment(tokenB, `/api/books/${bookId}/comments`, "Second");

        const res = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);
        expect(json.data.map((c: { content: string }) => c.content)).toEqual(["Second", "First"]);
    });

    it("GET 404s for a non-listed viewer on a SHARED book -- read access matches write access", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "SHARED");
        await shareBook(tokenA, bookId, "bob");

        const res = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${tokenC}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("POST/GET /api/projects/:id/comments", () => {
    it("404s for a non-owner on a PRIVATE project (PUBLIC-only rule, stricter than books)", async () => {
        const projectId = await createProject(tokenA);
        const res = await postComment(tokenB, `/api/projects/${projectId}/comments`, "Hello");
        expect(res.status).toBe(404);
    });

    it("lets any logged-in non-owner comment on a PUBLIC project", async () => {
        const projectId = await createProject(tokenA);
        await setProjectVisibility(tokenA, projectId, "PUBLIC");

        const res = await postComment(tokenB, `/api/projects/${projectId}/comments`, "Love this world!");
        expect(res.status).toBe(204);

        const listRes = await app.request(`/api/projects/${projectId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(1);
    });

    it("lets the owner comment on their own PRIVATE project", async () => {
        const projectId = await createProject(tokenA);
        const res = await postComment(tokenA, `/api/projects/${projectId}/comments`, "Planning notes");
        expect(res.status).toBe(204);
    });
});

describe("DELETE /api/comments/:id", () => {
    it("lets the comment's author delete it", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await postComment(tokenB, `/api/books/${bookId}/comments`, "Delete me");
        const listRes = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const commentId = (await readJson(listRes)).data[0].id;

        const res = await app.request(`/api/comments/${commentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(204);
    });

    it("lets the book's owner delete someone else's comment (moderation)", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await postComment(tokenB, `/api/books/${bookId}/comments`, "Spam");
        const listRes = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const commentId = (await readJson(listRes)).data[0].id;

        const res = await app.request(`/api/comments/${commentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);
    });

    it("403s a third party who is neither the author nor the target owner", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await postComment(tokenB, `/api/books/${bookId}/comments`, "Mine");
        const listRes = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const commentId = (await readJson(listRes)).data[0].id;

        const res = await app.request(`/api/comments/${commentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenC}` } }, env);
        expect(res.status).toBe(403);
    });

    it("404s deleting a non-existent comment", async () => {
        const res = await app.request(`/api/comments/999999`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(404);
    });

    it("also authorizes a project owner deleting someone else's comment on their project", async () => {
        const projectId = await createProject(tokenA);
        await setProjectVisibility(tokenA, projectId, "PUBLIC");
        await postComment(tokenB, `/api/projects/${projectId}/comments`, "Spam on my world");
        const listRes = await app.request(`/api/projects/${projectId}/comments`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const commentId = (await readJson(listRes)).data[0].id;

        const res = await app.request(`/api/comments/${commentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);
    });
});

describe("deleteBook/deleteProject clean up comments", () => {
    it("deleting a book with comments succeeds and removes them", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await postComment(tokenB, `/api/books/${bookId}/comments`, "Nice book");

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM comments WHERE target_type = 'BOOK' AND target_id = ?").bind(bookId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });

    it("deleting a project with comments succeeds and removes them", async () => {
        const projectId = await createProject(tokenA);
        await setProjectVisibility(tokenA, projectId, "PUBLIC");
        await postComment(tokenB, `/api/projects/${projectId}/comments`, "Nice world");

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM comments WHERE target_type = 'PROJECT' AND target_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
