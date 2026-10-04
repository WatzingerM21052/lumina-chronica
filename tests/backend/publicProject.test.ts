// Public project pages and view counts (user decisions 2026-10-04): a
// PUBLIC project's world is readable by anyone -- characters, places,
// timeline, lore, public linked books -- while files and the map stay
// private. Opening a book or project counts as a view unless the owner
// looks; Discover sorts by it, both ways.

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
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password: "correct horse" }) },
        env
    );
    return (await readJson(res)).data.token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const json = (token: string) => ({ ...auth(token), "Content-Type": "application/json" });

async function createProject(token: string, title: string, visibility: "PUBLIC" | "PRIVATE" = "PUBLIC"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    const id = (await readJson(await app.request("/api/projects", { method: "POST", headers: auth(token), body: form }, env))).data.id;
    if (visibility === "PUBLIC") {
        await app.request(`/api/projects/${id}`, { method: "PUT", headers: json(token), body: JSON.stringify({ visibility: "PUBLIC" }) }, env);
    }
    return id;
}

async function uploadBook(token: string, title: string, visibility: "PUBLIC" | "PRIVATE"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const id = (await readJson(await app.request("/api/books/upload", { method: "POST", headers: auth(token), body: form }, env))).data.id;
    if (visibility === "PUBLIC") {
        await app.request(`/api/books/${id}`, { method: "PUT", headers: json(token), body: JSON.stringify({ visibility: "PUBLIC" }) }, env);
    }
    return id;
}

async function addCharacter(token: string, projectId: number, name: string, withImage = false): Promise<number> {
    const form = new FormData();
    form.set("name", name);
    form.set("description", `${name} description`);
    if (withImage) form.set("image", new File(["png"], "p.png", { type: "image/png" }));
    return (await readJson(await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: auth(token), body: form }, env))).data.id;
}

async function viewCount(table: "books" | "projects", id: number): Promise<number> {
    return (await env.DB.prepare(`SELECT view_count FROM ${table} WHERE id = ?`).bind(id).first<{ view_count: number }>())!.view_count;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("GET /api/projects/:id/public", () => {
    it("shows a public project's world to anyone, without its files", async () => {
        const projectId = await createProject(tokenA, "Nimrud");
        const aldous = await addCharacter(tokenA, projectId, "Aldous", true);
        const ilvane = await addCharacter(tokenA, projectId, "Ilvane");
        await app.request(`/api/projects/${projectId}/relationships`, { method: "POST", headers: json(tokenA), body: JSON.stringify({ characterAId: aldous, characterBId: ilvane, relationshipType: "Schüler von" }) }, env);
        const place = new FormData();
        place.set("name", "Hafen");
        await app.request(`/api/projects/${projectId}/locations`, { method: "POST", headers: auth(tokenA), body: place }, env);
        await app.request(`/api/projects/${projectId}/timeline`, { method: "POST", headers: json(tokenA), body: JSON.stringify({ title: "Gründung", date: "Jahr 0" }) }, env);
        await app.request(`/api/projects/${projectId}/lore`, { method: "POST", headers: json(tokenA), body: JSON.stringify({ title: "Kanäle", content: "# Wasser" }) }, env);
        const file = new FormData();
        file.set("category", "DOCUMENT");
        file.set("file", new File(["secret notes"], "notes.md", { type: "text/markdown" }));
        await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: auth(tokenA), body: file }, env);
        const publicBook = await uploadBook(tokenA, "Public Book", "PUBLIC");
        const privateBook = await uploadBook(tokenA, "Private Book", "PRIVATE");
        await app.request(`/api/projects/${projectId}/books/${publicBook}`, { method: "POST", headers: auth(tokenA) }, env);
        await app.request(`/api/projects/${projectId}/books/${privateBook}`, { method: "POST", headers: auth(tokenA) }, env);

        const res = await app.request(`/api/projects/${projectId}/public`, {}, env);
        expect(res.status).toBe(200);
        const data = (await readJson(res)).data;
        expect(data.title).toBe("Nimrud");
        expect(data.ownerUsername).toBe("alice");
        expect(data.characters.map((c: { name: string }) => c.name)).toEqual(["Aldous", "Ilvane"]);
        expect(data.characters[0].imageUrl).toBe(`/api/projects/${projectId}/characters/${aldous}/image`);
        expect(data.relationships).toEqual([{ characterAId: aldous, characterBId: ilvane, relationshipType: "Schüler von", description: null }]);
        expect(data.locations.map((l: { name: string }) => l.name)).toEqual(["Hafen"]);
        expect(data.timeline.map((t: { title: string }) => t.title)).toEqual(["Gründung"]);
        expect(data.lore[0].content).toBe("# Wasser");
        // Only the public book; nothing about files or the map at all.
        expect(data.books.map((b: { title: string }) => b.title)).toEqual(["Public Book"]);
        expect(data.files).toBeUndefined();
        expect(data.mapUrl).toBeUndefined();
    });

    it("answers 404 for a private project, even to a signed-in stranger", async () => {
        const projectId = await createProject(tokenA, "Secret", "PRIVATE");
        expect((await app.request(`/api/projects/${projectId}/public`, {}, env)).status).toBe(404);
        expect((await app.request(`/api/projects/${projectId}/public`, { headers: auth(tokenB) }, env)).status).toBe(404);
    });

    it("counts a view by anyone but the owner", async () => {
        const projectId = await createProject(tokenA, "Nimrud");
        await app.request(`/api/projects/${projectId}/public`, { headers: auth(tokenA) }, env);
        expect(await viewCount("projects", projectId)).toBe(0);
        await app.request(`/api/projects/${projectId}/public`, { headers: auth(tokenB) }, env);
        await app.request(`/api/projects/${projectId}/public`, {}, env);
        expect(await viewCount("projects", projectId)).toBe(2);
    });
});

