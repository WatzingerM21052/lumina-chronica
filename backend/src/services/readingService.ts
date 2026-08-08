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

// Owner always qualifies; PUBLIC qualifies for any logged-in user; SHARED
// qualifies only for someone on that book's explicit share list (v3.2,
// issue #321, book_shares/migration 0017) -- see bookService.ts's
// findAccessibleBookRow for the matching read-access rule on the book
// itself. reading_progress/reading_activity are already keyed by user_id,
// not owner_id, so a borrower's progress is naturally independent of both
// the owner's and any other borrower's -- no schema change needed.
async function isAccessibleByUser(db: D1Database, userId: number, bookId: number): Promise<boolean> {
    const row = await db
        .prepare(
            `SELECT id FROM books WHERE id = ? AND (
                owner_id = ?
                OR visibility = 'PUBLIC'
                OR (visibility = 'SHARED' AND EXISTS (SELECT 1 FROM book_shares WHERE book_id = books.id AND user_id = ?))
             )`
        )
        .bind(bookId, userId, userId)
        .first();
    return row !== null;
}

export async function getProgress(db: D1Database, userId: number, bookId: number): Promise<ReadingProgress | null> {
    if (!(await isAccessibleByUser(db, userId, bookId))) throw new NotFoundError();

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
    if (!(await isAccessibleByUser(db, userId, input.bookId))) throw new NotFoundError();

    await db.batch([
        db
            .prepare(
                `INSERT INTO reading_progress (user_id, book_id, chapter, position, percentage, last_opened)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(user_id, book_id) DO UPDATE SET
                    chapter = excluded.chapter, position = excluded.position, percentage = excluded.percentage, last_opened = CURRENT_TIMESTAMP`
            )
            .bind(userId, input.bookId, input.chapter ?? null, input.position ?? null, input.percentage),
        // Records today as an active reading day -- see 0007_extended_statistics.sql.
        // A plain INSERT here would race the UNIQUE(user_id, activity_date)
        // constraint on the second save of the same day; upserting instead
        // of ignoring also lets event_count track roughly how much activity
        // happened that day, used for the Lesekalender heatmap's intensity.
        db
            .prepare(
                `INSERT INTO reading_activity (user_id, activity_date, event_count)
                 VALUES (?, date('now'), 1)
                 ON CONFLICT(user_id, activity_date) DO UPDATE SET event_count = event_count + 1`
            )
            .bind(userId),
    ]);

    const progress = await getProgress(db, userId, input.bookId);
    if (!progress) throw new Error("Reading progress disappeared right after saving.");
    return progress;
}
