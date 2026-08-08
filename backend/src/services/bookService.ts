// Book model, R2 storage, and library browsing — see documentation/Architecture.md
// ("File storage" / "Upload limits" rows) and documentation/Database.md for the
// full schema. R2 key layout: books/{book-id}/original.{ext}, books/{book-id}/cover.{ext}.

import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";
import { recordBookPublicActivity } from "./activityService";

export class NotFoundError extends Error {}
export { ValidationError };

const ALLOWED_BOOK_EXTENSIONS = ["epub", "pdf", "txt", "md"] as const;
const MAX_BOOK_FILE_BYTES = 50 * 1024 * 1024; // benchmarked against real workerd, see documentation/Architecture.md

const BOOK_MIME_HINTS: Record<string, string[]> = {
    epub: ["application/epub+zip"],
    pdf: ["application/pdf"],
    // txt/md MIME types are inconsistent across browsers/OSes -- extension is
    // authoritative for these, MIME is only checked for the ones above.
    txt: [],
    md: [],
};

const SORT_COLUMNS: Record<string, string> = {
    createdAt: "created_at",
    title: "title",
    author: "author",
};

function r2BookKey(bookId: number, ext: string): string {
    return `books/${bookId}/original.${ext}`;
}

function r2CoverKey(bookId: number, ext: string): string {
    return `books/${bookId}/cover.${ext}`;
}

export type BookSummary = {
    id: number;
    title: string;
    author: string | null;
    coverUrl: string | null;
    genre: string | null;
    language: string | null;
    visibility: string;
    // Only meaningful when visibility is SHARED -- whether a person NOT on
    // this book's share list (book_shares, migration 0017) still sees the
    // cover+description teaser on the owner's public profile. See
    // getBookCoverObject/listPublicBooksByUsername for the enforcement.
    sharedTeaserVisible: boolean;
    createdAt: string;
    isFavorite: boolean;
    // Edit/delete/favorite/shelve are all owner-only server-side (see
    // findOwnedBookRow) -- the frontend had no way to know that and showed
    // Bearbeiten/Löschen/the favorite star to a SHARED-book borrower too,
    // even though every one of those calls would 404. Computed per-viewer
    // rather than trusting the client to compare ids itself.
    isOwner: boolean;
};

export type BookDetail = BookSummary & {
    description: string | null;
    isbn: string | null;
    publisher: string | null;
    releaseDate: string | null;
    pages: number | null;
    tags: string[];
    file: { format: string; size: number } | null;
};

export type BookRow = {
    id: number;
    title: string;
    author: string | null;
    description: string | null;
    cover_url: string | null;
    genre: string | null;
    language: string | null;
    visibility: string;
    shared_teaser_visible: number;
    created_at: string;
    is_favorite: number;
    owner_id: number;
};

// `is_favorite` is a correlated subquery against `books.owner_id` rather than
// a bind parameter: every query using this column is already owner-scoped
// (`WHERE owner_id = ?`/`id = ? AND owner_id = ?`), so `favorites.user_id`
// and `books.owner_id` are always the same value here -- no extra param needed.
// Exported so shelfService.ts's listShelfBooks can reuse it -- shelf_books
// membership queries are owner-scoped the same way (a book can only be on a
// shelf its owner also owns, enforced by addBookToShelf's ownership check).
export const BOOK_ROW_COLUMNS = `id, title, author, description, cover_url, genre, language, visibility, shared_teaser_visible, created_at, owner_id,
    EXISTS (SELECT 1 FROM favorites WHERE book_id = books.id AND user_id = books.owner_id) AS is_favorite`;

export function toSummary(row: BookRow, viewerId: number): BookSummary {
    return {
        id: row.id,
        title: row.title,
        author: row.author,
        coverUrl: row.cover_url ? `/api/books/${row.id}/cover` : null,
        genre: row.genre,
        language: row.language,
        visibility: row.visibility,
        sharedTeaserVisible: !!row.shared_teaser_visible,
        createdAt: row.created_at,
        isFavorite: !!row.is_favorite,
        isOwner: row.owner_id === viewerId,
    };
}

