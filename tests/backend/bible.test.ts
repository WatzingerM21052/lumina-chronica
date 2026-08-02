import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { readJson } from "./testUtils";

const env = { DB: {} as D1Database, STORAGE: {} as R2Bucket, JWT_SECRET: "test-secret", BIBLE_API_KEY: "test-bible-key" };

// A real NIV11 id from the curated allowlist -- see bibleService.ts.
const NIV_ID = "78a9f6124f344018-01";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as Response;
}

describe("GET /api/bible/translations", () => {
    it("returns the curated allowlist without calling api.bible, no auth required", async () => {
        const res = await app.request("/api/bible/translations", {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data).toHaveLength(5);
        expect(json.data.map((t: { abbreviation: string }) => t.abbreviation)).toEqual(["NIV", "WEB", "ASV", "LUT1912", "ELB"]);
        expect(json.data.find((t: { abbreviation: string; isBiblica: boolean }) => t.abbreviation === "NIV").isBiblica).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("GET /api/bible/chapters/:bibleId/:chapterId", () => {
    it("proxies to api.bible with the api-key header and maps the response", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                data: {
                    id: "PHP.2",
                    reference: "Phil. 2",
                    content: '<span data-sid="PHP 2:14" class="v">14</span>Do everything without grumbling',
                    copyright: "NIV copyright text",
                    next: { id: "PHP.3", number: "3" },
                    previous: { id: "PHP.1", number: "1" },
                },
                meta: { fumsToken: "fake-token" },
            })
        );

        const res = await app.request(`/api/bible/chapters/${NIV_ID}/PHP.2`, {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.reference).toBe("Phil. 2");
        expect(json.data.fumsToken).toBe("fake-token");
        expect(json.data.content).toContain("PHP 2:14");

        const [calledUrl, calledInit] = fetchMock.mock.calls[0];
        expect(calledUrl).toContain(`rest.api.bible/v1/bibles/${NIV_ID}/chapters/PHP.2`);
        expect(calledUrl).toContain("fums-version=3");
        expect(calledInit.headers["api-key"]).toBe("test-bible-key");
    });

    it("rejects a bibleId outside the curated allowlist without calling api.bible", async () => {
        const res = await app.request("/api/bible/chapters/some-other-bible-id/PHP.2", {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("INVALID_TRANSLATION");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns a friendly 502 when api.bible itself fails", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 503));

        const res = await app.request(`/api/bible/chapters/${NIV_ID}/PHP.2`, {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(502);
        expect(json.error.code).toBe("BIBLE_API_ERROR");
    });

    it("does not require authentication", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({ data: { id: "PHP.2", reference: "Phil. 2", content: "", copyright: "", next: null, previous: null }, meta: { fumsToken: "t" } })
        );

        const res = await app.request(`/api/bible/chapters/${NIV_ID}/PHP.2`, {}, env);

        expect(res.status).toBe(200);
    });
});

describe("GET /api/bible/books/:bibleId", () => {
    it("proxies the books list", async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: "PHP", name: "Phil.", nameLong: "Philippians" }] }));

        const res = await app.request(`/api/bible/books/${NIV_ID}`, {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data).toEqual([{ id: "PHP", name: "Phil.", nameLong: "Philippians" }]);
    });
});

describe("GET /api/bible/books/:bibleId/:bookId/chapters", () => {
    it("filters out the intro pseudo-chapter", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                data: [
                    { id: "PHP.intro", number: "intro", reference: "Phil." },
                    { id: "PHP.1", number: "1", reference: "Phil. 1" },
                    { id: "PHP.2", number: "2", reference: "Phil. 2" },
                ],
            })
        );

        const res = await app.request(`/api/bible/books/${NIV_ID}/PHP/chapters`, {}, env);
        const json = await readJson(res);

        expect(json.data).toHaveLength(2);
        expect(json.data.map((c: { number: string }) => c.number)).toEqual(["1", "2"]);
    });
});

describe("GET /api/bible/search/:bibleId", () => {
    it("requires a query parameter", async () => {
        const res = await app.request(`/api/bible/search/${NIV_ID}`, {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("MISSING_QUERY");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("proxies a search query and maps verse results", async () => {
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                data: {
                    total: 1,
                    verses: [{ id: "PHP.2.14", reference: "Phil. 2:14", text: "Do everything without grumbling" }],
                },
            })
        );

        const res = await app.request(`/api/bible/search/${NIV_ID}?q=grumbling`, {}, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.total).toBe(1);
        expect(json.data.results[0].reference).toBe("Phil. 2:14");

        const [calledUrl] = fetchMock.mock.calls[0];
        expect(calledUrl).toContain("query=grumbling");
    });
});
