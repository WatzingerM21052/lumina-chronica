// Text round-trips unchanged in every script (umlauts, emoji, CJK, RTL),
// and a body that is not valid UTF-8 is rejected instead of being stored
// with U+FFFD replacement characters (middleware/utf8.ts).

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let token: string;
let bookId: number;

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    const reg = await app.request(
        "/api/auth/register",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "alice", email: "alice@example.com", password: "correct horse" }) },
        env
    );
    token = (await readJson(reg)).data.token;

    const form = new FormData();
    form.set("title", "Bücher über Ärger");
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const upload = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    bookId = (await readJson(upload)).data.id;
});

const everyScript = "Umlaute äöü ÄÖÜ ß – Emoji 📚✨👩‍👩‍👧 – 中文 – العربية – Ελληνικά – «guillemets» „so“";

describe("text encoding", () => {
    it("keeps a comment in any script exactly as sent", async () => {
        const post = await app.request(
            `/api/books/${bookId}/comments`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ content: everyScript }) },
            env
        );
        expect(post.ok).toBe(true);

        const list = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${token}` } }, env);
        const comments = (await readJson(list)).data;
        expect(comments[0].content).toBe(everyScript);
    });

    it("keeps umlauts in multipart text fields", async () => {
        const book = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(book)).data.title).toBe("Bücher über Ärger");
    });

    it("rejects a JSON body that is not valid UTF-8", async () => {
        // "ä" in Latin-1 (0xE4) inside otherwise ASCII JSON -- what a
        // Windows console piping cp1252 sends.
        const latin1 = new Uint8Array([...new TextEncoder().encode('{"content":"K'), 0xe4, ...new TextEncoder().encode('se"}')]);
        const res = await app.request(
            `/api/books/${bookId}/comments`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: latin1 },
            env
        );

        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_ENCODING");
        const list = await app.request(`/api/books/${bookId}/comments`, { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(list)).data).toHaveLength(0);
    });

    it("still lets the route read a valid JSON body after the check", async () => {
        const res = await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` }, body: JSON.stringify({ description: "Überall Öl" }) },
            env
        );
        expect(res.status).toBe(200);
        expect((await readJson(res)).data.description).toBe("Überall Öl");
    });
});