async function loadDetail(db: D1Database, row: BookRow, viewerId: number): Promise<BookDetail> {
    const [metadata, tagRows, fileRow] = await Promise.all([
        db
            .prepare("SELECT isbn, publisher, release_date, pages FROM book_metadata WHERE book_id = ?")
            .bind(row.id)
            .first<{ isbn: string | null; publisher: string | null; release_date: string | null; pages: number | null }>(),
        db
            .prepare("SELECT tags.name FROM tags JOIN book_tags ON book_tags.tag_id = tags.id WHERE book_tags.book_id = ?")
            .bind(row.id)
            .all<{ name: string }>(),
        db.prepare("SELECT format, size FROM book_files WHERE book_id = ? ORDER BY id DESC LIMIT 1").bind(row.id).first<{ format: string; size: number }>(),
    ]);

    return {
        ...toSummary(row, viewerId),
        description: row.description,
        isbn: metadata?.isbn ?? null,
        publisher: metadata?.publisher ?? null,
        releaseDate: metadata?.release_date ?? null,
        pages: metadata?.pages ?? null,
        tags: tagRows.results.map((t) => t.name),
        file: fileRow ? { format: fileRow.format, size: fileRow.size } : null,
    };
}

export type CreateBookInput = {
    title: string;
    author?: string;
    description?: string;
    genre?: string;
    language?: string;
    isbn?: string;
    publisher?: string;
    releaseDate?: string;
    pages?: number;
    tags: string[];
    file: File;
    cover?: File;
};

async function findOrCreateTagIds(db: D1Database, tagNames: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of tagNames) {
        await db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name).run();
        const row = await db.prepare("SELECT id FROM tags WHERE name = ?").bind(name).first<{ id: number }>();
        if (row) ids.push(row.id);
    }
    return ids;
}

export async function createBook(db: D1Database, storage: R2Bucket, ownerId: number, input: CreateBookInput): Promise<BookDetail> {
    if (!input.title.trim()) throw new ValidationError("title is required.");

    const bookExt = validateFile(input.file, ALLOWED_BOOK_EXTENSIONS, BOOK_MIME_HINTS, MAX_BOOK_FILE_BYTES, "Book file");
    const coverExt = input.cover ? validateFile(input.cover, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Cover image") : null;

    const insertBook = await db
        .prepare(
            `INSERT INTO books (owner_id, title, author, description, cover_url, language, genre, visibility)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PRIVATE')`
        )
        .bind(
            ownerId,
            input.title,
            input.author ?? null,
            input.description ?? null,
            null, // cover_url is set below once the book id (and therefore the R2 key) is known
            input.language ?? null,
            input.genre ?? null
        )
        .run();
    const bookId = insertBook.meta.last_row_id as number;

    try {
        const bookKey = r2BookKey(bookId, bookExt);
        const coverKey = coverExt ? r2CoverKey(bookId, coverExt) : null;

        await storage.put(bookKey, await input.file.arrayBuffer(), { httpMetadata: { contentType: input.file.type || undefined } });
        if (input.cover && coverKey) {
            await storage.put(coverKey, await input.cover.arrayBuffer(), { httpMetadata: { contentType: input.cover.type || undefined } });
        }

        if (coverKey) {
            await db.prepare("UPDATE books SET cover_url = ? WHERE id = ?").bind(coverKey, bookId).run();
        }

        await db
            .prepare("INSERT INTO book_files (book_id, file_url, format, size) VALUES (?, ?, ?, ?)")
            .bind(bookId, bookKey, bookExt.toUpperCase(), input.file.size)
            .run();

        if (input.isbn || input.publisher || input.releaseDate || input.pages !== undefined) {
            await db
                .prepare("INSERT INTO book_metadata (book_id, isbn, publisher, release_date, pages) VALUES (?, ?, ?, ?, ?)")
                .bind(bookId, input.isbn ?? null, input.publisher ?? null, input.releaseDate ?? null, input.pages ?? null)
                .run();
        }

        if (input.tags.length > 0) {
            const tagIds = await findOrCreateTagIds(db, input.tags);
            for (const tagId of tagIds) {
                await db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)").bind(bookId, tagId).run();
            }
        }
    } catch (err) {
        await db.prepare("DELETE FROM book_tags WHERE book_id = ?").bind(bookId).run();
        await db.prepare("DELETE FROM book_metadata WHERE book_id = ?").bind(bookId).run();
        await db.prepare("DELETE FROM book_files WHERE book_id = ?").bind(bookId).run();
        await db.prepare("DELETE FROM books WHERE id = ?").bind(bookId).run();
        throw err;
    }

    const detail = await getBook(db, ownerId, bookId);
    if (!detail) throw new Error("Book disappeared right after creation.");
    return detail;
}

