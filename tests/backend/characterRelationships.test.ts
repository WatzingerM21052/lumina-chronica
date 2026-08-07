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

async function createCharacter(token: string, projectId: number, name: string): Promise<number> {
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

describe("POST /api/projects/:id/relationships", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von" }) },
            env
        );
        expect(res.status).toBe(401);
    });

    it("creates a relationship with both character names resolved", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");

        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
                body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von", description: "Trained her in the old ways." }),
            },
            env
        );
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.characterAName).toBe("Aria");
        expect(json.data.characterBName).toBe("Berin");
        expect(json.data.relationshipType).toBe("Mentor von");
    });

    it("rejects a missing relationshipType", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");

        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "" }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("rejects a character having a relationship with itself", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");

        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: aId, relationshipType: "Sibling" }) },
            env
        );
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");

        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von" }) },
            env
        );
        expect(res.status).toBe(404);
    });

    it("rejects a character from a different project", async () => {
        const projectId = await createProject(tokenA, "Aetherfall");
        const otherProjectId = await createProject(tokenA, "Different World");
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const foreignId = await createCharacter(tokenA, otherProjectId, "Outsider");

        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: foreignId, relationshipType: "Mentor von" }) },
            env
        );
        expect(res.status).toBe(400);
    });
});

describe("GET /api/projects/:id/relationships", () => {
    it("lists relationships newest first", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        const cId = await createCharacter(tokenA, projectId, "Corin");

        await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von" }) },
            env
        );
        await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: bId, characterBId: cId, relationshipType: "Rivale von" }) },
            env
        );

        const res = await app.request(`/api/projects/${projectId}/relationships`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);
        expect(json.data.map((r: { relationshipType: string }) => r.relationshipType)).toEqual(["Rivale von", "Mentor von"]);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const res = await app.request(`/api/projects/${projectId}/relationships`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("PUT/DELETE /api/projects/:id/relationships/:relationshipId", () => {
    async function createRelationship(projectId: number, aId: number, bId: number): Promise<number> {
        const res = await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von" }) },
            env
        );
        return (await readJson(res)).data.id;
    }

    it("updates the relationship type and description", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        const relationshipId = await createRelationship(projectId, aId, bId);

        const res = await app.request(
            `/api/projects/${projectId}/relationships/${relationshipId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ relationshipType: "Rivale von", description: "A falling out." }) },
            env
        );
        const json = await readJson(res);
        expect(json.data.relationshipType).toBe("Rivale von");
        expect(json.data.description).toBe("A falling out.");
    });

    it("deletes a relationship", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        const relationshipId = await createRelationship(projectId, aId, bId);

        const deleteRes = await app.request(`/api/projects/${projectId}/relationships/${relationshipId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const listRes = await app.request(`/api/projects/${projectId}/relationships`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(0);
    });

    it("returns 404 updating/deleting another user's relationship", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        const relationshipId = await createRelationship(projectId, aId, bId);

        const putRes = await app.request(
            `/api/projects/${projectId}/relationships/${relationshipId}`,
            { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ relationshipType: "Hijacked" }) },
            env
        );
        expect(putRes.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id/characters/:characterId with existing relationships", () => {
    it("cleans up relationships referencing the deleted character", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von" }) },
            env
        );

        const deleteRes = await app.request(`/api/projects/${projectId}/characters/${bId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM character_relationships WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});

describe("DELETE /api/projects/:id with existing relationships", () => {
    it("deletes the project's relationships when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        const aId = await createCharacter(tokenA, projectId, "Aria");
        const bId = await createCharacter(tokenA, projectId, "Berin");
        await app.request(
            `/api/projects/${projectId}/relationships`,
            { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` }, body: JSON.stringify({ characterAId: aId, characterBId: bId, relationshipType: "Mentor von" }) },
            env
        );

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM character_relationships WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
