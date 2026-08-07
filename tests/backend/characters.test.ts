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

async function createCharacter(token: string, projectId: number, name = "Elarion"): Promise<number> {
    const form = new FormData();
    form.set("name", name);
    const res = await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST /api/projects/:id/characters", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("name", "Elarion");
        const res = await app.request(`/api/projects/${projectId}/characters`, { method: "POST", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("creates a character with an image and returns it", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("name", "Elarion");
        form.set("description", "A wandering mage");
        form.set("age", "over 900 years");
        form.set("origin", "The Silver Vale");
        form.set("personality", "Curious, guarded");
        form.set("biography", "Once a court wizard, now an exile.");
        form.set("image", new File(["fake image bytes"], "elarion.jpg", { type: "image/jpeg" }));

        const res = await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.name).toBe("Elarion");
        expect(json.data.age).toBe("over 900 years");
        expect(json.data.projectId).toBe(projectId);
        expect(json.data.imageUrl).toBe(`/api/projects/${projectId}/characters/${json.data.id}/image`);
    });

    it("rejects a missing name", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        const res = await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("name", "Interloper");
        const res = await app.request(`/api/projects/${projectId}/characters`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(res.status).toBe(404);
    });
});

describe("GET /api/projects/:id/characters and /:characterId", () => {
    it("lists characters for the project, sorted by name", async () => {
        const projectId = await createProject(tokenA);
        await createCharacter(tokenA, projectId, "Zara");
        await createCharacter(tokenA, projectId, "Aldric");

        const res = await app.request(`/api/projects/${projectId}/characters`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data).toHaveLength(2);
        expect(json.data[0].name).toBe("Aldric");
        expect(json.data[1].name).toBe("Zara");
    });

    it("returns 404 listing another user's project characters", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(`/api/projects/${projectId}/characters`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });

    it("returns 404 for another user's character", async () => {
        const projectId = await createProject(tokenA);
        const characterId = await createCharacter(tokenA, projectId);
        const res = await app.request(`/api/projects/${projectId}/characters/${characterId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });

    it("returns 404 for a character id that doesn't belong to the project", async () => {
        const projectId = await createProject(tokenA);
        const otherProjectId = await createProject(tokenA, "Other Project");
        const characterId = await createCharacter(tokenA, projectId);

        const res = await app.request(`/api/projects/${otherProjectId}/characters/${characterId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/projects/:id/characters/:characterId", () => {
    it("updates character fields", async () => {
        const projectId = await createProject(tokenA);
        const characterId = await createCharacter(tokenA, projectId, "Original Name");

        const res = await app.request(
            `/api/projects/${projectId}/characters/${characterId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ name: "Updated Name", personality: "Bold" }) },
            env
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.name).toBe("Updated Name");
        expect(json.data.personality).toBe("Bold");
    });

    it("returns 404 updating/deleting another user's character", async () => {
        const projectId = await createProject(tokenA);
        const characterId = await createCharacter(tokenA, projectId);

        const putRes = await app.request(
            `/api/projects/${projectId}/characters/${characterId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ name: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);

        const deleteRes = await app.request(`/api/projects/${projectId}/characters/${characterId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(deleteRes.status).toBe(404);
    });

    it("deletes a character", async () => {
        const projectId = await createProject(tokenA);
        const characterId = await createCharacter(tokenA, projectId);

        const deleteRes = await app.request(`/api/projects/${projectId}/characters/${characterId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/projects/${projectId}/characters/${characterId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getRes.status).toBe(404);
    });

    it("replaces the image via PUT /:characterId/image", async () => {
        const projectId = await createProject(tokenA);
        const characterId = await createCharacter(tokenA, projectId);

        const form = new FormData();
        form.set("image", new File(["image bytes"], "portrait.png", { type: "image/png" }));
        const res = await app.request(`/api/projects/${projectId}/characters/${characterId}/image`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(200);
        expect((await readJson(res)).data.imageUrl).toBe(`/api/projects/${projectId}/characters/${characterId}/image`);

        const imageRes = await app.request(`/api/projects/${projectId}/characters/${characterId}/image`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(imageRes.status).toBe(200);
    });

    it("returns 404 fetching another user's character image", async () => {
        const projectId = await createProject(tokenA);
        const characterId = await createCharacter(tokenA, projectId);

        const form = new FormData();
        form.set("image", new File(["image bytes"], "portrait.jpg", { type: "image/jpeg" }));
        await app.request(`/api/projects/${projectId}/characters/${characterId}/image`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);

        const res = await app.request(`/api/projects/${projectId}/characters/${characterId}/image`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id with existing characters", () => {
    it("deletes the project's characters when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        await createCharacter(tokenA, projectId, "Aldric");
        await createCharacter(tokenA, projectId, "Zara");

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM characters WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