export type ListBooksQuery = {
    page: number;
    pageSize: number;
    genre?: string;
    tag?: string;
    favorite?: boolean;
    search?: string;
    sort: string;
    order: "asc" | "desc";
};

export type BookListResult = { items: BookSummary[]; total: number; page: number; pageSize: number };

// Splits a comma-separated query value into trimmed, non-empty parts --
// shared by the genre/tag multi-value filters below. A single value (no
// comma) still goes through this, so the single- and multi-value cases use
// the exact same query-building path rather than two separate branches.
function parseCommaList(value: string): string[] {
    return value
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
}

function placeholders(count: number): string {
    return Array(count).fill("?").join(", ");
}

export async function listBooks(db: D1Database, ownerId: number, query: ListBooksQuery): Promise<BookListResult> {
    const conditions = ["owner_id = ?"];
    const params: unknown[] = [ownerId];

    if (query.genre) {
        const genres = parseCommaList(query.genre);
        if (genres.length > 0) {
            conditions.push(`genre IN (${placeholders(genres.length)})`);
            params.push(...genres);
        }
    }
    if (query.tag) {
        const tags = parseCommaList(query.tag);
        if (tags.length > 0) {
            conditions.push(
                `EXISTS (SELECT 1 FROM book_tags JOIN tags ON tags.id = book_tags.tag_id WHERE book_tags.book_id = books.id AND tags.name IN (${placeholders(tags.length)}))`
            );
            params.push(...tags);
        }
    }
    if (query.favorite) {
        conditions.push("EXISTS (SELECT 1 FROM favorites WHERE book_id = books.id AND user_id = books.owner_id)");
    }
    if (query.search) {
        conditions.push("(title LIKE ? OR author LIKE ?)");
        const like = `%${query.search}%`;
        params.push(like, like);
    }

    const whereClause = conditions.join(" AND ");
    const sortColumn = SORT_COLUMNS[query.sort] ?? SORT_COLUMNS.createdAt;
    const offset = (query.page - 1) * query.pageSize;

    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT ${BOOK_ROW_COLUMNS} FROM books
                 WHERE ${whereClause} ORDER BY ${sortColumn} ${query.order.toUpperCase()} LIMIT ? OFFSET ?`
            )
            .bind(...params, query.pageSize, offset)
            .all<BookRow>(),
        db.prepare(`SELECT COUNT(*) AS total FROM books WHERE ${whereClause}`).bind(...params).first<{ total: number }>(),
    ]);

    return {
        items: rows.results.map((row) => toSummary(row, ownerId)),
        total: countRow?.total ?? 0,
        page: query.page,
        pageSize: query.pageSize,
    };
}

export type BookFacets = { tags: string[]; genres: string[] };

// Powers the Library page's multi-select filter dropdowns -- only the
// values the caller has actually used, not every tag/genre in the system.
export async function getFacets(db: D1Database, ownerId: number): Promise<BookFacets> {
    const [tagRows, genreRows] = await Promise.all([
        db
            .prepare(
                `SELECT DISTINCT tags.name AS name FROM tags
                 JOIN book_tags ON book_tags.tag_id = tags.id
                 JOIN books ON books.id = book_tags.book_id
                 WHERE books.owner_id = ? ORDER BY tags.name ASC`
            )
            .bind(ownerId)
            .all<{ name: string }>(),
        db
            .prepare("SELECT DISTINCT genre AS name FROM books WHERE owner_id = ? AND genre IS NOT NULL AND genre != '' ORDER BY genre ASC")
            .bind(ownerId)
            .all<{ name: string }>(),
    ]);

    return {
        tags: tagRows.results.map((row) => row.name),
        genres: genreRows.results.map((row) => row.name),
    };
}

async function findOwnedBookRow(db: D1Database, ownerId: number, bookId: number): Promise<BookRow | null> {
    return db
        .prepare(`SELECT ${BOOK_ROW_COLUMNS} FROM books WHERE id = ? AND owner_id = ?`)
        .bind(bookId, ownerId)
        .first<BookRow>();
}

// Community "borrowed reading" (issue #316/v3.1, semantics swapped by
// issue #321/v3.2): a logged-in caller can read (not edit/delete/favorite/
// shelve) a book they don't own if it's PUBLIC (any logged-in user), or if
// it's SHARED and they're on that book's explicit share list (book_shares,
// migration 0017). This is the single source of truth for that rule --
// findAccessibleBookRow, isAccessibleByUser (readingService.ts/
// bookmarkService.ts each have their own copy today, unfortunately) and
// isBookAccessibleTo (commentService.ts) all need to agree on it, and it
// has already changed twice in two days (v3.1 then v3.2's swap). Every
// consumer binds bookId first, then callerId (owner check), then callerId
// again (share-list check).
const BOOK_ACCESS_WHERE = `id = ? AND (
    owner_id = ?
    OR visibility = 'PUBLIC'
    OR (visibility = 'SHARED' AND EXISTS (SELECT 1 FROM book_shares WHERE book_id = books.id AND user_id = ?))
)`;

// Can't reuse BOOK_ROW_COLUMNS here: its is_favorite subquery is correlated
// against books.owner_id, which is only correct when the caller IS the
// owner (true for every other use of that constant). A borrower reading
// someone else's book would otherwise see the *owner's* favorite flag
// mislabeled as their own -- favoriting stays owner-only, so a borrower
// must always see is_favorite computed against their own (necessarily
// absent) row, not leak the owner's. Only getBook and getBookFileObject use
// this -- every mutating function keeps using findOwnedBookRow above,
// strictly owner-only.
async function findAccessibleBookRow(db: D1Database, callerId: number, bookId: number): Promise<BookRow | null> {
    return db
        .prepare(
            `SELECT id, title, author, description, cover_url, genre, language, visibility, shared_teaser_visible, created_at, owner_id,
                EXISTS (SELECT 1 FROM favorites WHERE book_id = books.id AND user_id = ?) AS is_favorite
             FROM books
             WHERE ${BOOK_ACCESS_WHERE}`
        )
        .bind(callerId, bookId, callerId, callerId)
        .first<BookRow>();
}

// Same access rule as findAccessibleBookRow, exposed as a boolean check for
// commentService.ts -- deliberately not exporting findAccessibleBookRow
// itself, since its BookRow return type carries is_favorite and other
// fields a comment gate has no business seeing.
export async function isBookAccessibleTo(db: D1Database, callerId: number, bookId: number): Promise<boolean> {
    const row = await db
        .prepare(`SELECT 1 FROM books WHERE ${BOOK_ACCESS_WHERE}`)
        .bind(bookId, callerId, callerId)
        .first();
    return row !== null;
}

// For commentService.ts's delete authorization (comment author OR the
// commented-on book's owner). Null means the book no longer exists.
export async function getBookOwnerId(db: D1Database, bookId: number): Promise<number | null> {
    const row = await db.prepare("SELECT owner_id FROM books WHERE id = ?").bind(bookId).first<{ owner_id: number }>();
    return row?.owner_id ?? null;
}

export async function addFavorite(db: D1Database, ownerId: number, bookId: number): Promise<void> {
    if (!(await findOwnedBookRow(db, ownerId, bookId))) throw new NotFoundError();
    await db.prepare("INSERT OR IGNORE INTO favorites (user_id, book_id) VALUES (?, ?)").bind(ownerId, bookId).run();
}

export async function removeFavorite(db: D1Database, ownerId: number, bookId: number): Promise<void> {
    if (!(await findOwnedBookRow(db, ownerId, bookId))) throw new NotFoundError();
    await db.prepare("DELETE FROM favorites WHERE user_id = ? AND book_id = ?").bind(ownerId, bookId).run();
}

// callerId, not ownerId: this is also the read path for a SHARED book
// belonging to someone else (see findAccessibleBookRow above). Callers that
// need strict ownership (updateBook/deleteBook/etc.) verify that themselves
// via findOwnedBookRow before ever reaching this function.
export async function getBook(db: D1Database, callerId: number, bookId: number): Promise<BookDetail | null> {
    const row = await findAccessibleBookRow(db, callerId, bookId);
    return row ? loadDetail(db, row, callerId) : null;
}

const VISIBILITY_VALUES = ["PRIVATE", "SHARED", "PUBLIC"] as const;

export type UpdateBookInput = {
    title?: string;
    author?: string;
    description?: string;
    genre?: string;
    language?: string;
    isbn?: string;
    publisher?: string;
    releaseDate?: string;
    pages?: number;
    tags?: string[];
    visibility?: string;
    // Only meaningful when visibility is (or becomes) SHARED -- see
    // BookSummary.sharedTeaserVisible.
    sharedTeaserVisible?: boolean;
};

export async function updateBook(db: D1Database, ownerId: number, bookId: number, input: UpdateBookInput): Promise<BookDetail> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row) throw new NotFoundError();
    if (input.visibility !== undefined && !VISIBILITY_VALUES.includes(input.visibility as (typeof VISIBILITY_VALUES)[number])) {
        throw new ValidationError(`visibility must be one of ${VISIBILITY_VALUES.join(", ")}.`);
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of [
        ["title", input.title],
        ["author", input.author],
        ["description", input.description],
        ["genre", input.genre],
        ["language", input.language],
        ["visibility", input.visibility],
        ["shared_teaser_visible", input.sharedTeaserVisible === undefined ? undefined : input.sharedTeaserVisible ? 1 : 0],
    ] as const) {
        if (value !== undefined) {
            sets.push(`${column} = ?`);
            values.push(value);
        }
    }
    if (sets.length > 0) {
        sets.push("updated_at = CURRENT_TIMESTAMP");
        values.push(bookId);
        await db.prepare(`UPDATE books SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    // Log only the transition INTO PUBLIC, not every edit made while a book
    // stays PUBLIC.
    if (input.visibility === "PUBLIC" && row.visibility !== "PUBLIC") {
        await recordBookPublicActivity(db, ownerId, bookId);
    }

    if (input.isbn !== undefined || input.publisher !== undefined || input.releaseDate !== undefined || input.pages !== undefined) {
        await db
            .prepare(
                `INSERT INTO book_metadata (book_id, isbn, publisher, release_date, pages) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(book_id) DO UPDATE SET
                    isbn = excluded.isbn, publisher = excluded.publisher, release_date = excluded.release_date, pages = excluded.pages`
            )
            .bind(bookId, input.isbn ?? null, input.publisher ?? null, input.releaseDate ?? null, input.pages ?? null)
            .run();
    }

    if (input.tags !== undefined) {
        await db.prepare("DELETE FROM book_tags WHERE book_id = ?").bind(bookId).run();
        if (input.tags.length > 0) {
            const tagIds = await findOrCreateTagIds(db, input.tags);
            for (const tagId of tagIds) {
                await db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)").bind(bookId, tagId).run();
            }
        }
    }

    const detail = await getBook(db, ownerId, bookId);
    if (!detail) throw new Error("Book disappeared during update.");
    return detail;
}

