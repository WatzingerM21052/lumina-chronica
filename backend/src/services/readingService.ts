// Reading progress — see documentation/Architecture.md for the per-format
// `position` semantics (EPUB: CFI string, PDF: page number, TXT/MD: scroll
// fraction) and documentation/Database.md for the schema.

export class NotFoundError extends Error {}

export type ReadingProgress = {
    chapter: number | null;
    position: string | null;
    percentage: number;
    lastOpened: string;
};

type ReadingProgressRow = {
    chapter: number | null;
    position: string | null;
    percentage: number;
    last_opened: string;
};

function toProgress(row: ReadingProgressRow): ReadingProgress {
    return {
        chapter: row.chapter,
        position: row.position,
        percentage: row.percentage,
        lastOpened: row.last_opened,
    };
}

async function isOwnedByUser(db: D1Database, userId: number, bookId: number): Promise<boolean> {
    const row = await db.prepare("SELECT id FROM books WHERE id = ? AND owner_id = ?").bind(bookId, userId).first();
    return row !== null;
}

export async function getProgress(db: D1Database, userId: number, bookId: number): Promise<ReadingProgress | null> {
    if (!(await isOwnedByUser(db, userId, bookId))) throw new NotFoundError();

    const row = await db
        .prepare("SELECT chapter, position, percentage, last_opened FROM reading_progress WHERE user_id = ? AND book_id = ?")
        .bind(userId, bookId)
        .first<ReadingProgressRow>();

    return row ? toProgress(row) : null;
}

export type SaveProgressInput = {
    bookId: number;
    chapter?: number | null;
    position?: string | null;
    percentage: number;
};

export async function saveProgress(db: D1Database, userId: number, input: SaveProgressInput): Promise<ReadingProgress> {
    if (!(await isOwnedByUser(db, userId, input.bookId))) throw new NotFoundError();

    await db
        .prepare(
            `INSERT INTO reading_progress (user_id, book_id, chapter, position, percentage, last_opened)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(user_id, book_id) DO UPDATE SET
                chapter = excluded.chapter, position = excluded.position, percentage = excluded.percentage, last_opened = CURRENT_TIMESTAMP`
        )
        .bind(userId, input.bookId, input.chapter ?? null, input.position ?? null, input.percentage)
        .run();

    const progress = await getProgress(db, userId, input.bookId);
    if (!progress) throw new Error("Reading progress disappeared right after saving.");
    return progress;
}
