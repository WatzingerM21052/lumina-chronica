// Reading statistics — see documentation/Architecture.md's "Statistics" row.
// Scoped to what's actually trackable from existing data (reading_progress +
// book_metadata.pages + books.genre): books read/in-progress, an estimated
// page count, a genre breakdown, and recent activity. "Lesedauer" (reading
// time) from the source spec's §51 example isn't tracked anywhere — no
// session-start/stop instrumentation exists — and stays out of scope here,
// same as the Reading System's already-deferred Bookmarks/Highlights tables.
//
// v1.5 extended statistics (§101 "Erweiterte Statistik") add Jahresübersicht/
// Lesekalender/Ziele on top of the above, backed by 0007_extended_statistics.sql's
// reading_activity log and user_settings.reading_goal_books -- see
// documentation/Database.md for why a lightweight daily activity log was
// added instead of real session-time tracking (still out of scope).

import { BOOK_ROW_COLUMNS, toSummary, type BookRow, type BookSummary } from "./bookService";

const RECENT_ACTIVITY_LIMIT = 10;
const CALENDAR_DAYS = 365;

export type GenreCount = {
    genre: string;
    count: number;
};

export type RecentActivityItem = {
    book: BookSummary;
    percentage: number;
    lastOpened: string;
};

export type YearlyOverviewItem = {
    year: string;
    booksFinished: number;
    activeDays: number;
    pagesRead: number;
};

export type CalendarDay = {
    date: string;
    count: number;
};

export type Streaks = {
    currentStreak: number;
    longestStreak: number;
};

export type ReadingGoal = {
    targetBooks: number | null;
    booksFinishedThisYear: number;
};

