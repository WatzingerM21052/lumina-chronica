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
    // Day detail (0028): pages read that day, or null when no book read
    // that day has a page count (and for every day before 0028); titles of
    // the books read, most progress first.
    pages: number | null;
    books: string[];
};

export type Streaks = {
    currentStreak: number;
    longestStreak: number;
};

// Plan C3 (statistics dashboard): the last 12 months for the line chart,
// zero-filled so the chart always has twelve points. "Finished" uses the
// same rule as the yearly overview (progress reached 100%, dated by
// last_opened); active days come from the reading_activity log.
export type MonthlyOverviewItem = {
    month: string; // YYYY-MM
    booksFinished: number;
    pagesFinished: number;
    activeDays: number;
};

// Estimates from the activity log -- real reading time isn't tracked (see
// the header comment), so the UI labels these as approximate.
export type ReadingPace = {
    pagesPerActiveDay: number | null;
    activeDaysPerBook: number | null;
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
    monthlyOverview: MonthlyOverviewItem[];
    readingPace: ReadingPace;
    calendarYears: number[];
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

const MONTHS = 12;

export function lastMonths(count: number, now: Date = new Date()): string[] {
    const months: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(d.toISOString().slice(0, 7));
    }
    return months;
}

async function getMonthlyOverview(db: D1Database, userId: number): Promise<MonthlyOverviewItem[]> {
    const months = lastMonths(MONTHS);
    const from = `${months[0]}-01`;
    const [finishedRows, activeRows] = await Promise.all([
        db
            .prepare(
                `SELECT strftime('%Y-%m', rp.last_opened) AS month, COUNT(*) AS books, SUM(COALESCE(bm.pages, 0)) AS pages
                 FROM reading_progress rp LEFT JOIN book_metadata bm ON bm.book_id = rp.book_id
                 WHERE rp.user_id = ? AND rp.percentage >= 100 AND rp.last_opened >= ? GROUP BY month`
            )
            .bind(userId, from)
            .all<{ month: string; books: number; pages: number | null }>(),
        db
            .prepare("SELECT strftime('%Y-%m', activity_date) AS month, COUNT(*) AS days FROM reading_activity WHERE user_id = ? AND activity_date >= ? GROUP BY month")
            .bind(userId, from)
            .all<{ month: string; days: number }>(),
    ]);
    const finished = new Map(finishedRows.results.map((r) => [r.month, r]));
    const active = new Map(activeRows.results.map((r) => [r.month, r.days]));
    return months.map((month) => ({
        month,
        booksFinished: finished.get(month)?.books ?? 0,
        pagesFinished: finished.get(month)?.pages ?? 0,
        activeDays: active.get(month) ?? 0,
    }));
}

export function computeReadingPace(pagesRead: number, booksRead: number, activeDays: number): ReadingPace {
    return {
        pagesPerActiveDay: activeDays > 0 ? Math.round(pagesRead / activeDays) : null,
        activeDaysPerBook: booksRead > 0 && activeDays > 0 ? Math.round((activeDays / booksRead) * 10) / 10 : null,
    };
}

async function getReadingCalendar(db: D1Database, userId: number): Promise<CalendarDay[]> {
    return readCalendar(db, userId, "activity_date >= date('now', ?)", [`-${CALENDAR_DAYS} days`]);
}

// Plan C3: the statistics page's year picker shows one calendar year
// (1 January to 31 December) instead of the rolling last 365 days.
export async function getReadingCalendarForYear(db: D1Database, userId: number, year: number): Promise<CalendarDay[]> {
    return readCalendar(db, userId, "activity_date BETWEEN ? AND ?", [`${year}-01-01`, `${year}-12-31`]);
}

type DayBookRow = { activity_date: string; title: string; pages: number | null; start_percentage: number; end_percentage: number };

async function readCalendar(db: D1Database, userId: number, range: string, rangeParams: string[]): Promise<CalendarDay[]> {
    const [days, dayBooks] = await Promise.all([
        db
            .prepare(`SELECT activity_date, event_count FROM reading_activity WHERE user_id = ? AND ${range} ORDER BY activity_date ASC`)
            .bind(userId, ...rangeParams)
            .all<{ activity_date: string; event_count: number }>(),
        db
            .prepare(
                `SELECT rab.activity_date, b.title, m.pages, rab.start_percentage, rab.end_percentage
                 FROM reading_activity_books rab
                 JOIN books b ON b.id = rab.book_id
                 LEFT JOIN book_metadata m ON m.book_id = rab.book_id
                 WHERE rab.user_id = ? AND rab.${range}`
            )
            .bind(userId, ...rangeParams)
            .all<DayBookRow>(),
    ]);

    const detailByDate = new Map<string, DayBookRow[]>();
    for (const row of dayBooks.results) {
        const list = detailByDate.get(row.activity_date) ?? [];
        list.push(row);
        detailByDate.set(row.activity_date, list);
    }

    return days.results.map((row) => ({ date: row.activity_date, count: row.event_count, ...dayDetail(detailByDate.get(row.activity_date) ?? []) }));
}

// Pages = progress made that day x the book's page count; going back in a
// book counts as nothing rather than negative.
export function dayDetail(rows: { title: string; pages: number | null; start_percentage: number; end_percentage: number }[]): { pages: number | null; books: string[] } {
    let pages: number | null = null;
    const withDelta = rows.map((row) => ({ row, delta: Math.max(0, Math.min(100, row.end_percentage) - Math.max(0, row.start_percentage)) }));
    for (const { row, delta } of withDelta) {
        if (row.pages != null && row.pages > 0) {
            pages = (pages ?? 0) + Math.round((delta / 100) * row.pages);
        }
    }
    const books = [...new Set(withDelta.sort((a, b) => b.delta - a.delta).map(({ row }) => row.title))];
    return { pages, books };
}

// Years that have any reading activity, newest first -- the year picker's
// options. Derived from the sorted activity dates getStatistics already loads.
export function activityYears(sortedDates: string[]): number[] {
    return [...new Set(sortedDates.map((date) => Number(date.slice(0, 4))))].filter((year) => Number.isInteger(year)).sort((a, b) => b - a);
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
    const [booksReadRow, booksInProgressRow, allProgress, recentProgress, yearlyOverview, readingCalendar, goal, monthlyOverview] = await Promise.all([
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
        getMonthlyOverview(db, userId),
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

    const booksRead = booksReadRow?.total ?? 0;
    return {
        booksRead,
        booksInProgress: booksInProgressRow?.total ?? 0,
        pagesRead,
        genreBreakdown,
        recentActivity,
        yearlyOverview,
        readingCalendar,
        streaks,
        goal,
        monthlyOverview,
        readingPace: computeReadingPace(pagesRead, booksRead, activityDatesRow.results.length),
        calendarYears: activityYears(activityDatesRow.results.map((r) => r.activity_date)),
    };
}
