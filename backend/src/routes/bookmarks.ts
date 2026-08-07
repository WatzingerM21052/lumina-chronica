import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    NotFoundError,
    createBookmark,
    deleteBookmark,
    listBookmarks,
    updateBookmarkNote,
    type CreateBookmarkInput,
} from "../services/bookmarkService";

export const bookmarksRoute = new Hono<AppEnv>();

bookmarksRoute.get("/:bookId", requireAuth, async (c) => {
    const bookId = Number(c.req.param("bookId"));
    try {
        const bookmarks = await listBookmarks(c.env.DB, c.get("userId"), bookId);
        return c.json(success(bookmarks));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});

bookmarksRoute.post("/", requireAuth, async (c) => {
    const body = await c.req.json<Partial<CreateBookmarkInput>>().catch(() => null);
    if (!body || typeof body.bookId !== "number" || typeof body.percentage !== "number") {
        return c.json(failure("VALIDATION_ERROR", "bookId and percentage are required."), 400);
    }

    try {
        const bookmark = await createBookmark(c.env.DB, c.get("userId"), {
            bookId: body.bookId,
            chapter: body.chapter ?? null,
            position: body.position ?? null,
            percentage: body.percentage,
            note: body.note ?? null,
        });
        return c.json(success(bookmark), 201);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});

bookmarksRoute.put("/:id", requireAuth, async (c) => {
    const bookmarkId = Number(c.req.param("id"));
    const body = await c.req.json<{ note?: string | null }>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const bookmark = await updateBookmarkNote(c.env.DB, c.get("userId"), bookmarkId, body.note ?? null);
        return c.json(success(bookmark));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Bookmark not found."), 404);
        throw err;
    }
});

bookmarksRoute.delete("/:id", requireAuth, async (c) => {
    const bookmarkId = Number(c.req.param("id"));
    try {
        await deleteBookmark(c.env.DB, c.get("userId"), bookmarkId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Bookmark not found."), 404);
        throw err;
    }
});