// Separate from updateBook (JSON metadata only) since a cover replace is a
// multipart upload -- mirrors createBook's cover-handling, plus best-effort
// cleanup of the old R2 object (the extension can change between covers).
export async function updateBookCover(db: D1Database, storage: R2Bucket, ownerId: number, bookId: number, cover: File): Promise<BookDetail> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row) throw new NotFoundError();

    const coverExt = validateFile(cover, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Cover image");
    const coverKey = r2CoverKey(bookId, coverExt);
    const previousCoverKey = row.cover_url;

    await storage.put(coverKey, await cover.arrayBuffer(), { httpMetadata: { contentType: cover.type || undefined } });
    await db.prepare("UPDATE books SET cover_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(coverKey, bookId).run();

    if (previousCoverKey && previousCoverKey !== coverKey) {
        await storage.delete(previousCoverKey).catch((err) => {
            console.error(`Failed to delete old R2 cover ${previousCoverKey} after replacing book ${bookId}'s cover:`, err);
        });
    }

    const detail = await getBook(db, ownerId, bookId);
    if (!detail) throw new Error("Book disappeared during cover update.");
    return detail;
}

export async function deleteBook(db: D1Database, storage: R2Bucket, ownerId: number, bookId: number): Promise<void> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row) throw new NotFoundError();

    const fileRow = await db.prepare("SELECT file_url FROM book_files WHERE book_id = ?").bind(bookId).first<{ file_url: string }>();

    await db.batch([
        db.prepare("DELETE FROM reading_progress WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM bookmarks WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM book_tags WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM book_metadata WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM book_files WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM favorites WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM shelf_books WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM project_books WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM ratings WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM book_shares WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM profile_activities WHERE target_type = 'BOOK' AND target_id = ?").bind(bookId),
        db.prepare("DELETE FROM comments WHERE target_type = 'BOOK' AND target_id = ?").bind(bookId),
        db.prepare("DELETE FROM books WHERE id = ?").bind(bookId),
    ]);

    const keysToDelete = [fileRow?.file_url, row.cover_url].filter((key): key is string => !!key);
    await Promise.all(
        keysToDelete.map((key) =>
            storage.delete(key).catch((err) => {
                // Best-effort: R2 can't participate in the D1 transaction above, and an
                // orphaned object isn't worth building a cleanup job for at this scale.
                console.error(`Failed to delete R2 object ${key} after deleting book ${bookId}:`, err);
            })
        )
    );
}

