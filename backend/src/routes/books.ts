import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    NotFoundError,
    ValidationError,
    addFavorite,
    createBook,
    deleteBook,
    getBook,
    getBookCoverObject,
    getBookFileObject,
    getFacets,
    listBooks,
    removeFavorite,
    updateBook,
    updateBookCover,
    type CreateBookInput,
    type UpdateBookInput,
} from "../services/bookService";
import { listShelfIdsForBook } from "../services/shelfService";

export const booksRoute = new Hono<AppEnv>();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SORTABLE_FIELDS = new Set(["createdAt", "title", "author"]);

function parseTags(raw: unknown): string[] {
    if (typeof raw !== "string" || !raw.trim()) return [];
    return raw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

function parsePages(raw: unknown): number | undefined {
    if (typeof raw !== "string" || !raw.trim()) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}

booksRoute.post("/upload", requireAuth, async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid multipart request body."), 400);

    const title = typeof body.title === "string" ? body.title : "";
    const file = body.file instanceof File ? body.file : null;
    const cover = body.cover instanceof File ? body.cover : undefined;

    if (!title.trim() || !file) {
        return c.json(failure("VALIDATION_ERROR", "title and file are required."), 400);
    }

    const input: CreateBookInput = {
        title,
        author: typeof body.author === "string" ? body.author : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        genre: typeof body.genre === "string" ? body.genre : undefined,
        language: typeof body.language === "string" ? body.language : undefined,
        isbn: typeof body.isbn === "string" ? body.isbn : undefined,
        publisher: typeof body.publisher === "string" ? body.publisher : undefined,
        releaseDate: typeof body.releaseDate === "string" ? body.releaseDate : undefined,
        pages: parsePages(body.pages),
        tags: parseTags(body.tags),
        file,
        cover,
    };

    try {
        const book = await createBook(c.env.DB, c.env.STORAGE, c.get("userId"), input);
        return c.json(success(book), 201);
    } catch (err) {
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

booksRoute.get("/", requireAuth, async (c) => {
    const q = c.req.query();
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || DEFAULT_PAGE_SIZE));
    const sort = SORTABLE_FIELDS.has(q.sort) ? q.sort : "createdAt";
    const order = q.order === "asc" ? "asc" : "desc";

    const result = await listBooks(c.env.DB, c.get("userId"), {
        page,
        pageSize,
        genre: q.genre || undefined,
        tag: q.tag || undefined,
        favorite: q.favorite === "true",
        search: q.search || undefined,
        sort,
        order,
    });
    return c.json(success(result));
});

booksRoute.get("/facets", requireAuth, async (c) => {
    const facets = await getFacets(c.env.DB, c.get("userId"));
    return c.json(success(facets));
});

booksRoute.get("/:id", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await getBook(c.env.DB, c.get("userId"), bookId);
    if (!book) return c.json(failure("NOT_FOUND", "Book not found."), 404);
    return c.json(success(book));
});

booksRoute.put("/:id", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    const body = await c.req.json<UpdateBookInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const book = await updateBook(c.env.DB, c.get("userId"), bookId, body);
        return c.json(success(book));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

booksRoute.put("/:id/cover", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    const cover = body?.cover instanceof File ? body.cover : null;
    if (!cover) return c.json(failure("VALIDATION_ERROR", "cover is required."), 400);

    try {
        const book = await updateBookCover(c.env.DB, c.env.STORAGE, c.get("userId"), bookId, cover);
        return c.json(success(book));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

booksRoute.delete("/:id", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    try {
        await deleteBook(c.env.DB, c.env.STORAGE, c.get("userId"), bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});

booksRoute.post("/:id/favorite", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    try {
        await addFavorite(c.env.DB, c.get("userId"), bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});

booksRoute.delete("/:id/favorite", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    try {
        await removeFavorite(c.env.DB, c.get("userId"), bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});

// Used by Book Detail's "add to shelf" picker to render each shelf's
// checkbox state.
booksRoute.get("/:id/shelves", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await getBook(c.env.DB, c.get("userId"), bookId);
    if (!book) return c.json(failure("NOT_FOUND", "Book not found."), 404);

    const shelfIds = await listShelfIdsForBook(c.env.DB, c.get("userId"), bookId);
    return c.json(success(shelfIds));
});

const CONTENT_TYPES: Record<string, string> = {
    EPUB: "application/epub+zip",
    PDF: "application/pdf",
    TXT: "text/plain",
    MD: "text/markdown",
};

booksRoute.get("/:id/file", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    const result = await getBookFileObject(c.env.DB, c.env.STORAGE, c.get("userId"), bookId);
    if (!result) return c.json(failure("NOT_FOUND", "Book file not found."), 404);

    return c.body(result.object.body, 200, {
        "Content-Type": CONTENT_TYPES[result.format] ?? "application/octet-stream",
    });
});

booksRoute.get("/:id/cover", requireAuth, async (c) => {
    const bookId = Number(c.req.param("id"));
    const object = await getBookCoverObject(c.env.DB, c.env.STORAGE, c.get("userId"), bookId);
    if (!object) return c.json(failure("NOT_FOUND", "Cover not found."), 404);

    return c.body(object.body, 200, {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    });
});
