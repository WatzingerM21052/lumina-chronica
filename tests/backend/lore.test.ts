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

async function createEntry(token: string, projectId: number, title = "The Silver Vale"): Promise<number> {
    const res = await app.request(
        `/api/projects/${projectId}/lore`,
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

describe("POST /api/projects/:id/lore", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/lore`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "The Silver Vale" }) },
            env
        );
        expect(res.status).toBe(401);
    });

    it("creates a lore entry with Markdown content", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/lore`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ title: "The Silver Vale", content: "# History\n\nA misty valley of **old magic**." }),
            },
            env
        );
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.title).toBe("The Silver Vale");
        expect(json.data.content).toBe("# History\n\nA misty valley of **old magic**.");
    });

    it("rejects a missing title", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/lore`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ title: "" }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(
            `/api/projects/${projectId}/lore`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ title: "Interloper" }) },
            env
        );
        expect(res.status).toBe(404);
    });
});

describe("GET /api/projects/:id/lore and /:entryId", () => {
    it("lists entries sorted by title", async () => {
        const projectId = await createProject(tokenA);
        await createEntry(tokenA, projectId, "Zenith Order");
        await createEntry(tokenA, projectId, "Ashen Prophecy");

        const res = await app.request(`/api/projects/${projectId}/lore`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data.map((e: { title: string }) => e.title)).toEqual(["Ashen Prophecy", "Zenith Order"]);
    });

    it("returns 404 for another user's entry", async () => {
        const projectId = await createProject(tokenA);
        const entryId = await createEntry(tokenA, projectId);
        const res = await app.request(`/api/projects/${projectId}/lore/${entryId}`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/projects/:id/lore/:entryId", () => {
    it("updates title and content", async () => {
        const projectId = await createProject(tokenA);
        const entryId = await createEntry(tokenA, projectId, "Original");

        const res = await app.request(
            `/api/projects/${projectId}/lore/${entryId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ title: "Updated", content: "New content" }) },
            env
        );
        const json = await readJson(res);
        expect(json.data.title).toBe("Updated");
        expect(json.data.content).toBe("New content");
    });

    it("deletes an entry", async () => {
        const projectId = await createProject(tokenA);
        const entryId = await createEntry(tokenA, projectId);

        const deleteRes = await app.request(`/api/projects/${projectId}/lore/${entryId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const getRes = await app.request(`/api/projects/${projectId}/lore/${entryId}`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(getRes.status).toBe(404);
    });

    it("returns 404 updating/deleting another user's entry", async () => {
        const projectId = await createProject(tokenA);
        const entryId = await createEntry(tokenA, projectId);

        const putRes = await app.request(
            `/api/projects/${projectId}/lore/${entryId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ title: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id with existing lore entries", () => {
    it("deletes the project's lore entries when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        await createEntry(tokenA, projectId, "Ashen Prophecy");
        await createEntry(tokenA, projectId, "Zenith Order");

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM lore_entries WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