export async function getBookFileObject(db: D1Database, storage: R2Bucket, callerId: number, bookId: number): Promise<{ object: R2ObjectBody; format: string } | null> {
    const row = await findAccessibleBookRow(db, callerId, bookId);
    if (!row) return null;
    const fileRow = await db.prepare("SELECT file_url, format FROM book_files WHERE book_id = ?").bind(bookId).first<{ file_url: string; format: string }>();
    if (!fileRow) return null;
    const object = await storage.get(fileRow.file_url);
    return object ? { object, format: fileRow.format } : null;
}

// viewerId is nullable here (unlike every other function in this file) --
// this is the one route reachable while logged out (optionalAuth, not
// requireAuth), since a PUBLIC book's cover has to render on its owner's
// public profile (issue #300) for a visitor with no session at all.
// SHARED's teaser visibility depends on shared_teaser_visible (issue #321,
// migration 0017) -- when off, only the owner and people on the book's
// share list still see the cover; everyone else (including anonymous) gets
// nothing, same as PRIVATE.
export async function getBookCoverObject(db: D1Database, storage: R2Bucket, viewerId: number | null, bookId: number): Promise<R2ObjectBody | null> {
    const row = await db.prepare("SELECT cover_url, owner_id, visibility, shared_teaser_visible FROM books WHERE id = ?").bind(bookId).first<{
        cover_url: string | null;
        owner_id: number;
        visibility: string;
        shared_teaser_visible: number;
    }>();
    if (!row || !row.cover_url) return null;
    if (row.owner_id === viewerId || row.visibility === "PUBLIC") return storage.get(row.cover_url);
    if (row.visibility === "SHARED") {
        if (row.shared_teaser_visible) return storage.get(row.cover_url);
        if (viewerId === null) return null;
        const shared = await db.prepare("SELECT 1 FROM book_shares WHERE book_id = ? AND user_id = ?").bind(bookId, viewerId).first();
        return shared ? storage.get(row.cover_url) : null;
    }
    return null;
}