describe("character pictures of a project", () => {
    it("are visible to anyone while the project is public, to the owner only otherwise", async () => {
        const projectId = await createProject(tokenA, "Nimrud");
        const characterId = await addCharacter(tokenA, projectId, "Aldous", true);
        const url = `/api/projects/${projectId}/characters/${characterId}/image`;

        expect((await app.request(url, {}, env)).status).toBe(200);

        await app.request(`/api/projects/${projectId}`, { method: "PUT", headers: json(tokenA), body: JSON.stringify({ visibility: "PRIVATE" }) }, env);
        expect((await app.request(url, {}, env)).status).toBe(404);
        expect((await app.request(url, { headers: auth(tokenB) }, env)).status).toBe(404);
        expect((await app.request(url, { headers: auth(tokenA) }, env)).status).toBe(200);
    });
});

describe("book views", () => {
    it("count when someone else opens a book, not when the owner does", async () => {
        const bookId = await uploadBook(tokenA, "Dune", "PUBLIC");
        await app.request(`/api/books/${bookId}`, { headers: auth(tokenA) }, env);
        expect(await viewCount("books", bookId)).toBe(0);
        await app.request(`/api/books/${bookId}`, { headers: auth(tokenB) }, env);
        expect(await viewCount("books", bookId)).toBe(1);
    });
});

describe("Discover sorting", () => {
    const titles = (res: { items: { title: string }[] }) => res.items.map((i) => i.title);

    it("sorts books by age, rating (unrated last both ways), views and title, either way", async () => {
        const a = await uploadBook(tokenA, "Alpha", "PUBLIC");
        const b = await uploadBook(tokenA, "Beta", "PUBLIC");
        const c = await uploadBook(tokenA, "Gamma", "PUBLIC");
        await app.request(`/api/books/${a}/rating`, { method: "PUT", headers: json(tokenB), body: JSON.stringify({ rating: 5 }) }, env);
        await app.request(`/api/books/${b}/rating`, { method: "PUT", headers: json(tokenB), body: JSON.stringify({ rating: 2 }) }, env);
        for (let i = 0; i < 3; i++) await app.request(`/api/books/${c}`, { headers: auth(tokenB) }, env);
        await app.request(`/api/books/${b}`, { headers: auth(tokenB) }, env);

        const get = async (q: string) => (await readJson(await app.request(`/api/discover/books?${q}`, {}, env))).data;
        expect(titles(await get("sort=newest&order=desc"))).toEqual(["Gamma", "Beta", "Alpha"]);
        expect(titles(await get("sort=newest&order=asc"))).toEqual(["Alpha", "Beta", "Gamma"]);
        expect(titles(await get("sort=rating&order=desc"))).toEqual(["Alpha", "Beta", "Gamma"]);
        expect(titles(await get("sort=rating&order=asc"))).toEqual(["Beta", "Alpha", "Gamma"]);
        expect(titles(await get("sort=views&order=desc"))).toEqual(["Gamma", "Beta", "Alpha"]);
        expect(titles(await get("sort=views&order=asc"))).toEqual(["Alpha", "Beta", "Gamma"]);
        expect(titles(await get("sort=title&order=asc"))).toEqual(["Alpha", "Beta", "Gamma"]);
        expect((await get("sort=views")).items[0].viewCount).toBe(3);
    });

    it("sorts projects by age, views and title, ignoring a rating sort", async () => {
        const first = await createProject(tokenA, "First");
        await createProject(tokenA, "Second");
        await app.request(`/api/projects/${first}/public`, { headers: auth(tokenB) }, env);

        const get = async (q: string) => (await readJson(await app.request(`/api/discover/projects?${q}`, {}, env))).data;
        expect(titles(await get("sort=newest&order=asc"))).toEqual(["First", "Second"]);
        expect(titles(await get("sort=views&order=desc"))).toEqual(["First", "Second"]);
        expect(titles(await get("sort=title&order=desc"))).toEqual(["Second", "First"]);
        expect(titles(await get("sort=rating"))).toEqual(["Second", "First"]);
    });
});
