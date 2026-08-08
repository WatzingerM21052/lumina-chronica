// Projects ("Worldbuilding") -- v2.0, Phase 1 (issue #254). See
// documentation/Architecture.md and documentation/Database.md for the
// schema. R2 key layout: projects/{project-id}/cover.{ext} and
// projects/{project-id}/map.{ext}, mirroring books/{book-id}/cover.{ext}
// and shelves/{shelf-id}/cover.{ext}.
//
// Ownership-checked CRUD shape mirrors shelfService.ts, the closest existing
// analog (owner-scoped resource with an optional cover image).

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";
import { deleteCharactersForProject } from "./characterService";
import { deleteLocationsForProject } from "./locationService";
import { deleteTimelineEventsForProject } from "./timelineService";
import { deleteLoreEntriesForProject } from "./loreService";
import { deleteProjectFilesForProject } from "./projectFileService";
import { deleteProjectBooksForProject } from "./projectBookService";
import { deleteCharacterRelationshipsForProject } from "./characterRelationshipService";
import { recordProjectPublicActivity } from "./activityService";
import { NotFoundError } from "./errors";

export { NotFoundError, ValidationError };

export const PROJECT_TYPES = ["WORLD", "NOVEL", "RPG", "CUSTOM"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export type ProjectSummary = {
    id: number;
    title: string;
    description: string | null;
    type: ProjectType;
    coverUrl: string | null;
    mapUrl: string | null;
    visibility: string;
    createdAt: string;
};

type ProjectRow = {
    id: number;
    owner_id: number;
    title: string;
    description: string | null;
    type: string;
    cover_url: string | null;
    map_url: string | null;
    visibility: string;
    created_at: string;
};

function r2ProjectCoverKey(projectId: number, ext: string): string {
    return `projects/${projectId}/cover.${ext}`;
}

function r2ProjectMapKey(projectId: number, ext: string): string {
    return `projects/${projectId}/map.${ext}`;
}

async function findOwnedProjectRow(db: D1Database, ownerId: number, projectId: number): Promise<ProjectRow | null> {
    return db.prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first<ProjectRow>();
}

function toSummary(row: ProjectRow): ProjectSummary {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type as ProjectType,
        coverUrl: row.cover_url ? `/api/projects/${row.id}/cover` : null,
        mapUrl: row.map_url ? `/api/projects/${row.id}/map` : null,
        visibility: row.visibility,
        createdAt: row.created_at,
    };
}

function assertValidType(type: string | undefined): ProjectType {
    if (type === undefined) return "WORLD";
    if (!PROJECT_TYPES.includes(type as ProjectType)) {
        throw new ValidationError(`type must be one of: ${PROJECT_TYPES.join(", ")}.`);
    }
    return type as ProjectType;
}

export type CreateProjectInput = {
    title: string;
    description?: string;
    type?: string;
    cover?: File;
};

export async function createProject(db: D1Database, storage: R2Bucket, ownerId: number, input: CreateProjectInput): Promise<ProjectSummary> {
    if (!input.title.trim()) throw new ValidationError("title is required.");
    const type = assertValidType(input.type);

    const coverExt = input.cover ? validateFile(input.cover, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Cover image") : null;

    const insert = await db
        .prepare("INSERT INTO projects (owner_id, title, description, type, cover_url, visibility) VALUES (?, ?, ?, ?, ?, 'PRIVATE')")
        .bind(ownerId, input.title, input.description ?? null, type, null)
        .run();
    const projectId = insert.meta.last_row_id as number;

    if (input.cover && coverExt) {
        const coverKey = r2ProjectCoverKey(projectId, coverExt);
        await storage.put(coverKey, await input.cover.arrayBuffer(), { httpMetadata: { contentType: input.cover.type || undefined } });
        await db.prepare("UPDATE projects SET cover_url = ? WHERE id = ?").bind(coverKey, projectId).run();
    }

    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new Error("Project disappeared right after creation.");
    return toSummary(row);
}

export async function listProjects(db: D1Database, ownerId: number): Promise<ProjectSummary[]> {
    const rows = await db.prepare("SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC").bind(ownerId).all<ProjectRow>();
    return rows.results.map(toSummary);
}

export async function getProject(db: D1Database, ownerId: number, projectId: number): Promise<ProjectSummary> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();
    return toSummary(row);
}

// SHARED is stored but has no enforcement semantics anywhere yet, same
// caveat as bookService.ts's identical constant -- the frontend's visibility
// selector only offers PRIVATE/PUBLIC (Community Phase 1, issue #300).
const VISIBILITY_VALUES = ["PRIVATE", "SHARED", "PUBLIC"] as const;

export type UpdateProjectInput = {
    title?: string;
    description?: string | null;
    type?: string;
    visibility?: string;
};

export async function updateProject(db: D1Database, ownerId: number, projectId: number, input: UpdateProjectInput): Promise<ProjectSummary> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();
    if (input.title !== undefined && !input.title.trim()) throw new ValidationError("title cannot be empty.");
    if (input.visibility !== undefined && !VISIBILITY_VALUES.includes(input.visibility as (typeof VISIBILITY_VALUES)[number])) {
        throw new ValidationError(`visibility must be one of ${VISIBILITY_VALUES.join(", ")}.`);
    }
    const type = input.type !== undefined ? assertValidType(input.type) : row.type;

    await db
        .prepare("UPDATE projects SET title = ?, description = ?, type = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(
            input.title ?? row.title,
            input.description !== undefined ? input.description : row.description,
            type,
            input.visibility ?? row.visibility,
            projectId
        )
        .run();

    // Log only the transition INTO PUBLIC, not every edit made while a
    // project stays PUBLIC.
    if (input.visibility === "PUBLIC" && row.visibility !== "PUBLIC") {
        await recordProjectPublicActivity(db, ownerId, projectId);
    }

    return getProject(db, ownerId, projectId);
}

