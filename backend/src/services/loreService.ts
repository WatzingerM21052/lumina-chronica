// Lore entries -- v2.0, Phase 5 (issue #258). No spec precedent (Teil 4
// names "Lore" in the World-structure diagram but defines no table). No
// owner_id of its own -- access control walks up to "do you own the parent
// project," same shape as characterService.ts/locationService.ts.

import { ValidationError } from "./fileValidation";
import { NotFoundError } from "./errors";

export { NotFoundError, ValidationError };

export type LoreEntrySummary = {
    id: number;
    projectId: number;
    title: string;
    content: string | null;
    createdAt: string;
};

type LoreEntryRow = {
    id: number;
    project_id: number;
    title: string;
    content: string | null;
    created_at: string;
};

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

async function findLoreEntryRow(db: D1Database, projectId: number, entryId: number): Promise<LoreEntryRow | null> {
    return db.prepare("SELECT * FROM lore_entries WHERE id = ? AND project_id = ?").bind(entryId, projectId).first<LoreEntryRow>();
}

function toSummary(row: LoreEntryRow): LoreEntrySummary {
    return {
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        content: row.content,
        createdAt: row.created_at,
    };
}

export type CreateLoreEntryInput = {
    title: string;
    content?: string;
};

export async function createLoreEntry(db: D1Database, ownerId: number, projectId: number, input: CreateLoreEntryInput): Promise<LoreEntrySummary> {
    await assertOwnsProject(db, ownerId, projectId);
    if (!input.title.trim()) throw new ValidationError("title is required.");

    const insert = await db
        .prepare("INSERT INTO lore_entries (project_id, title, content) VALUES (?, ?, ?)")
        .bind(projectId, input.title, input.content ?? null)
        .run();
    const entryId = insert.meta.last_row_id as number;

    const row = await findLoreEntryRow(db, projectId, entryId);
    if (!row) throw new Error("Lore entry disappeared right after creation.");
    return toSummary(row);
}

export async function listLoreEntries(db: D1Database, ownerId: number, projectId: number): Promise<LoreEntrySummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const rows = await db.prepare("SELECT * FROM lore_entries WHERE project_id = ? ORDER BY title ASC").bind(projectId).all<LoreEntryRow>();
    return rows.results.map(toSummary);
}

export async function getLoreEntry(db: D1Database, ownerId: number, projectId: number, entryId: number): Promise<LoreEntrySummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLoreEntryRow(db, projectId, entryId);
    if (!row) throw new NotFoundError();
    return toSummary(row);
}

export type UpdateLoreEntryInput = {
    title?: string;
    content?: string | null;
};

export async function updateLoreEntry(db: D1Database, ownerId: number, projectId: number, entryId: number, input: UpdateLoreEntryInput): Promise<LoreEntrySummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLoreEntryRow(db, projectId, entryId);
    if (!row) throw new NotFoundError();
    if (input.title !== undefined && !input.title.trim()) throw new ValidationError("title cannot be empty.");

    await db
        .prepare("UPDATE lore_entries SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(input.title ?? row.title, input.content !== undefined ? input.content : row.content, entryId)
        .run();

    return getLoreEntry(db, ownerId, projectId, entryId);
}

export async function deleteLoreEntry(db: D1Database, ownerId: number, projectId: number, entryId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findLoreEntryRow(db, projectId, entryId);
    if (!row) throw new NotFoundError();

    await db.prepare("DELETE FROM lore_entries WHERE id = ?").bind(entryId).run();
}

// Used by deleteProject (projectService.ts) to clean up a project's lore
// entries before the project row itself is deleted -- real D1 enforces
// foreign keys, same lesson as deleteCharactersForProject. No R2 objects to
// clean up here -- lore entries have no image.
export async function deleteLoreEntriesForProject(db: D1Database, projectId: number): Promise<void> {
    await db.prepare("DELETE FROM lore_entries WHERE project_id = ?").bind(projectId).run();
}
