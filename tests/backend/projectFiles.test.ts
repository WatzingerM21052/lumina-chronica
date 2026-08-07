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

describe("POST /api/projects/:id/files", () => {
    it("requires authentication", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["image bytes"], "map-note.jpg", { type: "image/jpeg" }));
        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("uploads an image file", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["image bytes"], "concept-art.jpg", { type: "image/jpeg" }));

        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.name).toBe("concept-art.jpg");
        expect(json.data.category).toBe("IMAGE");
        expect(json.data.url).toBe(`/api/projects/${projectId}/files/${json.data.id}/content`);
    });

    it("uploads a document file", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "DOCUMENT");
        form.set("file", new File(["document text"], "notes.txt", { type: "text/plain" }));

        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const json = await readJson(res);

        expect(res.status).toBe(201);
        expect(json.data.category).toBe("DOCUMENT");
    });

    it("rejects an invalid category", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "VIDEO");
        form.set("file", new File(["bytes"], "clip.mp4", { type: "video/mp4" }));

        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });

    it("rejects an image with a disallowed extension", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["bytes"], "clip.mp4", { type: "video/mp4" }));

        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });

    it("rejects a document with a disallowed extension", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "DOCUMENT");
        form.set("file", new File(["bytes"], "clip.mp4", { type: "video/mp4" }));

        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        expect(res.status).toBe(400);
    });

    it("returns 404 for another user's project", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["bytes"], "sneaky.jpg", { type: "image/jpeg" }));

        const res = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` }, body: form }, env);
        expect(res.status).toBe(404);
    });
});

describe("GET /api/projects/:id/files and /:fileId/content", () => {
    it("lists files newest first", async () => {
        const projectId = await createProject(tokenA);
        const form1 = new FormData();
        form1.set("category", "IMAGE");
        form1.set("file", new File(["bytes"], "first.jpg", { type: "image/jpeg" }));
        await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form1 }, env);

        const form2 = new FormData();
        form2.set("category", "DOCUMENT");
        form2.set("file", new File(["bytes"], "second.txt", { type: "text/plain" }));
        await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form2 }, env);

        const res = await app.request(`/api/projects/${projectId}/files`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);

        expect(json.data).toHaveLength(2);
        expect(json.data[0].name).toBe("second.txt");
    });

    it("streams the file content", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["image bytes"], "concept-art.png", { type: "image/png" }));
        const createRes = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const fileId = (await readJson(createRes)).data.id;

        const res = await app.request(`/api/projects/${projectId}/files/${fileId}/content`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/png");
    });

    it("returns 404 for another user's file content", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["bytes"], "private.jpg", { type: "image/jpeg" }));
        const createRes = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const fileId = (await readJson(createRes)).data.id;

        const res = await app.request(`/api/projects/${projectId}/files/${fileId}/content`, { headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id/files/:fileId", () => {
    it("deletes a file", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "DOCUMENT");
        form.set("file", new File(["bytes"], "notes.md", { type: "text/markdown" }));
        const createRes = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const fileId = (await readJson(createRes)).data.id;

        const deleteRes = await app.request(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const contentRes = await app.request(`/api/projects/${projectId}/files/${fileId}/content`, { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(contentRes.status).toBe(404);
    });

    it("returns 404 deleting another user's file", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["bytes"], "map.jpg", { type: "image/jpeg" }));
        const createRes = await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);
        const fileId = (await readJson(createRes)).data.id;

        const res = await app.request(`/api/projects/${projectId}/files/${fileId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/projects/:id with existing files", () => {
    it("deletes the project's files when the project is deleted", async () => {
        const projectId = await createProject(tokenA);
        const form = new FormData();
        form.set("category", "IMAGE");
        form.set("file", new File(["bytes"], "map.jpg", { type: "image/jpeg" }));
        await app.request(`/api/projects/${projectId}/files`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` }, body: form }, env);

        const deleteRes = await app.request(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(deleteRes.status).toBe(204);

        const rows = await env.DB.prepare("SELECT COUNT(*) AS total FROM project_files WHERE project_id = ?").bind(projectId).first<{ total: number }>();
        expect(rows?.total).toBe(0);
    });
});
