// Every free-text field has an upper bound (utils/textLimits.ts); before,
// only comments and auth fields did.

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { TEXT_LIMITS } from "../../backend/src/utils/textLimits";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let token: string;

const json = (method: string, body: unknown) => ({
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
});

async function uploadBook(fields: Record<string, string> = {}) {
    const form = new FormData();
    form.set("title", "Book");
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    return app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
}

async function createProject(): Promise<number> {
    const form = new FormData();
    form.set("title", "World");
    const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    const reg = await app.request(
        "/api/auth/register",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "alice", email: "alice@example.com", password: "correct horse" }) },
        env
    );
    token = (await readJson(reg)).data.token;
});

describe("text limits", () => {
    it("rejects a book title over the limit on upload and on edit", async () => {
        const tooLong = "x".repeat(TEXT_LIMITS.title + 1);
        const upload = await uploadBook({ title: tooLong });
        expect(upload.status).toBe(400);
        expect((await readJson(upload)).error.message).toContain("title");

        const ok = await uploadBook();
        const bookId = (await readJson(ok)).data.id;
        const edit = await app.request(`/api/books/${bookId}`, json("PUT", { description: "d".repeat(TEXT_LIMITS.description + 1) }), env);
        expect(edit.status).toBe(400);
    });

    it("accepts text exactly at the limit, counted per character in any script", async () => {
        // "ä" and "中" are one UTF-16 unit each, like the browser's maxlength.
        const upload = await uploadBook({ title: "ä".repeat(TEXT_LIMITS.title - 1) + "中" });
        expect(upload.status).toBe(201);
    });

    it("limits the number and length of tags", async () => {
        const upload = await uploadBook();
        const bookId = (await readJson(upload)).data.id;

        const tooMany = await app.request(`/api/books/${bookId}`, json("PUT", { tags: Array.from({ length: TEXT_LIMITS.tagCount + 1 }, (_, i) => `t${i}`) }), env);
        expect(tooMany.status).toBe(400);
        const tooLong = await app.request(`/api/books/${bookId}`, json("PUT", { tags: ["x".repeat(TEXT_LIMITS.tag + 1)] }), env);
        expect(tooLong.status).toBe(400);
    });

    it("limits worldbuilding texts: lore content, character biography, relationship type", async () => {
        const projectId = await createProject();

        const lore = await app.request(`/api/projects/${projectId}/lore`, json("POST", { title: "Lore", content: "x".repeat(TEXT_LIMITS.loreContent + 1) }), env);
        expect(lore.status).toBe(400);

        const form = new FormData();
        form.set("name", "Elarion");
        form.set("biography", "x".repeat(TEXT_LIMITS.longText + 1));
        const character = await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
        expect(character.status).toBe(400);
    });

    it("limits a bookmark note", async () => {
        const upload = await uploadBook();
        const bookId = (await readJson(upload)).data.id;
        const res = await app.request("/api/bookmarks", json("POST", { bookId, percentage: 10, note: "x".repeat(TEXT_LIMITS.bookmarkNote + 1) }), env);
        expect(res.status).toBe(400);
    });
});
