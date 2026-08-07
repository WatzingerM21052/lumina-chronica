// Characters -- v2.0, Phase 2 (issue #255). See documentation/Architecture.md
// and documentation/Database.md for the schema. R2 key layout:
// projects/{project-id}/characters/{character-id}/image.{ext}.
//
// A character has no owner_id of its own -- access control walks up to "do
// you own the parent project," same pattern as shelfService.ts's
// addBookToShelf checking the parent shelf before touching shelf_books.

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";
import { NotFoundError } from "./errors";
import { deleteCharacterRelationshipsForCharacter } from "./characterRelationshipService";

export { NotFoundError, ValidationError };

export type CharacterSummary = {
    id: number;
    projectId: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    age: string | null;
    origin: string | null;
    personality: string | null;
    biography: string | null;
    createdAt: string;
};

type CharacterRow = {
    id: number;
    project_id: number;
    name: string;
    description: string | null;
    image_url: string | null;
    age: string | null;
    origin: string | null;
    personality: string | null;
    biography: string | null;
    created_at: string;
};

function r2CharacterImageKey(projectId: number, characterId: number, ext: string): string {
    return `projects/${projectId}/characters/${characterId}/image.${ext}`;
}

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

async function findCharacterRow(db: D1Database, projectId: number, characterId: number): Promise<CharacterRow | null> {
    return db.prepare("SELECT * FROM characters WHERE id = ? AND project_id = ?").bind(characterId, projectId).first<CharacterRow>();
}

function toSummary(row: CharacterRow): CharacterSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        description: row.description,
        imageUrl: row.image_url ? `/api/projects/${row.project_id}/characters/${row.id}/image` : null,
        age: row.age,
        origin: row.origin,
        personality: row.personality,
        biography: row.biography,
        createdAt: row.created_at,
    };
}

export type CreateCharacterInput = {
    name: string;
    description?: string;
    age?: string;
    origin?: string;
    personality?: string;
    biography?: string;
    image?: File;
};

export async function createCharacter(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, input: CreateCharacterInput): Promise<CharacterSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    if (!input.name.trim()) throw new ValidationError("name is required.");

    const imageExt = input.image ? validateFile(input.image, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Image") : null;

    const insert = await db
        .prepare("INSERT INTO characters (project_id, name, description, age, origin, personality, biography, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(projectId, input.name, input.description ?? null, input.age ?? null, input.origin ?? null, input.personality ?? null, input.biography ?? null, null)
        .run();
    const characterId = insert.meta.last_row_id as number;

    if (input.image && imageExt) {
        const imageKey = r2CharacterImageKey(projectId, characterId, imageExt);
        await storage.put(imageKey, await input.image.arrayBuffer(), { httpMetadata: { contentType: input.image.type || undefined } });
        await db.prepare("UPDATE characters SET image_url = ? WHERE id = ?").bind(imageKey, characterId).run();
    }

    const row = await findCharacterRow(db, projectId, characterId);
    if (!row) throw new Error("Character disappeared right after creation.");
    return toSummary(row);
}

export async function listCharacters(db: D1Database, ownerId: number, projectId: number): Promise<CharacterSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const rows = await db.prepare("SELECT * FROM characters WHERE project_id = ? ORDER BY name ASC").bind(projectId).all<CharacterRow>();
    return rows.results.map(toSummary);
}

export async function getCharacter(db: D1Database, ownerId: number, projectId: number, characterId: number): Promise<CharacterSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findCharacterRow(db, projectId, characterId);
    if (!row) throw new NotFoundError();
    return toSummary(row);
}

export type UpdateCharacterInput = {
    name?: string;
    description?: string | null;
    age?: string | null;
    origin?: string | null;
    personality?: string | null;
    biography?: string | null;
};

export async function updateCharacter(db: D1Database, ownerId: number, projectId: number, characterId: number, input: UpdateCharacterInput): Promise<CharacterSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findCharacterRow(db, projectId, characterId);
    if (!row) throw new NotFoundError();
    if (input.name !== undefined && !input.name.trim()) throw new ValidationError("name cannot be empty.");

    await db
        .prepare(
            `UPDATE characters SET name = ?, description = ?, age = ?, origin = ?, personality = ?, biography = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
        .bind(
            input.name ?? row.name,
            input.description !== undefined ? input.description : row.description,
            input.age !== undefined ? input.age : row.age,
            input.origin !== undefined ? input.origin : row.origin,
            input.personality !== undefined ? input.personality : row.personality,
            input.biography !== undefined ? input.biography : row.biography,
            characterId
        )
        .run();

    return getCharacter(db, ownerId, projectId, characterId);
}

// Separate from updateCharacter (JSON metadata only) since an image replace
// is a multipart upload -- mirrors projectService.ts's updateProjectCover,
// including best-effort cleanup of the old R2 object.
export async function updateCharacterImage(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, characterId: number, image: File): Promise<CharacterSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findCharacterRow(db, projectId, characterId);
    if (!row) throw new NotFoundError();

    const imageExt = validateFile(image, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Image");
    const imageKey = r2CharacterImageKey(projectId, characterId, imageExt);
    const previousImageKey = row.image_url;

    await storage.put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type || undefined } });
    await db.prepare("UPDATE characters SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(imageKey, characterId).run();

    if (previousImageKey && previousImageKey !== imageKey) {
        await storage.delete(previousImageKey).catch((err) => {
            console.error(`Failed to delete old R2 image ${previousImageKey} after replacing character ${characterId}'s image:`, err);
        });
    }

    return getCharacter(db, ownerId, projectId, characterId);
}

export async function deleteCharacter(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, characterId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findCharacterRow(db, projectId, characterId);
    if (!row) throw new NotFoundError();

    await deleteCharacterRelationshipsForCharacter(db, characterId);
    await db.prepare("DELETE FROM characters WHERE id = ?").bind(characterId).run();

    if (row.image_url) {
        await storage.delete(row.image_url).catch((err) => {
            console.error(`Failed to delete R2 object ${row.image_url} after deleting character ${characterId}:`, err);
        });
    }
}

// Unlike the other functions in this file, ownership failure here returns
// null (not a thrown NotFoundError) -- matching projectService.ts's
// getProjectCoverObject, so the route can treat "not your project" and "no
// image set" identically as a plain 404 with no try/catch needed.
export async function getCharacterImageObject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, characterId: number): Promise<R2ObjectBody | null> {
    const owns = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!owns) return null;
    const row = await findCharacterRow(db, projectId, characterId);
    if (!row || !row.image_url) return null;
    return storage.get(row.image_url);
}

// Used by deleteProject (Phase 1's projectService.ts) to clean up a
// project's characters and their R2 images before the project row itself is
// deleted -- real D1 enforces foreign keys, same lesson as deleteBook/deleteShelf.
export async function deleteCharactersForProject(db: D1Database, storage: R2Bucket, projectId: number): Promise<void> {
    const rows = await db.prepare("SELECT image_url FROM characters WHERE project_id = ?").bind(projectId).all<{ image_url: string | null }>();
    await db.prepare("DELETE FROM characters WHERE project_id = ?").bind(projectId).run();

    for (const row of rows.results) {
        if (!row.image_url) continue;
        await storage.delete(row.image_url).catch((err) => {
            console.error(`Failed to delete R2 object ${row.image_url} while deleting project ${projectId}'s characters:`, err);
        });
    }
}
