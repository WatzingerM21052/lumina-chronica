import { describe, expect, it } from "vitest";
import app from "../../backend/src/index";

describe("GET /api/status", () => {
    it("returns the standard success envelope with status online", async () => {
        const res = await app.request("/api/status");

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            success: true,
            data: { status: "online" },
        });
    });

    it("allows the GitHub Pages origin via CORS", async () => {
        const res = await app.request("/api/status", {
            headers: { Origin: "https://watzingerm21052.github.io" },
        });

        expect(res.headers.get("access-control-allow-origin")).toBe(
            "https://watzingerm21052.github.io"
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
