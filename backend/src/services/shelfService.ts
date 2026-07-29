// Shelves ("Regale") -- personal book collections. See documentation/Architecture.md
// and documentation/Database.md for the schema. R2 key layout:
// shelves/{shelf-id}/cover.{ext}, mirroring books/{book-id}/cover.{ext}.
//
// Ownership-checked CRUD shape mirrors readingService.ts (the most recently
// built example of this exact pattern in the codebase) rather than
// bookService.ts's larger surface.

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";
import { BOOK_ROW_COLUMNS, toSummary as toBookSummary, type BookRow, type BookSummary } from "./bookService";

export class NotFoundError extends Error {}
export { ValidationError };

export type ShelfSummary = {
    id: number;
    name: string;
    description: string | null;
    coverUrl: string | null;
    visibility: string;
    bookCount: number;
    createdAt: string;
};

type ShelfRow = {
    id: number;
    owner_id: number;
    name: string;
    description: string | null;
    cover_url: string | null;
    visibility: string;
    created_at: string;
};

function r2ShelfCoverKey(shelfId: number, ext: string): string {
    return `shelves/${shelfId}/cover.${ext}`;
}

async function findOwnedShelfRow(db: D1Database, ownerId: number, shelfId: number): Promise<ShelfRow | null> {
    return db.prepare("SELECT * FROM shelves WHERE id = ? AND owner_id = ?").bind(shelfId, ownerId).first<ShelfRow>();
}

async function toSummary(db: D1Database, row: ShelfRow): Promise<ShelfSummary> {
    const countRow = await db.prepare("SELECT COUNT(*) AS count FROM shelf_books WHERE shelf_id = ?").bind(row.id).first<{ count: number }>();
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        coverUrl: row.cover_url ? `/api/shelves/${row.id}/cover` : null,
        visibility: row.visibility,
        bookCount: countRow?.count ?? 0,
        createdAt: row.created_at,
    };
}

export type CreateShelfInput = {
    name: string;
    description?: string;
    cover?: File;
};

