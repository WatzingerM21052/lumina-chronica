import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { fileResponse } from "../utils/fileResponse";
import {
    NotFoundError,
    ValidationError,
    createProject,
    deleteProject,
    getProject,
    getProjectCoverObject,
    getProjectMapObject,
    listProjects,
    updateProject,
    updateProjectCover,
    updateProjectMap,
    type CreateProjectInput,
    type UpdateProjectInput,
} from "../services/projectService";
import {
    createCharacter,
    deleteCharacter,
    getCharacter,
    getCharacterImageObject,
    listCharacters,
    updateCharacter,
    updateCharacterImage,
    type CreateCharacterInput,
    type UpdateCharacterInput,
} from "../services/characterService";
import {
    createLocation,
    deleteLocation,
    getLocation,
    getLocationImageObject,
    listLocations,
    updateLocation,
    updateLocationImage,
    updateLocationPosition,
    type CreateLocationInput,
    type UpdateLocationInput,
    type UpdateLocationPositionInput,
} from "../services/locationService";
import {
    createTimelineEvent,
    deleteTimelineEvent,
    getTimelineEvent,
    listTimelineEvents,
    moveTimelineEvent,
    updateTimelineEvent,
    type CreateTimelineEventInput,
    type MoveDirection,
    type UpdateTimelineEventInput,
} from "../services/timelineService";
import {
    createLoreEntry,
    deleteLoreEntry,
    getLoreEntry,
    listLoreEntries,
    updateLoreEntry,
    type CreateLoreEntryInput,
    type UpdateLoreEntryInput,
} from "../services/loreService";
import { createProjectFile, deleteProjectFile, getProjectFileObject, listProjectFiles, type CreateProjectFileInput } from "../services/projectFileService";
import { addBookToProject, listProjectBooks, removeBookFromProject } from "../services/projectBookService";
import {
    createCharacterRelationship,
    deleteCharacterRelationship,
    listCharacterRelationships,
    updateCharacterRelationship,
    type CreateCharacterRelationshipInput,
    type UpdateCharacterRelationshipInput,
} from "../services/characterRelationshipService";

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

    return fileResponse(c, object.body, object.httpMetadata?.contentType ?? "application/octet-stream");
});

// Map — v2.0, Phase 3 (issue #256). One map image per project, parallel to
// the cover.

projectsRoute.put("/:id/map", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    const map = body?.map instanceof File ? body.map : null;
    if (!map) return c.json(failure("VALIDATION_ERROR", "map is required."), 400);

    try {
        const project = await updateProjectMap(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, map);
        return c.json(success(project));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/map", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const object = await getProjectMapObject(c.env.DB, c.env.STORAGE, c.get("userId"), projectId);
    if (!object) return c.json(failure("NOT_FOUND", "Map not found."), 404);

    return fileResponse(c, object.body, object.httpMetadata?.contentType ?? "application/octet-stream");
});

// Characters — v2.0, Phase 2 (issue #255). Nested under a project; access
// control walks up to "do you own the parent project" (characterService.ts's
// assertOwnsProject), not a per-character owner_id.

