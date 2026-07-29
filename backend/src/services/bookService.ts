// Book model, R2 storage, and library browsing — see documentation/Architecture.md
// ("File storage" / "Upload limits" rows) and documentation/Database.md for the
// full schema. R2 key layout: books/{book-id}/original.{ext}, books/{book-id}/cover.{ext}.

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

const ALLOWED_BOOK_EXTENSIONS = ["epub", "pdf", "txt", "md"] as const;
const ALLOWED_COVER_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
const MAX_BOOK_FILE_BYTES = 50 * 1024 * 1024; // benchmarked against real workerd, see documentation/Architecture.md
const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024;

const BOOK_MIME_HINTS: Record<string, string[]> = {
    epub: ["application/epub+zip"],
    pdf: ["application/pdf"],
    // txt/md MIME types are inconsistent across browsers/OSes -- extension is
    // authoritative for these, MIME is only checked for the ones above.
    txt: [],
    md: [],
};
const COVER_MIME_HINTS: Record<string, string[]> = {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
};

const SORT_COLUMNS: Record<string, string> = {
    createdAt: "created_at",
    title: "title",
    author: "author",
};

function extensionOf(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

function validateFile(file: File, allowedExtensions: readonly string[], mimeHints: Record<string, string[]>, maxBytes: number, label: string): string {
    const ext = extensionOf(file.name);
    if (!allowedExtensions.includes(ext as never)) {
        throw new ValidationError(`${label} must be one of: ${allowedExtensions.join(", ")}.`);
    }
    const hints = mimeHints[ext] ?? [];
    if (hints.length > 0 && file.type && !hints.includes(file.type)) {
        throw new ValidationError(`${label} content does not match its .${ext} extension.`);
    }
    if (file.size > maxBytes) {
        throw new ValidationError(`${label} exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit.`);
    }
    return ext;
}

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
    createdAt: string;
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

type BookRow = {
    id: number;
    title: string;
    author: string | null;
    description: string | null;
    cover_url: string | null;
    genre: string | null;
    language: string | null;
    visibility: string;
    created_at: string;
};

const BOOK_ROW_COLUMNS = "id, title, author, description, cover_url, genre, language, visibility, created_at";

function toSummary(row: BookRow): BookSummary {
    return {
        id: row.id,
        title: row.title,
        author: row.author,
        coverUrl: row.cover_url ? `/api/books/${row.id}/cover` : null,
        genre: row.genre,
        language: row.language,
        visibility: row.visibility,
        createdAt: row.created_at,
    };
}

async function loadDetail(db: D1Database, row: BookRow): Promise<BookDetail> {
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
        ...toSummary(row),
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
    search?: string;
    sort: string;
    order: "asc" | "desc";
};

export type BookListResult = { items: BookSummary[]; total: number; page: number; pageSize: number };

export async function listBooks(db: D1Database, ownerId: number, query: ListBooksQuery): Promise<BookListResult> {
    const conditions = ["owner_id = ?"];
    const params: unknown[] = [ownerId];

    if (query.genre) {
        conditions.push("genre = ?");
        params.push(query.genre);
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
        items: rows.results.map(toSummary),
        total: countRow?.total ?? 0,
        page: query.page,
        pageSize: query.pageSize,
    };
}

async function findOwnedBookRow(db: D1Database, ownerId: number, bookId: number): Promise<BookRow | null> {
    return db
        .prepare(`SELECT ${BOOK_ROW_COLUMNS} FROM books WHERE id = ? AND owner_id = ?`)
        .bind(bookId, ownerId)
        .first<BookRow>();
}

export async function getBook(db: D1Database, ownerId: number, bookId: number): Promise<BookDetail | null> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    return row ? loadDetail(db, row) : null;
}

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
};

export async function updateBook(db: D1Database, ownerId: number, bookId: number, input: UpdateBookInput): Promise<BookDetail> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row) throw new NotFoundError();

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of [
        ["title", input.title],
        ["author", input.author],
        ["description", input.description],
        ["genre", input.genre],
        ["language", input.language],
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

export async function deleteBook(db: D1Database, storage: R2Bucket, ownerId: number, bookId: number): Promise<void> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row) throw new NotFoundError();

    const fileRow = await db.prepare("SELECT file_url FROM book_files WHERE book_id = ?").bind(bookId).first<{ file_url: string }>();

    await db.batch([
        db.prepare("DELETE FROM book_tags WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM book_metadata WHERE book_id = ?").bind(bookId),
        db.prepare("DELETE FROM book_files WHERE book_id = ?").bind(bookId),
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

export async function getBookFileObject(db: D1Database, storage: R2Bucket, ownerId: number, bookId: number): Promise<{ object: R2ObjectBody; format: string } | null> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row) return null;
    const fileRow = await db.prepare("SELECT file_url, format FROM book_files WHERE book_id = ?").bind(bookId).first<{ file_url: string; format: string }>();
    if (!fileRow) return null;
    const object = await storage.get(fileRow.file_url);
    return object ? { object, format: fileRow.format } : null;
}

export async function getBookCoverObject(db: D1Database, storage: R2Bucket, ownerId: number, bookId: number): Promise<R2ObjectBody | null> {
    const row = await findOwnedBookRow(db, ownerId, bookId);
    if (!row || !row.cover_url) return null;
    return storage.get(row.cover_url);
}
