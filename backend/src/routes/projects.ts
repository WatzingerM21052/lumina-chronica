import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    NotFoundError,
    ValidationError,
    createProject,
    deleteProject,
    getProject,
    getProjectCoverObject,
    listProjects,
    updateProject,
    updateProjectCover,
    type CreateProjectInput,
    type UpdateProjectInput,
} from "../services/projectService";

// Worldbuilding projects — v2.0, Phase 1 (issue #254). Later Worldbuilding
// phases (Characters, Locations/Map, Timeline, Lore/Files, Linked
// Books/Relationships) add their nested routes to this same file, mirroring
// how shelves.ts mixes shelf CRUD with the shelf_books join-table routes.
export const projectsRoute = new Hono<AppEnv>();

projectsRoute.post("/", requireAuth, async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid multipart request body."), 400);

    const title = typeof body.title === "string" ? body.title : "";
    const cover = body.cover instanceof File ? body.cover : undefined;

    const input: CreateProjectInput = {
        title,
        description: typeof body.description === "string" ? body.description : undefined,
        type: typeof body.type === "string" ? body.type : undefined,
        cover,
    };

    try {
        const project = await createProject(c.env.DB, c.env.STORAGE, c.get("userId"), input);
        return c.json(success(project), 201);
    } catch (err) {
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/", requireAuth, async (c) => {
    const projects = await listProjects(c.env.DB, c.get("userId"));
    return c.json(success(projects));
});

projectsRoute.get("/:id", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const project = await getProject(c.env.DB, c.get("userId"), projectId);
        return c.json(success(project));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.put("/:id", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.json<UpdateProjectInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const project = await updateProject(c.env.DB, c.get("userId"), projectId, body);
        return c.json(success(project));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.put("/:id/cover", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    const cover = body?.cover instanceof File ? body.cover : null;
    if (!cover) return c.json(failure("VALIDATION_ERROR", "cover is required."), 400);

    try {
        const project = await updateProjectCover(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, cover);
        return c.json(success(project));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.delete("/:id", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        await deleteProject(c.env.DB, c.env.STORAGE, c.get("userId"), projectId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/cover", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const object = await getProjectCoverObject(c.env.DB, c.env.STORAGE, c.get("userId"), projectId);
    if (!object) return c.json(failure("NOT_FOUND", "Cover not found."), 404);

    return c.body(object.body, 200, {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    });
});
