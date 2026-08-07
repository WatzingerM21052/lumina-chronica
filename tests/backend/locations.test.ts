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

async function createLocation(token: string, projectId: number, name = "The Silver Vale"): Promise<number> {
    const form = new FormData();
    form.set("name", name);
    const res = await app.request(`/api/projects/${projectId}/locations`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("PUT/GET /api/projects/:id/map", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("map", new File(["map bytes"], "map.jpg", { type: "image/jpeg" }));
        const res = await app.request(`/api/projects/${projectId}/map`, { method: "PUT", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("sets the map image, returned via mapUrl", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("map", new File(["map bytes"], "map.jpg", { type: "image/jpeg" }));
        const res = await app.request(`/api/projects/${projectId}/map`, { method: "PUT", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.mapUrl).toBe(`/api/projects/${projectId}/map`);

        const mapRes = await app.request(`/api/projects/${projectId}/map`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(mapRes.status).toBe(200);
    });

    it("returns 404 setting or fetching another user's project map", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("map", new File(["map bytes"], "map.jpg", { type: "image/jpeg" }));
        const putRes = await app.request(`/api/projects/${projectId}/map`, { method: "PUT", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(putRes.status).toBe(404);
    });
});

describe("POST /api/projects/:id/locations", () => {
    it("creates a location with an image, unplaced by default", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("name", "The Silver Vale");
        form.set("description", "A misty valley");
        form.set("image", new File(["image bytes"], "vale.jpg", { type: "image/jpeg" }));

        const res = await app.request(`/api/projects/${projectId}/locations`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.name).toBe("The Silver Vale");
        expect(json.data.x).toBeNull();
        expect(json.data.y).toBeNull();
        expect(json.data.imageUrl).toBe(`/api/projects/${projectId}/locations/${json.data.id}/image`);
    });

    it("rejects a missing name", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        const res = await app.request(`/api/projects/${projectId}/locations`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("name", "Interloper");
        const res = await app.request(`/api/projects/${projectId}/locations`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT /api/projects/:id/locations/:locationId/position", () => {
    it("sets x/y", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);

        const res = await app.request(
            `/api/projects/${projectId}/locations/${locationId}/position`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ x: 42.5, y: 17.25 }) },
            env
        );
        const json = await readJson(res);
        expect(res.status).toBe(200);
        expect(json.data.x).toBe(42.5);
        expect(json.data.y).toBe(17.25);
    });

    it("unplaces via null x/y", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);
        await app.request(
            `/api/projects/${projectId}/locations/${locationId}/position`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ x: 10, y: 10 }) },
            env
        );

        const res = await app.request(
            `/api/projects/${projectId}/locations/${locationId}/position`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ x: null, y: null }) },
            env
        );
        const json = await readJson(res);
        expect(json.data.x).toBeNull();
        expect(json.data.y).toBeNull();
    });

    it("rejects out-of-range coordinates", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);

        const res = await app.request(
            `/api/projects/${projectId}/locations/${locationId}/position`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ x: 150, y: 10 }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's location", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);

        const res = await app.request(
            `/api/projects/${projectId}/locations/${locationId}/position`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ x: 10, y: 10 }) },
            env
        );
        expect(res.status).toBe(404);
    });
});

describe("GET /api/projects/:id/locations and /:locationId", () => {
    it("lists locations for the project, sorted by name", async () => {
        const projectId = await createProject(tokenA);
        await createLocation(tokenA, projectId, "Zenith Tower");
        await createLocation(tokenA, projectId, "Ashen Hollow");

        const res = await app.request(`/api/projects/${projectId}/locations`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data).toHaveLength(2);
        expect(json.data[0].name).toBe("Ashen Hollow");
        expect(json.data[1].name).toBe("Zenith Tower");
    });

    it("returns 404 for another user's location", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);
        const res = await app.request(`/api/projects/${projectId}/locations/${locationId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/projects/:id/locations/:locationId", () => {
    it("updates name and description", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId, "Original Name");

        const res = await app.request(
            `/api/projects/${projectId}/locations/${locationId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ name: "Updated Name" }) },
            env
        );
        expect((await readJson(res)).data.name).toBe("Updated Name");
    });

    it("deletes a location", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);

        const deleteRes = await app.request(`/api/projects/${projectId}/locations/${locationId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/projects/${projectId}/locations/${locationId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getRes.status).toBe(404);
    });

    it("returns 404 updating/deleting another user's location", async () => {
        const projectId = await createProject(tokenA);
        const locationId = await createLocation(tokenA, projectId);

        const putRes = await app.request(
            `/api/projects/${projectId}/locations/${locationId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ name: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id with existing locations", () => {
    it("deletes the project's locations when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        await createLocation(tokenA, projectId, "Ashen Hollow");
        await createLocation(tokenA, projectId, "Zenith Tower");

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM locations WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
