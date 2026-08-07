// Projects ("Worldbuilding") -- v2.0, Phase 1 (issue #254). See
// documentation/Architecture.md and documentation/Database.md for the
// schema. R2 key layout: projects/{project-id}/cover.{ext}, mirroring
// books/{book-id}/cover.{ext} and shelves/{shelf-id}/cover.{ext}.
//
// Ownership-checked CRUD shape mirrors shelfService.ts, the closest existing
// analog (owner-scoped resource with an optional cover image). `map_url` is
// a real column from this migration on, but is only ever set starting in
// Phase 3 (Locations & Map, issue #256) -- untouched here.

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";

export class NotFoundError extends Error {}
export { ValidationError };

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

export type UpdateProjectInput = {
    title?: string;
    description?: string | null;
    type?: string;
};

export async function updateProject(db: D1Database, ownerId: number, projectId: number, input: UpdateProjectInput): Promise<ProjectSummary> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();
    if (input.title !== undefined && !input.title.trim()) throw new ValidationError("title cannot be empty.");
    const type = input.type !== undefined ? assertValidType(input.type) : row.type;

    await db
        .prepare("UPDATE projects SET title = ?, description = ?, type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(input.title ?? row.title, input.description !== undefined ? input.description : row.description, type, projectId)
        .run();

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

export async function deleteProject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number): Promise<void> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row) throw new NotFoundError();

    // No child tables reference projects yet (Phase 1). Later phases
    // (characters, locations, timeline_events, lore_entries, project_files,
    // project_books, character_relationships) must add their own cleanup
    // batch here before the DELETE below, same as deleteBook/deleteShelf --
    // real D1 enforces foreign keys.
    await db.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();

    for (const key of [row.cover_url, row.map_url]) {
        if (!key) continue;
        await storage.delete(key).catch((err) => {
            console.error(`Failed to delete R2 object ${key} after deleting project ${projectId}:`, err);
        });
    }
}

export async function getProjectCoverObject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number): Promise<R2ObjectBody | null> {
    const row = await findOwnedProjectRow(db, ownerId, projectId);
    if (!row || !row.cover_url) return null;
    return storage.get(row.cover_url);
}
