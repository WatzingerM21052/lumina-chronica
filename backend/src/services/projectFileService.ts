// Project files (documents/images gallery) -- v2.0, Phase 5 (issue #258).
// Teil 4 §49.6 names the purpose only ("Karten, Dokumente, Bilder"), no
// field list -- Karten/Map already got a first-class column on `projects`
// (Phase 3), so this table is scoped to the two remaining genuinely
// file-shaped items. No owner_id of its own -- same inherited-ownership
// shape as characterService.ts/locationService.ts.

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";
import { NotFoundError } from "./errors";

export { NotFoundError, ValidationError };

export const PROJECT_FILE_CATEGORIES = ["DOCUMENT", "IMAGE"] as const;
export type ProjectFileCategory = (typeof PROJECT_FILE_CATEGORIES)[number];

// Documents get their own, more permissive extension set than covers/images
// -- reuses the "extension authoritative, MIME checked only where reliable"
// approach from bookService.ts's ALLOWED_BOOK_EXTENSIONS. 20MB is a
// deliberately smaller ceiling than the 50MB benchmarked book-file limit --
// a worldbuilding reference document has no reason to approach that size,
// and this hasn't been benchmarked against real workerd since it's well
// within the already-proven-safe range.
const ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "txt", "md", "doc", "docx"] as const;
const MAX_DOCUMENT_FILE_BYTES = 20 * 1024 * 1024;
const DOCUMENT_MIME_HINTS: Record<string, string[]> = {
    pdf: ["application/pdf"],
    doc: ["application/msword"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    // txt/md MIME types are inconsistent across browsers/OSes -- extension
    // is authoritative for these, same reasoning as bookService.ts.
    txt: [],
    md: [],
};

export type ProjectFileSummary = {
    id: number;
    projectId: number;
    name: string;
    category: ProjectFileCategory;
    size: number;
    url: string;
    createdAt: string;
};

type ProjectFileRow = {
    id: number;
    project_id: number;
    file_url: string;
    name: string;
    category: string;
    size: number;
    created_at: string;
};

function r2ProjectFileKey(projectId: number, fileId: number, ext: string): string {
    return `projects/${projectId}/files/${fileId}.${ext}`;
}

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

async function findProjectFileRow(db: D1Database, projectId: number, fileId: number): Promise<ProjectFileRow | null> {
    return db.prepare("SELECT * FROM project_files WHERE id = ? AND project_id = ?").bind(fileId, projectId).first<ProjectFileRow>();
}

function toSummary(row: ProjectFileRow): ProjectFileSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        category: row.category as ProjectFileCategory,
        size: row.size,
        url: `/api/projects/${row.project_id}/files/${row.id}/content`,
        createdAt: row.created_at,
    };
}

function assertValidCategory(category: string | undefined): ProjectFileCategory {
    if (!category || !PROJECT_FILE_CATEGORIES.includes(category as ProjectFileCategory)) {
        throw new ValidationError(`category must be one of: ${PROJECT_FILE_CATEGORIES.join(", ")}.`);
    }
    return category as ProjectFileCategory;
}

export type CreateProjectFileInput = {
    file: File;
    category?: string;
};

export async function createProjectFile(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, input: CreateProjectFileInput): Promise<ProjectFileSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const category = assertValidCategory(input.category);

    const ext =
        category === "IMAGE"
            ? validateFile(input.file, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Image")
            : validateFile(input.file, ALLOWED_DOCUMENT_EXTENSIONS, DOCUMENT_MIME_HINTS, MAX_DOCUMENT_FILE_BYTES, "Document");

    const insert = await db
        .prepare("INSERT INTO project_files (project_id, file_url, name, category, size) VALUES (?, '', ?, ?, ?)")
        .bind(projectId, input.file.name, category, input.file.size)
        .run();
    const fileId = insert.meta.last_row_id as number;

    const fileKey = r2ProjectFileKey(projectId, fileId, ext);
    await storage.put(fileKey, await input.file.arrayBuffer(), { httpMetadata: { contentType: input.file.type || undefined } });
    await db.prepare("UPDATE project_files SET file_url = ? WHERE id = ?").bind(fileKey, fileId).run();

    const row = await findProjectFileRow(db, projectId, fileId);
    if (!row) throw new Error("Project file disappeared right after creation.");
    return toSummary(row);
}

export async function listProjectFiles(db: D1Database, ownerId: number, projectId: number): Promise<ProjectFileSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    // id DESC as a tiebreaker -- created_at is DATETIME (second resolution),
    // so two files uploaded in the same second would otherwise tie and fall
    // back to SQLite's unspecified order (same lesson as dashboardService.ts).
    const rows = await db.prepare("SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC, id DESC").bind(projectId).all<ProjectFileRow>();
    return rows.results.map(toSummary);
}

export async function deleteProjectFile(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, fileId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findProjectFileRow(db, projectId, fileId);
    if (!row) throw new NotFoundError();

    await db.prepare("DELETE FROM project_files WHERE id = ?").bind(fileId).run();

    await storage.delete(row.file_url).catch((err) => {
        console.error(`Failed to delete R2 object ${row.file_url} after deleting project file ${fileId}:`, err);
    });
}

// Unlike the other functions in this file, ownership failure here returns
// null (not a thrown NotFoundError) -- matching characterService.ts's
// getCharacterImageObject/locationService.ts's getLocationImageObject, so
// the streaming route needs no try/catch.
export async function getProjectFileObject(db: D1Database, storage: R2Bucket, ownerId: number, projectId: number, fileId: number): Promise<{ object: R2ObjectBody; row: ProjectFileRow } | null> {
    const owns = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!owns) return null;
    const row = await findProjectFileRow(db, projectId, fileId);
    if (!row) return null;
    const object = await storage.get(row.file_url);
    if (!object) return null;
    return { object, row };
}

// Used by deleteProject (projectService.ts) to clean up a project's files
// (and their R2 objects) before the project row itself is deleted -- real
// D1 enforces foreign keys, same lesson as deleteCharactersForProject.
export async function deleteProjectFilesForProject(db: D1Database, storage: R2Bucket, projectId: number): Promise<void> {
    const rows = await db.prepare("SELECT file_url FROM project_files WHERE project_id = ?").bind(projectId).all<{ file_url: string }>();
    await db.prepare("DELETE FROM project_files WHERE project_id = ?").bind(projectId).run();

    for (const row of rows.results) {
        await storage.delete(row.file_url).catch((err) => {
            console.error(`Failed to delete R2 object ${row.file_url} while deleting project ${projectId}'s files:`, err);
        });
    }
}
