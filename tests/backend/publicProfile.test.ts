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

async function shareBook(ownerToken: string, bookId: number, username: string) {
    return app.request(
        `/api/books/${bookId}/shares`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ username }) },
        env
    );
}

async function setPreference(token: string, type: string, enabled: boolean) {
    return app.request(
        "/api/notifications/preferences",
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ type, enabled }) },
        env
    );
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
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

    // v3.2 (issue #321): SHARED books show the same cover+metadata teaser as
    // PUBLIC ones (unless shared_teaser_visible is off), tagged with
    // visibility AND a computed canRead so the frontend can offer a "Lesen"
    // button only to a viewer who can actually read the book -- share-list
    // membership is invisible to the frontend otherwise.
    it("includes a SHARED book in the public listing with canRead reflecting share-list membership", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );
        await shareBook(tokenA, bookId, "bob");

        const anonRes = await app.request("/api/users/alice/public", {}, env);
        expect((await readJson(anonRes)).data.books[0]).toMatchObject({ id: bookId, visibility: "SHARED", canRead: false });

        const listedRes = await app.request("/api/users/alice/public", { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect((await readJson(listedRes)).data.books[0]).toMatchObject({ id: bookId, visibility: "SHARED", canRead: true });

        const ownerRes = await app.request("/api/users/alice/public", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(ownerRes)).data.books[0]).toMatchObject({ id: bookId, visibility: "SHARED", canRead: true });
    });

    it("gives canRead: true to any logged-in non-owner for a PUBLIC book, false when anonymous", async () => {
        const bookId = await uploadBook(tokenA);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        const loggedInRes = await app.request("/api/users/alice/public", { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect((await readJson(loggedInRes)).data.books[0]).toMatchObject({ canRead: true });

        const anonRes = await app.request("/api/users/alice/public", {}, env);
        expect((await readJson(anonRes)).data.books[0]).toMatchObject({ canRead: false });
    });

    it("hides a SHARED book from a non-listed viewer entirely once shared_teaser_visible is turned off", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED", sharedTeaserVisible: false }) },
            env
        );
        await shareBook(tokenA, bookId, "bob");
        const tokenC = await registerAndLogin("carol", "carol@example.com");

        const anonRes = await app.request("/api/users/alice/public", {}, env);
        expect((await readJson(anonRes)).data.books).toEqual([]);

        const nonListedRes = await app.request("/api/users/alice/public", { headers: { Authorization: `Bearer ${tokenC}` } }, env);
        expect((await readJson(nonListedRes)).data.books).toEqual([]);

        const listedRes = await app.request("/api/users/alice/public", { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        const listedJson = await readJson(listedRes);
        expect(listedJson.data.books).toHaveLength(1);
        expect(listedJson.data.books[0]).toMatchObject({ canRead: true });
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

// v3.3 Phase 1 (issue #324) -- a log of the profile owner's own public
// actions, folded into the same public-profile response.
describe("GET /api/users/:username/public -- activities", () => {
    it("logs BOOK_PUBLIC / PROJECT_PUBLIC only on the transition into PUBLIC, not on every subsequent edit", async () => {
        const bookId = await uploadBook(tokenA);
        const projectId = await createProject(tokenA);

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
        // A second, unrelated edit while already PUBLIC must not log again.
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ description: "updated" }) },
            env
        );

        const res = await app.request("/api/users/alice/public", {}, env);
        const json = await readJson(res);

        expect(json.data.activities).toHaveLength(2);
        expect(json.data.activities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: "BOOK_PUBLIC", targetType: "BOOK", targetId: bookId, targetTitle: "Public Book" }),
                expect.objectContaining({ type: "PROJECT_PUBLIC", targetType: "PROJECT", targetId: projectId, targetTitle: "Public World" }),
            ])
        );
    });

    it("logs RATING_GIVEN with a snapshot of the rating value, newest first, one entry per re-rate", async () => {
        const bookId = await uploadBook(tokenA);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        // Both preferences default to disabled (see notificationService.ts's
        // PREFERENCE_DEFAULTS) -- opted in explicitly here since this test
        // is specifically about the logged value, not the opt-in gating
        // (covered in tests/backend/notifications.test.ts).
        await setPreference(tokenB, "ACTIVITY_RATING", true);
        await setPreference(tokenB, "ACTIVITY_RATING_STARS", true);

        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 3 }) },
            env
        );
        await app.request(
            `/api/books/${bookId}/rating`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) },
            env
        );

        const res = await app.request("/api/users/bob/public", {}, env);
        const json = await readJson(res);

        expect(json.data.activities).toHaveLength(2);
        expect(json.data.activities[0]).toMatchObject({ type: "RATING_GIVEN", targetId: bookId, rating: 5 });
        expect(json.data.activities[1]).toMatchObject({ type: "RATING_GIVEN", targetId: bookId, rating: 3 });
    });

    it("does not log an activity for a book/project that stays PRIVATE", async () => {
        await uploadBook(tokenA);
        await createProject(tokenA);

        const res = await app.request("/api/users/alice/public", {}, env);
        const json = await readJson(res);
        expect(json.data.activities).toEqual([]);
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

    it("serves a SHARED book's cover with no Authorization header, same teaser as PUBLIC (shared_teaser_visible defaults on)", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED" }) },
            env
        );

        const res = await app.request(`/api/books/${bookId}/cover`, {}, env);
        expect(res.status).toBe(200);
    });

    it("hides a SHARED book's cover from a non-listed viewer once shared_teaser_visible is off, but still serves it to a listed viewer", async () => {
        const bookId = await uploadBook(tokenA, true);
        await app.request(
            `/api/books/${bookId}`,
            { method: "PUT", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ visibility: "SHARED", sharedTeaserVisible: false }) },
            env
        );
        await app.request(
            `/api/books/${bookId}/shares`,
            { method: "POST", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, body: JSON.stringify({ username: "bob" }) },
            env
        );

        const anonRes = await app.request(`/api/books/${bookId}/cover`, {}, env);
        expect(anonRes.status).toBe(404);

        const listedRes = await app.request(`/api/books/${bookId}/cover`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(listedRes.status).toBe(200);
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
