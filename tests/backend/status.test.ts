import { describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";

describe("GET /api/status", () => {
    it("returns status online, a dev version and all-false config without bindings", async () => {
        const res = await app.request("/api/status");

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            success: true,
            data: {
                status: "online",
                version: "dev",
                schema: null,
                config: { passwordCodeSecret: false, resend: false, bibleApi: false, googleOAuth: false, githubOAuth: false },
                capabilities: ["resetCode", "statisticsCalendarYears"],
            },
        });
    });

    it("reports the deployed version, the latest migration and which secrets are set -- never their values", async () => {
        const db = createFakeD1();
        await db.prepare("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TEXT)").run();
        await db.prepare("INSERT INTO d1_migrations (name) VALUES ('0001_initial.sql'), ('0027_latest.sql')").run();
        const env = { DB: db, APP_VERSION: "abc1234", PASSWORD_CODE_SECRET: "s3cret-value", RESEND_API_KEY: "re_key", GOOGLE_CLIENT_ID: "id-only" };

        const res = await app.request("/api/status", {}, env);
        const body = await res.json();

        expect(body.data).toMatchObject({
            version: "abc1234",
            schema: "0027_latest.sql",
            config: { passwordCodeSecret: true, resend: true, bibleApi: false, googleOAuth: false, githubOAuth: false },
        });
        expect(JSON.stringify(body)).not.toContain("s3cret-value");
        expect(JSON.stringify(body)).not.toContain("re_key");
    });

    it("reports no schema when the migrations table is missing", async () => {
        const res = await app.request("/api/status", {}, { DB: createFakeD1() });
        expect((await res.json()).data.schema).toBeNull();
    });

    it("allows the GitHub Pages origin via CORS", async () => {
        const res = await app.request("/api/status", {
            headers: { Origin: "https://watzingerm21052.github.io" },
        });

        expect(res.headers.get("access-control-allow-origin")).toBe(
            "https://watzingerm21052.github.io"
        );
    });

    it("allows the custom domain origin via CORS", async () => {
        const res = await app.request("/api/status", {
            headers: { Origin: "https://luminachronica.com" },
        });

        expect(res.headers.get("access-control-allow-origin")).toBe(
            "https://luminachronica.com"
        );
    });
});

describe("unknown routes", () => {
    it("returns the standard error envelope with 404", async () => {
        const res = await app.request("/api/nope");

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({
            success: false,
            error: { code: "NOT_FOUND", message: "Not found." },
        });
    });
});
