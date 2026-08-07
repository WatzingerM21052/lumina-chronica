// Bookmarks (v1.5, §101 "Verbesserter Reader") -- user-created markers within
// a book, distinct from reading_progress's single auto-saved resume position:
// a user can have any number of bookmarks per book, each with an optional
// note. Reuses reading_progress's chapter/position/percentage shape (rather
// than the source spec's single "location" field) so the same per-format
// location the Reader already computes for auto-save (see readingService.ts)
// can be reused as-is for "bookmark the current position." See
// documentation/Database.md for the schema.

export class NotFoundError extends Error {}

export type Bookmark = {
    id: number;
    bookId: number;
    chapter: number | null;
    position: string | null;
    percentage: number;
    note: string | null;
    createdAt: string;
};

type BookmarkRow = {
    id: number;
    book_id: number;
    chapter: number | null;
    position: string | null;
    percentage: number;
    note: string | null;
    created_at: string;
};

function toBookmark(row: BookmarkRow): Bookmark {
    return {
        id: row.id,
        bookId: row.book_id,
        chapter: row.chapter,
        position: row.position,
        percentage: row.percentage,
        note: row.note,
        createdAt: row.created_at,
    };
}

async function isOwnedByUser(db: D1Database, userId: number, bookId: number): Promise<boolean> {
    const row = await db.prepare("SELECT id FROM books WHERE id = ? AND owner_id = ?").bind(bookId, userId).first();
    return row !== null;
}

async function findOwnedBookmarkRow(db: D1Database, userId: number, bookmarkId: number): Promise<BookmarkRow | null> {
    return db.prepare("SELECT * FROM bookmarks WHERE id = ? AND user_id = ?").bind(bookmarkId, userId).first<BookmarkRow>();
}

export async function listBookmarks(db: D1Database, userId: number, bookId: number): Promise<Bookmark[]> {
    if (!(await isOwnedByUser(db, userId, bookId))) throw new NotFoundError();

    const rows = await db
        .prepare("SELECT * FROM bookmarks WHERE user_id = ? AND book_id = ? ORDER BY percentage ASC, created_at ASC")
        .bind(userId, bookId)
        .all<BookmarkRow>();
    return rows.results.map(toBookmark);
}

export type CreateBookmarkInput = {
    bookId: number;
    chapter?: number | null;
    position?: string | null;
    percentage: number;
    note?: string | null;
};

export async function createBookmark(db: D1Database, userId: number, input: CreateBookmarkInput): Promise<Bookmark> {
    if (!(await isOwnedByUser(db, userId, input.bookId))) throw new NotFoundError();

    const insert = await db
        .prepare(
            `INSERT INTO bookmarks (user_id, book_id, chapter, position, percentage, note)
             VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(userId, input.bookId, input.chapter ?? null, input.position ?? null, input.percentage, input.note ?? null)
        .run();

    const row = await findOwnedBookmarkRow(db, userId, insert.meta.last_row_id as number);
    if (!row) throw new Error("Bookmark disappeared right after creation.");
    return toBookmark(row);
}

export async function updateBookmarkNote(db: D1Database, userId: number, bookmarkId: number, note: string | null): Promise<Bookmark> {
    const row = await findOwnedBookmarkRow(db, userId, bookmarkId);
    if (!row) throw new NotFoundError();

    await db.prepare("UPDATE bookmarks SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(note, bookmarkId).run();

    const updated = await findOwnedBookmarkRow(db, userId, bookmarkId);
    if (!updated) throw new Error("Bookmark disappeared right after updating.");
    return toBookmark(updated);
}

export async function deleteBookmark(db: D1Database, userId: number, bookmarkId: number): Promise<void> {
    const row = await findOwnedBookmarkRow(db, userId, bookmarkId);
    if (!row) throw new NotFoundError();

    await db.prepare("DELETE FROM bookmarks WHERE id = ?").bind(bookmarkId).run();
}