export type PublicBookSummary = {
    id: number;
    title: string;
    author: string | null;
    description: string | null;
    coverUrl: string | null;
    genre: string | null;
    language: string | null;
    visibility: string;
    canRead: boolean;
    averageRating: number | null;
    ratingCount: number;
    myRating: number | null;
};

// Community Phase 1 (issue #300) -- deliberately excludes owner_id,
// is_favorite, and every field only meaningful to the owner.
// Community Phase 3 (issue #307) added viewerId (nullable, same pattern as
// followService.getFollowState) and the rating aggregate/myRating columns --
// binding a null viewerId into `ratings.user_id = ?` never matches any row,
// so an anonymous visitor correctly always gets myRating: null with no
// branching needed.
// v3.2 (issue #321) swapped PUBLIC/SHARED semantics: PUBLIC now grants full
// read to any logged-in user, SHARED is gated by an explicit per-book share
// list (book_shares, migration 0017) with a shared_teaser_visible toggle
// for whether non-listed people still see the cover+description teaser.
// Share-list membership isn't visible to the frontend, so this returns a
// computed `canRead` per book -- the frontend keys the "Lesen" button off
// that instead of raw `visibility`. Ratings stay PUBLIC-only by design (see
// ratingService.ts's NotPublicError) -- a SHARED book always reports
// averageRating: null, ratingCount: 0, myRating: null.
export async function listPublicBooksByUsername(db: D1Database, username: string, viewerId: number | null): Promise<PublicBookSummary[]> {
    const rows = await db
        .prepare(
            `SELECT books.id, books.title, books.author, books.description, books.cover_url, books.genre, books.language, books.visibility,
                (SELECT AVG(rating) FROM ratings WHERE book_id = books.id) AS average_rating,
                (SELECT COUNT(*) FROM ratings WHERE book_id = books.id) AS rating_count,
                (SELECT rating FROM ratings WHERE book_id = books.id AND user_id = ?) AS my_rating,
                CASE
                    WHEN books.owner_id = ? THEN 1
                    WHEN books.visibility = 'PUBLIC' AND ? IS NOT NULL THEN 1
                    WHEN books.visibility = 'SHARED' AND EXISTS (SELECT 1 FROM book_shares WHERE book_id = books.id AND user_id = ?) THEN 1
                    ELSE 0
                END AS can_read
             FROM books JOIN users ON users.id = books.owner_id
             WHERE users.username = ? AND users.deleted_at IS NULL
               AND (
                    books.visibility = 'PUBLIC'
                    OR (books.visibility = 'SHARED' AND (books.shared_teaser_visible = 1 OR EXISTS (SELECT 1 FROM book_shares WHERE book_id = books.id AND user_id = ?)))
               )
             ORDER BY books.created_at DESC`
        )
        .bind(viewerId, viewerId, viewerId, viewerId, username, viewerId)
        .all<{
            id: number;
            title: string;
            author: string | null;
            description: string | null;
            cover_url: string | null;
            genre: string | null;
            language: string | null;
            visibility: string;
            average_rating: number | null;
            rating_count: number;
            my_rating: number | null;
            can_read: number;
        }>();

    return rows.results.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        description: row.description,
        coverUrl: row.cover_url ? `/api/books/${row.id}/cover` : null,
        genre: row.genre,
        language: row.language,
        visibility: row.visibility,
        canRead: !!row.can_read,
        averageRating: row.average_rating,
        ratingCount: row.rating_count,
        myRating: row.my_rating,
    }));
}