projectsRoute.post("/:id/characters", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid multipart request body."), 400);

    const name = typeof body.name === "string" ? body.name : "";
    const image = body.image instanceof File ? body.image : undefined;

    const input: CreateCharacterInput = {
        name,
        description: typeof body.description === "string" ? body.description : undefined,
        age: typeof body.age === "string" ? body.age : undefined,
        origin: typeof body.origin === "string" ? body.origin : undefined,
        personality: typeof body.personality === "string" ? body.personality : undefined,
        biography: typeof body.biography === "string" ? body.biography : undefined,
        image,
    };

    try {
        const character = await createCharacter(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, input);
        return c.json(success(character), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/characters", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const characters = await listCharacters(c.env.DB, c.get("userId"), projectId);
        return c.json(success(characters));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/characters/:characterId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const characterId = Number(c.req.param("characterId"));
    try {
        const character = await getCharacter(c.env.DB, c.get("userId"), projectId, characterId);
        return c.json(success(character));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Character not found."), 404);
        throw err;
    }
});

projectsRoute.put("/:id/characters/:characterId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const characterId = Number(c.req.param("characterId"));
    const body = await c.req.json<UpdateCharacterInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const character = await updateCharacter(c.env.DB, c.get("userId"), projectId, characterId, body);
        return c.json(success(character));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Character not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.put("/:id/characters/:characterId/image", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const characterId = Number(c.req.param("characterId"));
    const body = await c.req.parseBody().catch(() => null);
    const image = body?.image instanceof File ? body.image : null;
    if (!image) return c.json(failure("VALIDATION_ERROR", "image is required."), 400);

    try {
        const character = await updateCharacterImage(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, characterId, image);
        return c.json(success(character));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Character not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.delete("/:id/characters/:characterId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const characterId = Number(c.req.param("characterId"));
    try {
        await deleteCharacter(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, characterId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Character not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/characters/:characterId/image", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const characterId = Number(c.req.param("characterId"));
    const object = await getCharacterImageObject(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, characterId);
    if (!object) return c.json(failure("NOT_FOUND", "Image not found."), 404);

    return fileResponse(c, object.body, object.httpMetadata?.contentType ?? "application/octet-stream");
});

// Locations — v2.0, Phase 3 (issue #256). Same nested-under-a-project shape
// as Characters, plus a position sub-resource for map pin placement.

projectsRoute.post("/:id/locations", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid multipart request body."), 400);

    const name = typeof body.name === "string" ? body.name : "";
    const image = body.image instanceof File ? body.image : undefined;

    const input: CreateLocationInput = {
        name,
        description: typeof body.description === "string" ? body.description : undefined,
        image,
    };

    try {
        const location = await createLocation(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, input);
        return c.json(success(location), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/locations", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const locations = await listLocations(c.env.DB, c.get("userId"), projectId);
        return c.json(success(locations));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/locations/:locationId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const locationId = Number(c.req.param("locationId"));
    try {
        const location = await getLocation(c.env.DB, c.get("userId"), projectId, locationId);
        return c.json(success(location));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Location not found."), 404);
        throw err;
    }
});

projectsRoute.put("/:id/locations/:locationId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const locationId = Number(c.req.param("locationId"));
    const body = await c.req.json<UpdateLocationInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const location = await updateLocation(c.env.DB, c.get("userId"), projectId, locationId, body);
        return c.json(success(location));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Location not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.put("/:id/locations/:locationId/position", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const locationId = Number(c.req.param("locationId"));
    const body = await c.req.json<UpdateLocationPositionInput>().catch(() => null);
    if (!body || typeof body.x === "undefined" || typeof body.y === "undefined") {
        return c.json(failure("VALIDATION_ERROR", "x and y are required (use null to unplace)."), 400);
    }

    try {
        const location = await updateLocationPosition(c.env.DB, c.get("userId"), projectId, locationId, body);
        return c.json(success(location));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Location not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.put("/:id/locations/:locationId/image", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const locationId = Number(c.req.param("locationId"));
    const body = await c.req.parseBody().catch(() => null);
    const image = body?.image instanceof File ? body.image : null;
    if (!image) return c.json(failure("VALIDATION_ERROR", "image is required."), 400);

    try {
        const location = await updateLocationImage(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, locationId, image);
        return c.json(success(location));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Location not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.delete("/:id/locations/:locationId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const locationId = Number(c.req.param("locationId"));
    try {
        await deleteLocation(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, locationId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Location not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/locations/:locationId/image", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const locationId = Number(c.req.param("locationId"));
    const object = await getLocationImageObject(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, locationId);
    if (!object) return c.json(failure("NOT_FOUND", "Image not found."), 404);

    return fileResponse(c, object.body, object.httpMetadata?.contentType ?? "application/octet-stream");
});

// Timeline — v2.0, Phase 4 (issue #257). Chronological in-world events;
// `date` is free text (no real calendar), so ordering is a manual
// order_index moved via /:eventId/move rather than sorted by date.

projectsRoute.post("/:id/timeline", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.json<CreateTimelineEventInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const event = await createTimelineEvent(c.env.DB, c.get("userId"), projectId, body);
        return c.json(success(event), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/timeline", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const events = await listTimelineEvents(c.env.DB, c.get("userId"), projectId);
        return c.json(success(events));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/timeline/:eventId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const eventId = Number(c.req.param("eventId"));
    try {
        const event = await getTimelineEvent(c.env.DB, c.get("userId"), projectId, eventId);
        return c.json(success(event));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Timeline event not found."), 404);
        throw err;
    }
});

projectsRoute.put("/:id/timeline/:eventId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const eventId = Number(c.req.param("eventId"));
    const body = await c.req.json<UpdateTimelineEventInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const event = await updateTimelineEvent(c.env.DB, c.get("userId"), projectId, eventId, body);
        return c.json(success(event));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Timeline event not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.put("/:id/timeline/:eventId/move", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const eventId = Number(c.req.param("eventId"));
    const body = await c.req.json<{ direction?: string }>().catch(() => null);
    if (body?.direction !== "up" && body?.direction !== "down") {
        return c.json(failure("VALIDATION_ERROR", "direction must be 'up' or 'down'."), 400);
    }

    try {
        const events = await moveTimelineEvent(c.env.DB, c.get("userId"), projectId, eventId, body.direction as MoveDirection);
        return c.json(success(events));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Timeline event not found."), 404);
        throw err;
    }
});

projectsRoute.delete("/:id/timeline/:eventId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const eventId = Number(c.req.param("eventId"));
    try {
        await deleteTimelineEvent(c.env.DB, c.get("userId"), projectId, eventId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Timeline event not found."), 404);
        throw err;
    }
});

// Lore — v2.0, Phase 5 (issue #258). No spec precedent; content is Markdown
// rendered client-side via the existing Markdig pipeline.

projectsRoute.post("/:id/lore", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.json<CreateLoreEntryInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const entry = await createLoreEntry(c.env.DB, c.get("userId"), projectId, body);
        return c.json(success(entry), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/lore", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const entries = await listLoreEntries(c.env.DB, c.get("userId"), projectId);
        return c.json(success(entries));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/lore/:entryId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const entryId = Number(c.req.param("entryId"));
    try {
        const entry = await getLoreEntry(c.env.DB, c.get("userId"), projectId, entryId);
        return c.json(success(entry));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Lore entry not found."), 404);
        throw err;
    }
});

projectsRoute.put("/:id/lore/:entryId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const entryId = Number(c.req.param("entryId"));
    const body = await c.req.json<UpdateLoreEntryInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const entry = await updateLoreEntry(c.env.DB, c.get("userId"), projectId, entryId, body);
        return c.json(success(entry));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Lore entry not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.delete("/:id/lore/:entryId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const entryId = Number(c.req.param("entryId"));
    try {
        await deleteLoreEntry(c.env.DB, c.get("userId"), projectId, entryId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Lore entry not found."), 404);
        throw err;
    }
});

// Files — v2.0, Phase 5 (issue #258). Documents/images gallery, not tied to
// a specific character/location.

projectsRoute.post("/:id/files", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid multipart request body."), 400);

    const file = body.file instanceof File ? body.file : null;
    if (!file) return c.json(failure("VALIDATION_ERROR", "file is required."), 400);

    const input: CreateProjectFileInput = {
        file,
        category: typeof body.category === "string" ? body.category : undefined,
    };

    try {
        const projectFile = await createProjectFile(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, input);
        return c.json(success(projectFile), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/files", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const files = await listProjectFiles(c.env.DB, c.get("userId"), projectId);
        return c.json(success(files));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.delete("/:id/files/:fileId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const fileId = Number(c.req.param("fileId"));
    try {
        await deleteProjectFile(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, fileId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "File not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/files/:fileId/content", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const fileId = Number(c.req.param("fileId"));
    const result = await getProjectFileObject(c.env.DB, c.env.STORAGE, c.get("userId"), projectId, fileId);
    if (!result) return c.json(failure("NOT_FOUND", "File not found."), 404);

    return fileResponse(c, result.object.body, result.object.httpMetadata?.contentType ?? "application/octet-stream");
});

// Linked books — v2.0, Phase 6 (issue #259). project_books is a plain join
// table, same shape as shelves.ts's shelf_books routes.

projectsRoute.post("/:id/books/:bookId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const bookId = Number(c.req.param("bookId"));
    try {
        await addBookToProject(c.env.DB, c.get("userId"), projectId, bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project or book not found."), 404);
        throw err;
    }
});

projectsRoute.get("/:id/books", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const books = await listProjectBooks(c.env.DB, c.get("userId"), projectId);
        return c.json(success(books));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.delete("/:id/books/:bookId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const bookId = Number(c.req.param("bookId"));
    try {
        await removeBookFromProject(c.env.DB, c.get("userId"), projectId, bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

// Character relationships — v2.0, Phase 6 (issue #259). No spec precedent;
// directional by convention (relationship_type is phrased from A to B).

projectsRoute.post("/:id/relationships", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const body = await c.req.json<CreateCharacterRelationshipInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const relationship = await createCharacterRelationship(c.env.DB, c.get("userId"), projectId, body);
        return c.json(success(relationship), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.get("/:id/relationships", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    try {
        const relationships = await listCharacterRelationships(c.env.DB, c.get("userId"), projectId);
        return c.json(success(relationships));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Project not found."), 404);
        throw err;
    }
});

projectsRoute.put("/:id/relationships/:relationshipId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const relationshipId = Number(c.req.param("relationshipId"));
    const body = await c.req.json<UpdateCharacterRelationshipInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const relationship = await updateCharacterRelationship(c.env.DB, c.get("userId"), projectId, relationshipId, body);
        return c.json(success(relationship));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Relationship not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

projectsRoute.delete("/:id/relationships/:relationshipId", requireAuth, async (c) => {
    const projectId = Number(c.req.param("id"));
    const relationshipId = Number(c.req.param("relationshipId"));
    try {
        await deleteCharacterRelationship(c.env.DB, c.get("userId"), projectId, relationshipId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Relationship not found."), 404);
        throw err;
    }
});
