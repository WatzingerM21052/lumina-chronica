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

function makeEpubFile(content = "epub-bytes"): File {
    return new File([content], "book.epub", { type: "application/epub+zip" });
}

function uploadForm(fields: Record<string, string> = {}, file: File | null = makeEpubFile()): FormData {
    const form = new FormData();
    form.set("title", fields.title ?? "Test Book");
    for (const [key, value] of Object.entries(fields)) {
        if (key === "title") continue;
        form.set(key, value);
    }
    if (file) form.set("file", file);
    return form;
}

async function uploadBook(token: string, fields: Record<string, string> = {}, file: File | null = makeEpubFile()) {
    return app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: uploadForm(fields, file) }, env);
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST /api/books/upload", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/books/upload", { method: "POST", body: uploadForm() }, env);
        expect(res.status).toBe(401);
    });

    it("uploads a book with metadata and tags, returning its detail", async () => {
        const res = await uploadBook(tokenA, { author: "Jane Doe", genre: "fantasy", tags: "Dragons, Adventure" });
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.title).toBe("Test Book");
        expect(json.data.author).toBe("Jane Doe");
        expect(json.data.file).toEqual({ format: "EPUB", size: expect.any(Number) });
        expect(json.data.tags.sort()).toEqual(["Adventure", "Dragons"]);
        expect(json.data.coverUrl).toBeNull();
    });

    it("rejects a missing title", async () => {
        const res = await uploadBook(tokenA, { title: "" });
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an unsupported file extension", async () => {
        const file = new File(["x"], "book.exe", { type: "application/octet-stream" });
        const res = await uploadBook(tokenA, {}, file);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a file whose content type genuinely mismatches its extension", async () => {
        const file = new File(["not an epub"], "book.epub", { type: "text/plain" });
        const res = await uploadBook(tokenA, {}, file);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("accepts a file with a generic/unknown content type (no OS MIME association)", async () => {
        // Observed live: Chrome on Windows without an ebook reader installed
        // reports .epub files as application/octet-stream, not
        // application/epub+zip -- must not be treated as a mismatch.
        const file = new File(["fake epub bytes"], "book.epub", { type: "application/octet-stream" });
        const res = await uploadBook(tokenA, {}, file);
        expect(res.status).toBe(201);
    });

    it("rejects an oversized file", async () => {
        const big = new File([new Uint8Array(51 * 1024 * 1024)], "book.epub", { type: "application/epub+zip" });
        const res = await uploadBook(tokenA, {}, big);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });
});