export async function createShelf(db: D1Database, storage: R2Bucket, ownerId: number, input: CreateShelfInput): Promise<ShelfSummary> {
    if (!input.name.trim()) throw new ValidationError("name is required.");

    const coverExt = input.cover ? validateFile(input.cover, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Cover image") : null;

    const insert = await db
        .prepare("INSERT INTO shelves (owner_id, name, description, cover_url, visibility) VALUES (?, ?, ?, ?, 'PRIVATE')")
        .bind(ownerId, input.name, input.description ?? null, null)
        .run();
    const shelfId = insert.meta.last_row_id as number;

    if (input.cover && coverExt) {
        const coverKey = r2ShelfCoverKey(shelfId, coverExt);
        await storage.put(coverKey, await input.cover.arrayBuffer(), { httpMetadata: { contentType: input.cover.type || undefined } });
        await db.prepare("UPDATE shelves SET cover_url = ? WHERE id = ?").bind(coverKey, shelfId).run();
    }

    const row = await findOwnedShelfRow(db, ownerId, shelfId);
    if (!row) throw new Error("Shelf disappeared right after creation.");
    return toSummary(db, row);
}

export async function listShelves(db: D1Database, ownerId: number): Promise<ShelfSummary[]> {
    const rows = await db.prepare("SELECT * FROM shelves WHERE owner_id = ? ORDER BY created_at DESC").bind(ownerId).all<ShelfRow>();
    return Promise.all(rows.results.map((row) => toSummary(db, row)));
}

export async function getShelf(db: D1Database, ownerId: number, shelfId: number): Promise<ShelfSummary> {
    const row = await findOwnedShelfRow(db, ownerId, shelfId);
    if (!row) throw new NotFoundError();
    return toSummary(db, row);
}

export type UpdateShelfInput = {
    name?: string;
    description?: string | null;
};

export async function updateShelf(db: D1Database, ownerId: number, shelfId: number, input: UpdateShelfInput): Promise<ShelfSummary> {
    const row = await findOwnedShelfRow(db, ownerId, shelfId);
    if (!row) throw new NotFoundError();
    if (input.name !== undefined && !input.name.trim()) throw new ValidationError("name cannot be empty.");

    await db
        .prepare("UPDATE shelves SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(input.name ?? row.name, input.description !== undefined ? input.description : row.description, shelfId)
        .run();

    return getShelf(db, ownerId, shelfId);
}

// Separate from updateShelf (JSON metadata only) since a cover replace is a
// multipart upload -- mirrors bookService.ts's updateBookCover, including
// best-effort cleanup of the old R2 object.
export async function updateShelfCover(db: D1Database, storage: R2Bucket, ownerId: number, shelfId: number, cover: File): Promise<ShelfSummary> {
    const row = await findOwnedShelfRow(db, ownerId, shelfId);
    if (!row) throw new NotFoundError();

    const coverExt = validateFile(cover, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Cover image");
    const coverKey = r2ShelfCoverKey(shelfId, coverExt);
    const previousCoverKey = row.cover_url;

    await storage.put(coverKey, await cover.arrayBuffer(), { httpMetadata: { contentType: cover.type || undefined } });
    await db.prepare("UPDATE shelves SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(coverKey, shelfId).run();

    if (previousCoverKey && previousCoverKey !== coverKey) {
        await storage.delete(previousCoverKey).catch((err) => {
            console.error(`Failed to delete old R2 cover ${previousCoverKey} after replacing shelf ${shelfId}'s cover:`, err);
        });
    }

    return getShelf(db, ownerId, shelfId);
}

export async function deleteShelf(db: D1Database, storage: R2Bucket, ownerId: number, shelfId: number): Promise<void> {
    const row = await findOwnedShelfRow(db, ownerId, shelfId);
    if (!row) throw new NotFoundError();

    await db.batch([
        db.prepare("DELETE FROM shelf_books WHERE shelf_id = ?").bind(shelfId),
        db.prepare("DELETE FROM shelves WHERE id = ?").bind(shelfId),
    ]);

    if (row.cover_url) {
        await storage.delete(row.cover_url).catch((err) => {
            console.error(`Failed to delete R2 object ${row.cover_url} after deleting shelf ${shelfId}:`, err);
        });
    }
}

export async function getShelfCoverObject(db: D1Database, storage: R2Bucket, ownerId: number, shelfId: number): Promise<R2ObjectBody | null> {
    const row = await findOwnedShelfRow(db, ownerId, shelfId);
    if (!row || !row.cover_url) return null;
    return storage.get(row.cover_url);
}

// A book not owned by the caller must also 404 -- checked via a join against
// books.owner_id rather than a separate lookup.
async function assertBookOwnedByCaller(db: D1Database, ownerId: number, bookId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM books WHERE id = ? AND owner_id = ?").bind(bookId, ownerId).first();
    if (!row) throw new NotFoundError();
}

export async function addBookToShelf(db: D1Database, ownerId: number, shelfId: number, bookId: number): Promise<void> {
    if (!(await findOwnedShelfRow(db, ownerId, shelfId))) throw new NotFoundError();
    await assertBookOwnedByCaller(db, ownerId, bookId);
    await db.prepare("INSERT OR IGNORE INTO shelf_books (shelf_id, book_id) VALUES (?, ?)").bind(shelfId, bookId).run();
}

export async function removeBookFromShelf(db: D1Database, ownerId: number, shelfId: number, bookId: number): Promise<void> {
    if (!(await findOwnedShelfRow(db, ownerId, shelfId))) throw new NotFoundError();
    await db.prepare("DELETE FROM shelf_books WHERE shelf_id = ? AND book_id = ?").bind(shelfId, bookId).run();
}

// Used by the Book Detail "add to shelf" picker, which needs to know which
// of the caller's shelves already contain this book to render checkbox state.
export async function listShelfIdsForBook(db: D1Database, ownerId: number, bookId: number): Promise<number[]> {
    const rows = await db
        .prepare("SELECT shelf_books.shelf_id AS shelf_id FROM shelf_books JOIN shelves ON shelves.id = shelf_books.shelf_id WHERE shelf_books.book_id = ? AND shelves.owner_id = ?")
        .bind(bookId, ownerId)
        .all<{ shelf_id: number }>();
    return rows.results.map((row) => row.shelf_id);
}

export type ShelfBooksResult = { items: BookSummary[]; total: number; page: number; pageSize: number };

export async function listShelfBooks(
    db: D1Database,
    ownerId: number,
    shelfId: number,
    pagination: { page: number; pageSize: number }
): Promise<ShelfBooksResult> {
    if (!(await findOwnedShelfRow(db, ownerId, shelfId))) throw new NotFoundError();

    const offset = (pagination.page - 1) * pagination.pageSize;
    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT ${BOOK_ROW_COLUMNS} FROM books
                 JOIN shelf_books ON shelf_books.book_id = books.id
                 WHERE shelf_books.shelf_id = ? ORDER BY books.title ASC LIMIT ? OFFSET ?`
            )
            .bind(shelfId, pagination.pageSize, offset)
            .all<BookRow>(),
        db.prepare("SELECT COUNT(*) AS total FROM shelf_books WHERE shelf_id = ?").bind(shelfId).first<{ total: number }>(),
    ]);

    return {
        items: rows.results.map(toBookSummary),
        total: countRow?.total ?? 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
    };
}
