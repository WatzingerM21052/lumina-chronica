// Found in the 2026-10-11 bug hunt: search ignored case only for ASCII
// ("KÜSTEN" missed "Küstenmann"), the library search treated % and _ as
// wildcards, "Sterne, sterne" became two tags, and null or a number where a
// name/title belongs answered 500 instead of 400.

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let token: string;

function request(method: string, path: string, body?: unknown) {
    return app.request(
        path,
        { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) },
        env
    );
}

async function upload(title: string, author: string, tags = ""): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    form.set("author", author);
    if (tags) form.set("tags", tags);
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function libraryTitles(search: string): Promise<string[]> {
    const res = await request("GET", `/api/books?search=${encodeURIComponent(search)}`);
    return (await readJson(res)).data.items.map((b: { title: string }) => b.title);
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    const res = await app.request(
        "/api/auth/register",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "reader", email: "reader@example.com", password: "correct horse" }) },
        env
    );
    token = (await readJson(res)).data.token;
});

describe("search folds umlauts and accents", () => {
    it("finds a title or author regardless of the case of non-ASCII letters", async () => {
        await upload("Über den Wolken", "Ole Küstenmann");
        await upload("Café Éclair", "Someone");

        expect(await libraryTitles("über")).toEqual(["Über den Wolken"]);
        expect(await libraryTitles("KÜSTEN")).toEqual(["Über den Wolken"]);
        expect(await libraryTitles("café éclair")).toEqual(["Café Éclair"]);
    });

    it("treats % and _ in the library search as text", async () => {
        await upload("100% Fantasy", "A");
        await upload("1000 Fantasy", "B");

        expect(await libraryTitles("100%")).toEqual(["100% Fantasy"]);
    });

    it("folds the Discover search for books and projects", async () => {
        const bookId = await upload("Über den Wolken", "A");
        await request("PUT", `/api/books/${bookId}`, { visibility: "PUBLIC" });
        const form = new FormData();
        form.set("title", "Welt von Äther");
        const created = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
        const projectId = (await readJson(created)).data.id;
        await request("PUT", `/api/projects/${projectId}`, { visibility: "PUBLIC" });

        const books = await readJson(await app.request("/api/discover/books?search=%C3%BCBER", {}, env));
        const projects = await readJson(await app.request("/api/discover/projects?search=%C3%A4ther", {}, env));

        expect(books.data.items.map((b: { title: string }) => b.title)).toEqual(["Über den Wolken"]);
        expect(projects.data.items.map((p: { title: string }) => p.title)).toEqual(["Welt von Äther"]);
    });
});

describe("tags", () => {
    it("keeps one tag per spelling ignoring case, the first spelling wins", async () => {
        const bookId = await upload("Sterne", "A", "Sterne, Abenteuer, sterne");
        const detail = await readJson(await request("GET", `/api/books/${bookId}`));

        expect(detail.data.tags.sort()).toEqual(["Abenteuer", "Sterne"]);

        await request("PUT", `/api/books/${bookId}`, { tags: ["Mond", "MOND", "mond"] });
        const updated = await readJson(await request("GET", `/api/books/${bookId}`));
        expect(updated.data.tags).toEqual(["Mond"]);
    });
});

describe("wrongly typed names and titles answer 400, not 500", () => {
    it("rejects null, numbers and blanks", async () => {
        const bookId = await upload("Book", "A");
        const form = new FormData();
        form.set("title", "World");
        const project = await readJson(await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env));
        const projectId = project.data.id;
        const characterForm = new FormData();
        characterForm.set("name", "Mira");
        const character = await readJson(
            await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: characterForm }, env)
        );

        const cases: [string, unknown][] = [
            [`/api/books/${bookId}`, { title: null }],
            [`/api/books/${bookId}`, { title: "  " }],
            [`/api/books/${bookId}`, { tags: null }],
            [`/api/books/${bookId}`, { tags: [1, 2] }],
            [`/api/projects/${projectId}`, { title: null }],
            [`/api/projects/${projectId}/characters/${character.data.id}`, { name: null }],
            [`/api/projects/${projectId}/characters/${character.data.id}`, { name: 123 }],
        ];
        for (const [path, body] of cases) {
            const res = await request("PUT", path, body);
            expect(res.status, `${path} ${JSON.stringify(body)}`).toBe(400);
        }
    });
});