describe("GET /api/books", () => {
    it("only returns the caller's own books", async () => {
        await uploadBook(tokenA, { title: "Alice's Book" });
        await uploadBook(tokenB, { title: "Bob's Book" });

        const res = await app.request("/api/books", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.items).toHaveLength(1);
        expect(json.data.items[0].title).toBe("Alice's Book");
    });

    it("filters by genre and search, and paginates", async () => {
        await uploadBook(tokenA, { title: "Dragon Tales", genre: "fantasy" });
        await uploadBook(tokenA, { title: "Space Odyssey", genre: "scifi" });
        await uploadBook(tokenA, { title: "Dragon Riders", genre: "fantasy" });

        const genreRes = await app.request("/api/books?genre=fantasy", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(genreRes)).data.items).toHaveLength(2);

        const searchRes = await app.request("/api/books?search=Odyssey", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const searchJson = await readJson(searchRes);
        expect(searchJson.data.items).toHaveLength(1);
        expect(searchJson.data.items[0].title).toBe("Space Odyssey");

        const pageRes = await app.request("/api/books?pageSize=2&page=1", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const pageJson = await readJson(pageRes);
        expect(pageJson.data.items).toHaveLength(2);
        expect(pageJson.data.total).toBe(3);
    });

    it("filters by tag", async () => {
        await uploadBook(tokenA, { title: "Dragon Tales", tags: "Fantasy, Dragons" });
        await uploadBook(tokenA, { title: "Space Odyssey", tags: "Science Fiction" });
        await uploadBook(tokenA, { title: "Dragon Riders", tags: "Fantasy" });

        const res = await app.request("/api/books?tag=Fantasy", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.items).toHaveLength(2);
        expect(json.data.items.map((b: { title: string }) => b.title).sort()).toEqual(["Dragon Riders", "Dragon Tales"]);
    });

    it("filters by multiple comma-separated tags/genres (OR semantics)", async () => {
        await uploadBook(tokenA, { title: "Dragon Tales", genre: "fantasy", tags: "Fantasy" });
        await uploadBook(tokenA, { title: "Space Odyssey", genre: "scifi", tags: "Science Fiction" });
        await uploadBook(tokenA, { title: "History Book", genre: "history", tags: "Nonfiction" });

        const genreRes = await app.request("/api/books?genre=fantasy,scifi", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const genreJson = await readJson(genreRes);
        expect(genreJson.data.items.map((b: { title: string }) => b.title).sort()).toEqual(["Dragon Tales", "Space Odyssey"]);

        const tagRes = await app.request("/api/books?tag=Fantasy,Science%20Fiction", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const tagJson = await readJson(tagRes);
        expect(tagJson.data.items.map((b: { title: string }) => b.title).sort()).toEqual(["Dragon Tales", "Space Odyssey"]);
    });
});

describe("GET /api/books/facets", () => {
    it("returns only the caller's own distinct tags and genres", async () => {
        await uploadBook(tokenA, { genre: "fantasy", tags: "Dragons, Adventure" });
        await uploadBook(tokenA, { genre: "fantasy", tags: "Dragons" });
        await uploadBook(tokenA, { genre: "scifi", tags: "Space" });
        await uploadBook(tokenB, { genre: "history", tags: "War" });

        const res = await app.request("/api/books/facets", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.genres.sort()).toEqual(["fantasy", "scifi"]);
        expect(json.data.tags.sort()).toEqual(["Adventure", "Dragons", "Space"]);
    });

    it("requires authentication", async () => {
        const res = await app.request("/api/books/facets", {}, env);
        expect(res.status).toBe(401);
    });
});

describe("POST/DELETE /api/books/:id/favorite", () => {
    it("toggles favorite state, is idempotent, and filters via favorite=true", async () => {
        const uploadResA = await uploadBook(tokenA, { title: "Favorite Me" });
        const bookId = (await readJson(uploadResA)).data.id;
        await uploadBook(tokenA, { title: "Not Favorited" });

        const favRes = await app.request(`/api/books/${bookId}/favorite`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(favRes.status).toBe(204);

        // Adding again must not duplicate the row / error.
        const favAgainRes = await app.request(`/api/books/${bookId}/favorite`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(favAgainRes.status).toBe(204);

        const getRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(getRes)).data.isFavorite).toBe(true);

        const filterRes = await app.request("/api/books?favorite=true", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const filterJson = await readJson(filterRes);
        expect(filterJson.data.items).toHaveLength(1);
        expect(filterJson.data.items[0].title).toBe("Favorite Me");
        expect(filterJson.data.items[0].isFavorite).toBe(true);

        const unfavRes = await app.request(`/api/books/${bookId}/favorite`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(unfavRes.status).toBe(204);

        // Removing again (already absent) must not error.
        const unfavAgainRes = await app.request(`/api/books/${bookId}/favorite`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(unfavAgainRes.status).toBe(204);

        const getAfterRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(getAfterRes)).data.isFavorite).toBe(false);
    });

    it("returns 404 for another user's book", async () => {
        const uploadRes = await uploadBook(tokenA);
        const bookId = (await readJson(uploadRes)).data.id;

        const favRes = await app.request(`/api/books/${bookId}/favorite`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(favRes.status).toBe(404);

        const unfavRes = await app.request(`/api/books/${bookId}/favorite`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(unfavRes.status).toBe(404);
    });
});

describe("GET/PUT/DELETE /api/books/:id", () => {
    it("returns 404 for a book owned by another user", async () => {
        const uploadRes = await uploadBook(tokenA);
        const bookId = (await readJson(uploadRes)).data.id;

        const getRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(getRes.status).toBe(404);

        const putRes = await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ title: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(deleteRes.status).toBe(404);
    });

    it("updates metadata and persists it", async () => {
        const uploadRes = await uploadBook(tokenA, { title: "Original Title" });
        const bookId = (await readJson(uploadRes)).data.id;

        const putRes = await app.request(
            `/api/books/${bookId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ title: "Updated Title", isbn: "978-0-00-000000-0", tags: ["Updated"] }),
            },
            env
        );
        expect(putRes.status).toBe(200);

        const getRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(getRes);
        expect(json.data.title).toBe("Updated Title");
        expect(json.data.isbn).toBe("978-0-00-000000-0");
        expect(json.data.tags).toEqual(["Updated"]);
    });

    it("replaces the cover via PUT /:id/cover, cleaning up the old R2 object", async () => {
        const uploadRes = await uploadBook(tokenA, { title: "Book With Cover" }, makeEpubFile());
        const bookId = (await readJson(uploadRes)).data.id;

        const firstCoverForm = new FormData();
        firstCoverForm.set("cover", new File(["first cover"], "cover.jpg", { type: "image/jpeg" }));
        const firstRes = await app.request(`/api/books/${bookId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: firstCoverForm }, env);
        expect(firstRes.status).toBe(200);
        const firstJson = await readJson(firstRes);
        expect(firstJson.data.coverUrl).toBe(`/api/books/${bookId}/cover`);

        const getFirstCoverRes = await app.request(`/api/books/${bookId}/cover`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getFirstCoverRes.status).toBe(200);

        // Replace with a different extension -- the old .jpg object must be cleaned up.
        const secondCoverForm = new FormData();
        secondCoverForm.set("cover", new File(["second cover"], "cover.png", { type: "image/png" }));
        const secondRes = await app.request(`/api/books/${bookId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: secondCoverForm }, env);
        expect(secondRes.status).toBe(200);

        const getSecondCoverRes = await app.request(`/api/books/${bookId}/cover`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getSecondCoverRes.status).toBe(200);
        expect(getSecondCoverRes.headers.get("Content-Type")).toBe("image/png");

        const oldCoverObject = await env.STORAGE.get(`books/${bookId}/cover.jpg`);
        expect(oldCoverObject).toBeNull();
    });

    it("returns 404 replacing another user's book cover", async () => {
        const uploadRes = await uploadBook(tokenA);
        const bookId = (await readJson(uploadRes)).data.id;

        const form = new FormData();
        form.set("cover", new File(["cover bytes"], "cover.jpg", { type: "image/jpeg" }));
        const res = await app.request(`/api/books/${bookId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(res.status).toBe(404);
    });

    it("deletes a book and its files", async () => {
        const uploadRes = await uploadBook(tokenA);
        const bookId = (await readJson(uploadRes)).data.id;

        const deleteRes = await app.request(`/api/books/${bookId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/books/${bookId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getRes.status).toBe(404);

        const fileRes = await app.request(`/api/books/${bookId}/file`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(fileRes.status).toBe(404);
    });
});

describe("GET /api/books/:id/file and /cover (ownership check)", () => {
    it("streams the book file to its owner", async () => {
        const uploadRes = await uploadBook(tokenA);
        const bookId = (await readJson(uploadRes)).data.id;

        const res = await app.request(`/api/books/${bookId}/file`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("application/epub+zip");
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(await res.text()).toBe("epub-bytes");
    });

    it("returns 404 for another user's book file", async () => {
        const uploadRes = await uploadBook(tokenA);
        const bookId = (await readJson(uploadRes)).data.id;

        const res = await app.request(`/api/books/${bookId}/file`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });

    it("returns 404 for another user's book cover", async () => {
        const cover = new File(["cover-bytes"], "cover.jpg", { type: "image/jpeg" });
        const form = uploadForm();
        form.set("cover", cover);
        const uploadRes = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const bookId = (await readJson(uploadRes)).data.id;

        const ownerRes = await app.request(`/api/books/${bookId}/cover`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(ownerRes.status).toBe(200);

        const otherRes = await app.request(`/api/books/${bookId}/cover`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(otherRes.status).toBe(404);
    });
});
