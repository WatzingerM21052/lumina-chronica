// Reading statistics — see documentation/Architecture.md's "Statistics" row.
// Scoped to what's actually trackable from existing data (reading_progress +
// book_metadata.pages + books.genre): books read/in-progress, an estimated
// page count, a genre breakdown, and recent activity. "Lesedauer" (reading
// time) from the source spec's §51 example isn't tracked anywhere — no
// session-start/stop instrumentation exists — and stays out of scope here,
// same as the Reading System's already-deferred Bookmarks/Highlights tables.

import { BOOK_ROW_COLUMNS, toSummary, type BookRow, type BookSummary } from "./bookService";

const RECENT_ACTIVITY_LIMIT = 10;

export type GenreCount = {
    genre: string;
    count: number;
};

export type RecentActivityItem = {
    book: BookSummary;
    percentage: number;
    lastOpened: string;
};

export type Statistics = {
    booksRead: number;
    booksInProgress: number;
    pagesRead: number;
    genreBreakdown: GenreCount[];
    recentActivity: RecentActivityItem[];
};

type ProgressRow = { book_id: number; percentage: number; last_opened: string };

// Same two-query shape as dashboardService's getContinueReading (and for the
// same reason: reading_progress and books both have an unqualified `id`
// column, which SQLite rejects as ambiguous the moment a JOIN puts both
// tables in scope together).
async function loadProgressWithBooks(db: D1Database, userId: number, limit?: number): Promise<{ row: ProgressRow; book: BookRow }[]> {
    const query = limit
        ? "SELECT book_id, percentage, last_opened FROM reading_progress WHERE user_id = ? ORDER BY last_opened DESC, id DESC LIMIT ?"
        : "SELECT book_id, percentage, last_opened FROM reading_progress WHERE user_id = ?";
    const stmt = limit ? db.prepare(query).bind(userId, limit) : db.prepare(query).bind(userId);
    const progress = await stmt.all<ProgressRow>();
    if (progress.results.length === 0) return [];

    const ids = progress.results.map((row) => row.book_id);
    const placeholders = ids.map(() => "?").join(",");
    const books = await db
        .prepare(`SELECT ${BOOK_ROW_COLUMNS} FROM books WHERE id IN (${placeholders}) AND owner_id = ?`)
        .bind(...ids, userId)
        .all<BookRow>();
    const bookById = new Map(books.results.map((row) => [row.id, row]));

    return progress.results
        .map((row) => {
            const book = bookById.get(row.book_id);
            return book ? { row, book } : null;
        })
        .filter((entry): entry is { row: ProgressRow; book: BookRow } => entry !== null);
}

export async function getStatistics(db: D1Database, userId: number): Promise<Statistics> {
    const [booksReadRow, booksInProgressRow, allProgress, recentProgress] = await Promise.all([
        db
            .prepare("SELECT COUNT(*) AS total FROM reading_progress WHERE user_id = ? AND percentage >= 100")
            .bind(userId)
            .first<{ total: number }>(),
        db
            .prepare("SELECT COUNT(*) AS total FROM reading_progress WHERE user_id = ? AND percentage > 0 AND percentage < 100")
            .bind(userId)
            .first<{ total: number }>(),
        loadProgressWithBooks(db, userId),
        loadProgressWithBooks(db, userId, RECENT_ACTIVITY_LIMIT),
    ]);

    const pageRows = allProgress.length
        ? await db
              .prepare(`SELECT book_id, pages FROM book_metadata WHERE book_id IN (${allProgress.map(() => "?").join(",")})`)
              .bind(...allProgress.map((entry) => entry.row.book_id))
              .all<{ book_id: number; pages: number | null }>()
        : { results: [] as { book_id: number; pages: number | null }[] };
    const pagesByBookId = new Map(pageRows.results.map((row) => [row.book_id, row.pages ?? 0]));

    const pagesRead = allProgress.reduce((sum, { row }) => {
        const pages = pagesByBookId.get(row.book_id) ?? 0;
        const fraction = Math.min(100, Math.max(0, row.percentage)) / 100;
        return sum + Math.round(pages * fraction);
    }, 0);

    const genreCounts = new Map<string, number>();
    for (const { book } of allProgress) {
        const genre = book.genre?.trim() || "Unbekannt";
        genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
    const genreBreakdown: GenreCount[] = [...genreCounts.entries()]
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);

    const recentActivity: RecentActivityItem[] = recentProgress.map(({ row, book }) => ({
        book: toSummary(book),
        percentage: row.percentage,
        lastOpened: row.last_opened,
    }));

    return {
        booksRead: booksReadRow?.total ?? 0,
        booksInProgress: booksInProgressRow?.total ?? 0,
        pagesRead,
        genreBreakdown,
        recentActivity,
    };
}
