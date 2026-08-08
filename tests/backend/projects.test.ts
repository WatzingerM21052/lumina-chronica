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

async function createProject(token: string, title = "Aetherfall"): Promise<number> {
    const form = new FormData();
    form.set("title", title);
    const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST /api/projects", () => {
    it("requires authentication", async () => {
        const form = new FormData();
        form.set("title", "My World");
        const res = await app.request("/api/projects", { method: "POST", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("creates a project with a cover and returns it, defaulting type to WORLD", async () => {
        const form = new FormData();
        form.set("title", "Aetherfall");
        form.set("description", "A sky-shattered continent");
        form.set("cover", new File(["fake image bytes"], "cover.jpg", { type: "image/jpeg" }));

        const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.title).toBe("Aetherfall");
        expect(json.data.description).toBe("A sky-shattered continent");
        expect(json.data.type).toBe("WORLD");
        expect(json.data.coverUrl).toBe(`/api/projects/${json.data.id}/cover`);
        expect(json.data.mapUrl).toBeNull();
        expect(json.data.visibility).toBe("PRIVATE");
    });

    it("accepts an explicit type", async () => {
        const form = new FormData();
        form.set("title", "Chronicle of Ash");
        form.set("type", "NOVEL");
        const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect((await readJson(res)).data.type).toBe("NOVEL");
    });

    it("rejects a missing title", async () => {
        const form = new FormData();
        const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });

    it("rejects an invalid type", async () => {
        const form = new FormData();
        form.set("title", "Bad Type");
        form.set("type", "SANDBOX");
        const res = await app.request("/api/projects", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });
});

describe("GET /api/projects and /:id", () => {
    it("only returns the caller's own projects", async () => {
        await createProject(tokenA, "Alice's World");
        await createProject(tokenB, "Bob's World");

        const res = await app.request("/api/projects", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data).toHaveLength(1);
        expect(json.data[0].title).toBe("Alice's World");
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/projects/:id", () => {
    it("updates title, description, and type", async () => {
        const projectId = await createProject(tokenA, "Original Title");
        const res = await app.request(
            `/api/projects/${projectId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ title: "Updated Title", type: "RPG" }),
            },
            env
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.title).toBe("Updated Title");
        expect(json.data.type).toBe("RPG");
    });

    it("returns 404 updating/deleting another user's project", async () => {
        const projectId = await createProject(tokenA);

        const putRes = await app.request(
            `/api/projects/${projectId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ title: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(deleteRes.status).toBe(404);
    });

    it("deletes a project", async () => {
        const projectId = await createProject(tokenA);
        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getRes.status).toBe(404);
    });

    // v3.3 Phase 1 (issue #324): profile_activities has no FK on target_id
    // (polymorphic BOOK/PROJECT target) -- a missing cleanup line wouldn't
    // 500 the delete, so this asserts the row is actually gone rather than
    // relying on a constraint violation to catch it.
    it("deleting a project that has a PROJECT_PUBLIC activity cleans up profile_activities", async () => {
        const projectId = await createProject(tokenA);
        await app.request(
            `/api/projects/${projectId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ visibility: "PUBLIC" }) },
            env
        );

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB
            .prepare("SELECT COUNT(*) AS total FROM profile_activities WHERE target_type = 'PROJECT' AND target_id = ?")
            .bind(projectId)
            .first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });

    it("replaces the cover via PUT /:id/cover", async () => {
        const projectId = await createProject(tokenA);

        const form = new FormData();
        form.set("cover", new File(["cover bytes"], "cover.png", { type: "image/png" }));
        const res = await app.request(`/api/projects/${projectId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).data.coverUrl).toBe(`/api/projects/${projectId}/cover`);

        const coverRes = await app.request(`/api/projects/${projectId}/cover`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(coverRes.status).toBe(200);
    });

    it("returns 404 replacing another user's project cover", async () => {
        const projectId = await createProject(tokenA);

        const form = new FormData();
        form.set("cover", new File(["cover bytes"], "cover.jpg", { type: "image/jpeg" }));
        const res = await app.request(`/api/projects/${projectId}/cover`, { method: "PUT", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(res.status).toBe(404);
    });
});
