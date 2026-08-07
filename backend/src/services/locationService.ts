// Locations -- v2.0, Phase 3 (issue #256). See documentation/Architecture.md
// and documentation/Database.md for the schema. R2 key layout:
// projects/{project-id}/locations/{location-id}/image.{ext}.
//
// A location has no owner_id of its own -- access control walks up to "do
// you own the parent project," same shape as characterService.ts.

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";
import { NotFoundError } from "./errors";

export { NotFoundError, ValidationError };

export type LocationSummary = {
    id: number;
    projectId: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    x: number | null;
    y: number | null;
    createdAt: string;
};

type LocationRow = {
    id: number;
    project_id: number;
    name: string;
    description: string | null;
    image_url: string | null;
    x: number | null;
    y: number | null;
    created_at: string;
};

function r2LocationImageKey(projectId: number, locationId: number, ext: string): string {
    return `projects/${projectId}/locations/${locationId}/image.${ext}`;
}

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

async function findLocationRow(db: D1Database, projectId: number, locationId: number): Promise<LocationRow | null> {
    return db.prepare("SELECT * FROM locations WHERE id = ? AND project_id = ?").bind(locationId, projectId).first<LocationRow>();
}

function toSummary(row: LocationRow): LocationSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        description: row.description,
        imageUrl: row.image_url ? `/api/projects/${row.project_id}/locations/${row.id}/image` : null,
        x: row.x,
        y: row.y,
        createdAt: row.created_at,
    };
}

export type CreateLocationInput = {
    name: string;
    description?: string;
    image?: File;
};

export async function createLocation(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, input: CreateLocationInput): Promise<LocationSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    if (!input.name.trim()) throw new ValidationError("name is required.");

    const imageExt = input.image ? validateFile(input.image, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Image") : null;

    const insert = await db
        .prepare("INSERT INTO locations (project_id, name, description, image_url) VALUES (?, ?, ?, ?)")
        .bind(projectId, input.name, input.description ?? null, null)
        .run();
    const locationId = insert.meta.last_row_id as number;

    if (input.image && imageExt) {
        const imageKey = r2LocationImageKey(projectId, locationId, imageExt);
        await storage.put(imageKey, await input.image.arrayBuffer(), { httpMetadata: { contentType: input.image.type || undefined } });
        await db.prepare("UPDATE locations SET image_url = ? WHERE id = ?").bind(imageKey, locationId).run();
    }

    const row = await findLocationRow(db, projectId, locationId);
    if (!row) throw new Error("Location disappeared right after creation.");
    return toSummary(row);
}

export async function listLocations(db: D1Database, ownerId: number, projectId: number): Promise<LocationSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const rows = await db.prepare("SELECT * FROM locations WHERE project_id = ? ORDER BY name ASC").bind(projectId).all<LocationRow>();
    return rows.results.map(toSummary);
}

export async function getLocation(db: D1Database, ownerId: number, projectId: number, locationId: number): Promise<LocationSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLocationRow(db, projectId, locationId);
    if (!row) throw new NotFoundError();
    return toSummary(row);
}

export type UpdateLocationInput = {
    name?: string;
    description?: string | null;
};

export async function updateLocation(db: D1Database, ownerId: number, projectId: number, locationId: number, input: UpdateLocationInput): Promise<LocationSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLocationRow(db, projectId, locationId);
    if (!row) throw new NotFoundError();
    if (input.name !== undefined && !input.name.trim()) throw new ValidationError("name cannot be empty.");

    await db
        .prepare("UPDATE locations SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(input.name ?? row.name, input.description !== undefined ? input.description : row.description, locationId)
        .run();

    return getLocation(db, ownerId, projectId, locationId);
}

// Separate endpoint from updateLocation, mirroring the same
// metadata-vs-file/position split as cover/image updates elsewhere --
// placing a pin is a distinct interaction (clicking the map), not a form
// field. x/y both null "unplaces" the location from the map.
export type UpdateLocationPositionInput = {
    x: number | null;
    y: number | null;
};

export async function updateLocationPosition(db: D1Database, ownerId: number, projectId: number, locationId: number, input: UpdateLocationPositionInput): Promise<LocationSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLocationRow(db, projectId, locationId);
    if (!row) throw new NotFoundError();
    if (input.x !== null && (input.x < 0 || input.x > 100)) throw new ValidationError("x must be between 0 and 100.");
    if (input.y !== null && (input.y < 0 || input.y > 100)) throw new ValidationError("y must be between 0 and 100.");

    await db.prepare("UPDATE locations SET x = ?, y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.x, input.y, locationId).run();

    return getLocation(db, ownerId, projectId, locationId);
}

export async function updateLocationImage(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, locationId: number, image: File): Promise<LocationSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLocationRow(db, projectId, locationId);
    if (!row) throw new NotFoundError();

    const imageExt = validateFile(image, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Image");
    const imageKey = r2LocationImageKey(projectId, locationId, imageExt);
    const previousImageKey = row.image_url;

    await storage.put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type || undefined } });
    await db.prepare("UPDATE locations SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(imageKey, locationId).run();

    if (previousImageKey && previousImageKey !== imageKey) {
        await storage.delete(previousImageKey).catch((err) => {
            console.error(`Failed to delete old R2 image ${previousImageKey} after replacing location ${locationId}'s image:`, err);
        });
    }

    return getLocation(db, ownerId, projectId, locationId);
}

export async function deleteLocation(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, locationId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLocationRow(db, projectId, locationId);
    if (!row) throw new NotFoundError();

    await db.prepare("DELETE FROM locations WHERE id = ?").bind(locationId).run();

    if (row.image_url) {
        await storage.delete(row.image_url).catch((err) => {
            console.error(`Failed to delete R2 object ${row.image_url} after deleting location ${locationId}:`, err);
        });
    }
}

export async function getLocationImageObject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, locationId: number): Promise<R2ObjectBody | null> {
    const owns = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!owns) return null;
    const row = await findLocationRow(db, projectId, locationId);
    if (!row || !row.image_url) return null;
    return storage.get(row.image_url);
}

// Used by deleteProject (projectService.ts) to clean up a project's
// locations and their R2 images before the project row itself is deleted --
// real D1 enforces foreign keys, same lesson as deleteCharactersForProject.
export async function deleteLocationsForProject(db: D1Database, storage: R2Bucket, projectId: number): Promise<void> {
    const rows = await db.prepare("SELECT image_url FROM locations WHERE project_id = ?").bind(projectId).all<{ image_url: string | null }>();
    await db.prepare("DELETE FROM locations WHERE project_id = ?").bind(projectId).run();

    for (const row of rows.results) {
        if (!row.image_url) continue;
        await storage.delete(row.image_url).catch((err) => {
            console.error(`Failed to delete R2 object ${row.image_url} while deleting project ${projectId}'s locations:`, err);
        });
    }
}