// Separate from updateProject (JSON metadata only) since a cover replace is
// a multipart upload -- mirrors shelfService.ts's updateShelfCover,
// including best-effort cleanup of the old R2 object.
export async function updateProjectCover(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, cover: File): Promise<ProjectSummary> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();

    const coverExt = validateFile(cover, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Cover image");
    const coverKey = r2ProjectCoverKey(projectId, coverExt);
    const previousCoverKey = row.cover_url;

    await storage.put(coverKey, await cover.arrayBuffer(), { httpMetadata: { contentType: cover.type || undefined } });
    await db.prepare("UPDATE projects SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(coverKey, projectId).run();

    if (previousCoverKey && previousCoverKey !== coverKey) {
        await storage.delete(previousCoverKey).catch((err) => {
            console.error(`Failed to delete old R2 cover ${previousCoverKey} after replacing project ${projectId}'s cover:`, err);
        });
    }

    return getProject(db, ownerId, projectId);
}

// Separate from updateProject (JSON metadata only) and updateProjectCover
// (a different R2 slot) -- mirrors updateProjectCover exactly, including
// best-effort cleanup of the old R2 object.
export async function updateProjectMap(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, map: File): Promise<ProjectSummary> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();

    const mapExt = validateFile(map, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Map image");
    const mapKey = r2ProjectMapKey(projectId, mapExt);
    const previousMapKey = row.map_url;

    await storage.put(mapKey, await map.arrayBuffer(), { httpMetadata: { contentType: map.type || undefined } });
    await db.prepare("UPDATE projects SET map_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(mapKey, projectId).run();

    if (previousMapKey && previousMapKey !== mapKey) {
        await storage.delete(previousMapKey).catch((err) => {
            console.error(`Failed to delete old R2 map ${previousMapKey} after replacing project ${projectId}'s map:`, err);
        });
    }

    return getProject(db, ownerId, projectId);
}

export async function deleteProject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number): Promise<void> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();

    // Every sub-resource's cleanup runs before the DELETE below -- real D1
    // enforces foreign keys, same lesson as deleteBook/deleteShelf.
    // deleteCharacterRelationshipsForProject must run before
    // deleteCharactersForProject removes the characters it points at.
    await deleteCharacterRelationshipsForProject(db, projectId);
    await deleteCharactersForProject(db, storage, projectId);
    await deleteLocationsForProject(db, storage, projectId);
    await deleteTimelineEventsForProject(db, projectId);
    await deleteLoreEntriesForProject(db, projectId);
    await deleteProjectFilesForProject(db, storage, projectId);
    await deleteProjectBooksForProject(db, projectId);
    await db.prepare("DELETE FROM profile_activities WHERE target_type = 'PROJECT' AND target_id = ?").bind(projectId).run();
    await db.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();

    for (const key of [row.cover_url, row.map_url]) {
        if (!key) continue;
        await storage.delete(key).catch((err) => {
            console.error(`Failed to delete R2 object ${key} after deleting project ${projectId}:`, err);
        });
    }
}

// ownerId is nullable here (unlike every other function in this file) --
// this is the one route reachable while logged out (optionalAuth, not
// requireAuth), since a PUBLIC project's cover has to render on its owner's
// public profile (issue #300) for a visitor with no session at all. The
// project's map stays owner-only -- not part of the public "teaser", see #300.
export async function getProjectCoverObject(db: D1Database, storage: R2Bucket, ownerId: number | null, projectId: number): Promise<R2ObjectBody | null> {
    const row = await db.prepare("SELECT cover_url, owner_id, visibility FROM projects WHERE id = ?").bind(projectId).first<{
        cover_url: string | null;
        owner_id: number;
        visibility: string;
    }>();
    if (!row || !row.cover_url) return null;
    if (row.visibility !== "PUBLIC" && row.owner_id !== ownerId) return null;
    return storage.get(row.cover_url);
}

export type PublicProjectSummary = {
    id: number;
    title: string;
    description: string | null;
    type: ProjectType;
    coverUrl: string | null;
};

// Community Phase 1 (issue #300) -- deliberately excludes owner_id, mapUrl
// (project maps stay owner-only), and every field only meaningful to the
// owner. No ownerId param: visibility = 'PUBLIC' is the only access check.
export async function listPublicProjectsByUsername(db: D1Database, username: string): Promise<PublicProjectSummary[]> {
    const rows = await db
        .prepare(
            `SELECT projects.id, projects.title, projects.description, projects.type, projects.cover_url
             FROM projects JOIN users ON users.id = projects.owner_id
             WHERE users.username = ? AND users.deleted_at IS NULL AND projects.visibility = 'PUBLIC'
             ORDER BY projects.created_at DESC`
        )
        .bind(username)
        .all<{ id: number; title: string; description: string | null; type: string; cover_url: string | null }>();

    return rows.results.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type as ProjectType,
        coverUrl: row.cover_url ? `/api/projects/${row.id}/cover` : null,
    }));
}

export async function getProjectMapObject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number): Promise<R2ObjectBody | null> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row || !row.map_url) return null;
    return storage.get(row.map_url);
}
