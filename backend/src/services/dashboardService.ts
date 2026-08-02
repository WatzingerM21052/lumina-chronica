// Home dashboard aggregate — see documentation/Architecture.md's "Dashboard"
// row. One endpoint backing the whole Home page in one call, same reasoning
// as the Library facets endpoint. All reads are owner/user-scoped.

import { BOOK_ROW_COLUMNS, toSummary, type BookRow, type BookSummary } from "./bookService";

const CONTINUE_READING_LIMIT = 5;
const RECOMMENDATIONS_LIMIT = 5;

export type ContinueReadingItem = {
    book: BookSummary;
    percentage: number;
    lastOpened: string;
};

export type DashboardOverview = {
    totalBooks: number;
    totalShelves: number;
    totalFavorites: number;
    finishedBooks: number;
};

export type Dashboard = {
    continueReading: ContinueReadingItem[];
    overview: DashboardOverview;
    recommendations: BookSummary[];
};

type ProgressRow = { book_id: number; percentage: number; last_opened: string };

// Two queries rather than a JOIN: `reading_progress` and `books` both have a
// plain `id` column, and BOOK_ROW_COLUMNS (shared with bookService/shelfService)
// selects `id` unqualified -- fine for single-table queries, but SQLite rejects
// it as ambiguous the moment both tables are in scope together. An `IN (...)`
// follow-up avoids touching that shared constant and stays a fixed two-query
// shape regardless of how many rows come back (capped at CONTINUE_READING_LIMIT).
async function getContinueReading(db: D1Database, userId: number): Promise<ContinueReadingItem[]> {
    const progress = await db
        .prepare("SELECT book_id, percentage, last_opened FROM reading_progress WHERE user_id = ? ORDER BY last_opened DESC, id DESC LIMIT ?")
        .bind(userId, CONTINUE_READING_LIMIT)
        .all<ProgressRow>();

    if (progress.results.length === 0) return [];

    const ids = progress.results.map((row) => row.book_id);
    const placeholders = ids.map(() => "?").join(",");
    const books = await db
        .prepare(`SELECT ${BOOK_ROW_COLUMNS} FROM books WHERE id IN (${placeholders}) AND owner_id = ?`)
        .bind(...ids, userId)
        .all<BookRow>();
    const bookById = new Map(books.results.map((row) => [row.id, toSummary(row)]));

    return progress.results
        .map((row): ContinueReadingItem | null => {
            const book = bookById.get(row.book_id);
            return book ? { book, percentage: row.percentage, lastOpened: row.last_opened } : null;
        })
        .filter((item): item is ContinueReadingItem => item !== null);
}

// Books the user hasn't started yet -- no reading_progress row for them at
// all, newest first. NOT EXISTS's inner `reading_progress` is a subquery
// scope of its own, so `book_id`/`user_id` there don't collide with the
// outer `books` query the way a JOIN would (see getContinueReading above).
async function getRecommendations(db: D1Database, userId: number): Promise<BookSummary[]> {
    const rows = await db
        .prepare(
            `SELECT ${BOOK_ROW_COLUMNS} FROM books
             WHERE owner_id = ?
               AND NOT EXISTS (SELECT 1 FROM reading_progress WHERE reading_progress.book_id = books.id AND reading_progress.user_id = ?)
             ORDER BY created_at DESC, id DESC
             LIMIT ?`
        )
        .bind(userId, userId, RECOMMENDATIONS_LIMIT)
        .all<BookRow>();

    return rows.results.map(toSummary);
}

export async function getDashboard(db: D1Database, userId: number): Promise<Dashboard> {
    const [continueReading, recommendations, totalBooksRow, totalShelvesRow, totalFavoritesRow, finishedBooksRow] = await Promise.all([
        getContinueReading(db, userId),
        getRecommendations(db, userId),
        db.prepare("SELECT COUNT(*) AS total FROM books WHERE owner_id = ?").bind(userId).first<{ total: number }>(),
        db.prepare("SELECT COUNT(*) AS total FROM shelves WHERE owner_id = ?").bind(userId).first<{ total: number }>(),
        db.prepare("SELECT COUNT(*) AS total FROM favorites WHERE user_id = ?").bind(userId).first<{ total: number }>(),
        db
            .prepare("SELECT COUNT(*) AS total FROM reading_progress WHERE user_id = ? AND percentage >= 100")
            .bind(userId)
            .first<{ total: number }>(),
    ]);

    return {
        continueReading,
        recommendations,
        overview: {
            totalBooks: totalBooksRow?.total ?? 0,
            totalShelves: totalShelvesRow?.total ?? 0,
            totalFavorites: totalFavoritesRow?.total ?? 0,
            finishedBooks: finishedBooksRow?.total ?? 0,
        },
    };
}
