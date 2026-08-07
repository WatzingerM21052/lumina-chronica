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

async function createEvent(token: string, projectId: number, title = "The Sundering"): Promise<number> {
    const res = await app.request(
        `/api/projects/${projectId}/timeline`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ title }) },
        env
    );
    return (await readJson(res)).data.id;
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST /api/projects/:id/timeline", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/timeline`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "The Sundering" }) },
            env
        );
        expect(res.status).toBe(401);
    });

    it("creates an event with a free-text date, appended at the end", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/timeline`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ title: "The Sundering", description: "The continent splits", date: "Jahr 1247 der Dritten Ära" }) },
            env
        );
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.title).toBe("The Sundering");
        expect(json.data.date).toBe("Jahr 1247 der Dritten Ära");
        expect(json.data.order).toBe(0);
    });

    it("assigns increasing order to successive events", async () => {
        const projectId = await createProject(tokenA);
        await createEvent(tokenA, projectId, "First");
        const res = await app.request(
            `/api/projects/${projectId}/timeline`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ title: "Second" }) },
            env
        );
        expect((await readJson(res)).data.order).toBe(1);
    });

    it("rejects a missing title", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/timeline`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ title: "" }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/timeline`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ title: "Interloper" }) },
            env
        );
        expect(res.status).toBe(404);
    });
});

describe("GET /api/projects/:id/timeline and /:eventId", () => {
    it("lists events in insertion order", async () => {
        const projectId = await createProject(tokenA);
        await createEvent(tokenA, projectId, "First");
        await createEvent(tokenA, projectId, "Second");
        await createEvent(tokenA, projectId, "Third");

        const res = await app.request(`/api/projects/${projectId}/timeline`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.map((e: { title: string }) => e.title)).toEqual(["First", "Second", "Third"]);
    });

    it("returns 404 for another user's event", async () => {
        const projectId = await createProject(tokenA);
        const eventId = await createEvent(tokenA, projectId);
        const res = await app.request(`/api/projects/${projectId}/timeline/${eventId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/projects/:id/timeline/:eventId", () => {
    it("updates title, description, and date", async () => {
        const projectId = await createProject(tokenA);
        const eventId = await createEvent(tokenA, projectId, "Original");

        const res = await app.request(
            `/api/projects/${projectId}/timeline/${eventId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ title: "Updated", date: "Year 5" }) },
            env
        );
        const json = await readJson(res);
        expect(json.data.title).toBe("Updated");
        expect(json.data.date).toBe("Year 5");
    });

    it("deletes an event", async () => {
        const projectId = await createProject(tokenA);
        const eventId = await createEvent(tokenA, projectId);

        const deleteRes = await app.request(`/api/projects/${projectId}/timeline/${eventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/projects/${projectId}/timeline/${eventId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getRes.status).toBe(404);
    });

    it("returns 404 updating/deleting another user's event", async () => {
        const projectId = await createProject(tokenA);
        const eventId = await createEvent(tokenA, projectId);

        const putRes = await app.request(
            `/api/projects/${projectId}/timeline/${eventId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ title: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);
    });
});

describe("PUT /api/projects/:id/timeline/:eventId/move", () => {
    it("swaps order with the previous event when moving up", async () => {
        const projectId = await createProject(tokenA);
        const firstId = await createEvent(tokenA, projectId, "First");
        const secondId = await createEvent(tokenA, projectId, "Second");

        const res = await app.request(
            `/api/projects/${projectId}/timeline/${secondId}/move`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ direction: "up" }) },
            env
        );
        const json = await readJson(res);

        expect(json.data.map((e: { id: number }) => e.id)).toEqual([secondId, firstId]);
    });

    it("is a no-op moving the first event further up", async () => {
        const projectId = await createProject(tokenA);
        const firstId = await createEvent(tokenA, projectId, "First");
        const secondId = await createEvent(tokenA, projectId, "Second");

        const res = await app.request(
            `/api/projects/${projectId}/timeline/${firstId}/move`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ direction: "up" }) },
            env
        );
        const json = await readJson(res);

        expect(json.data.map((e: { id: number }) => e.id)).toEqual([firstId, secondId]);
    });

    it("rejects an invalid direction", async () => {
        const projectId = await createProject(tokenA);
        const eventId = await createEvent(tokenA, projectId);

        const res = await app.request(
            `/api/projects/${projectId}/timeline/${eventId}/move`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ direction: "sideways" }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's event", async () => {
        const projectId = await createProject(tokenA);
        const eventId = await createEvent(tokenA, projectId);

        const res = await app.request(
            `/api/projects/${projectId}/timeline/${eventId}/move`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ direction: "up" }) },
            env
        );
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id with existing timeline events", () => {
    it("deletes the project's timeline events when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        await createEvent(tokenA, projectId, "First");
        await createEvent(tokenA, projectId, "Second");

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM timeline_events WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