export type Statistics = {
    booksRead: number;
    booksInProgress: number;
    pagesRead: number;
    genreBreakdown: GenreCount[];
    recentActivity: RecentActivityItem[];
    yearlyOverview: YearlyOverviewItem[];
    readingCalendar: CalendarDay[];
    streaks: Streaks;
    goal: ReadingGoal;
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

function toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// activityDates must be sorted ascending, one entry per day the user saved
// reading progress at least once (see reading_activity in
// 0007_extended_statistics.sql) -- not a per-book history, just presence.
function computeStreaks(activityDates: string[]): Streaks {
    if (activityDates.length === 0) return { currentStreak: 0, longestStreak: 0 };

    let longestStreak = 1;
    let run = 1;
    for (let i = 1; i < activityDates.length; i++) {
        const prev = new Date(`${activityDates[i - 1]}T00:00:00Z`);
        const curr = new Date(`${activityDates[i]}T00:00:00Z`);
        const dayDiff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
        run = dayDiff === 1 ? run + 1 : 1;
        longestStreak = Math.max(longestStreak, run);
    }

    // Walks backward from today, but allows "yesterday" as the streak's most
    // recent day too -- otherwise a user who read yesterday and simply
    // hasn't opened anything yet today would see their streak read 0 the
    // instant midnight passes, before they've had a chance to keep it going.
    const dateSet = new Set(activityDates);
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    if (!dateSet.has(toDateString(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

    let currentStreak = 0;
    while (dateSet.has(toDateString(cursor))) {
        currentStreak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return { currentStreak, longestStreak };
}

async function getYearlyOverview(db: D1Database, userId: number): Promise<YearlyOverviewItem[]> {
    const [finishedRows, activeDaysRows, pagesRows] = await Promise.all([
        db
            .prepare("SELECT strftime('%Y', last_opened) AS year, COUNT(*) AS total FROM reading_progress WHERE user_id = ? AND percentage >= 100 GROUP BY year")
            .bind(userId)
            .all<{ year: string; total: number }>(),
        db
            .prepare("SELECT strftime('%Y', activity_date) AS year, COUNT(*) AS total FROM reading_activity WHERE user_id = ? GROUP BY year")
            .bind(userId)
            .all<{ year: string; total: number }>(),
        db
            .prepare(
                `SELECT strftime('%Y', rp.last_opened) AS year, SUM(COALESCE(bm.pages, 0)) AS total
                 FROM reading_progress rp LEFT JOIN book_metadata bm ON bm.book_id = rp.book_id
                 WHERE rp.user_id = ? AND rp.percentage >= 100 GROUP BY year`
            )
            .bind(userId)
            .all<{ year: string; total: number | null }>(),
    ]);

    const finishedByYear = new Map(finishedRows.results.map((r) => [r.year, r.total]));
    const activeDaysByYear = new Map(activeDaysRows.results.map((r) => [r.year, r.total]));
    const pagesByYear = new Map(pagesRows.results.map((r) => [r.year, r.total ?? 0]));

    const years = new Set([...finishedByYear.keys(), ...activeDaysByYear.keys()]);

    return [...years]
        .sort((a, b) => b.localeCompare(a))
        .map((year) => ({
            year,
            booksFinished: finishedByYear.get(year) ?? 0,
            activeDays: activeDaysByYear.get(year) ?? 0,
            pagesRead: pagesByYear.get(year) ?? 0,
        }));
}

async function getReadingCalendar(db: D1Database, userId: number): Promise<CalendarDay[]> {
    const rows = await db
        .prepare("SELECT activity_date, event_count FROM reading_activity WHERE user_id = ? AND activity_date >= date('now', ?) ORDER BY activity_date ASC")
        .bind(userId, `-${CALENDAR_DAYS} days`)
        .all<{ activity_date: string; event_count: number }>();
    return rows.results.map((row) => ({ date: row.activity_date, count: row.event_count }));
}

async function getBooksFinishedInYear(db: D1Database, userId: number, year: string): Promise<number> {
    const row = await db
        .prepare("SELECT COUNT(*) AS total FROM reading_progress WHERE user_id = ? AND percentage >= 100 AND strftime('%Y', last_opened) = ?")
        .bind(userId, year)
        .first<{ total: number }>();
    return row?.total ?? 0;
}

export async function getReadingGoal(db: D1Database, userId: number): Promise<ReadingGoal> {
    const currentYear = new Date().getUTCFullYear().toString();
    const [settingsRow, booksFinishedThisYear] = await Promise.all([
        db.prepare("SELECT reading_goal_books FROM user_settings WHERE user_id = ?").bind(userId).first<{ reading_goal_books: number | null }>(),
        getBooksFinishedInYear(db, userId, currentYear),
    ]);
    return { targetBooks: settingsRow?.reading_goal_books ?? null, booksFinishedThisYear };
}

export async function setReadingGoal(db: D1Database, userId: number, targetBooks: number | null): Promise<ReadingGoal> {
    await db.prepare("UPDATE user_settings SET reading_goal_books = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(targetBooks, userId).run();
    return getReadingGoal(db, userId);
}

export async function getStatistics(db: D1Database, userId: number): Promise<Statistics> {
    const [booksReadRow, booksInProgressRow, allProgress, recentProgress, yearlyOverview, readingCalendar, goal] = await Promise.all([
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
        getYearlyOverview(db, userId),
        getReadingCalendar(db, userId),
        getReadingGoal(db, userId),
    ]);

    const activityDatesRow = await db.prepare("SELECT activity_date FROM reading_activity WHERE user_id = ? ORDER BY activity_date ASC").bind(userId).all<{ activity_date: string }>();
    const streaks = computeStreaks(activityDatesRow.results.map((r) => r.activity_date));

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
        book: toSummary(book, userId),
        percentage: row.percentage,
        lastOpened: row.last_opened,
    }));

    return {
        booksRead: booksReadRow?.total ?? 0,
        booksInProgress: booksInProgressRow?.total ?? 0,
        pagesRead,
        genreBreakdown,
        recentActivity,
        yearlyOverview,
        readingCalendar,
        streaks,
        goal,
    };
}
