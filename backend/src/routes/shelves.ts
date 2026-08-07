import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { fileResponse } from "../utils/fileResponse";
import {
    NotFoundError,
    ValidationError,
    addBookToShelf,
    createShelf,
    deleteShelf,
    getShelf,
    getShelfCoverObject,
    listShelfBooks,
    listShelves,
    removeBookFromShelf,
    updateShelf,
    updateShelfCover,
    type CreateShelfInput,
    type UpdateShelfInput,
} from "../services/shelfService";

export const shelvesRoute = new Hono<AppEnv>();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

shelvesRoute.post("/", requireAuth, async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid multipart request body."), 400);

    const name = typeof body.name === "string" ? body.name : "";
    const cover = body.cover instanceof File ? body.cover : undefined;

    const input: CreateShelfInput = {
        name,
        description: typeof body.description === "string" ? body.description : undefined,
        cover,
    };

    try {
        const shelf = await createShelf(c.env.DB, c.env.STORAGE, c.get("userId"), input);
        return c.json(success(shelf), 201);
    } catch (err) {
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

shelvesRoute.get("/", requireAuth, async (c) => {
    const shelves = await listShelves(c.env.DB, c.get("userId"));
    return c.json(success(shelves));
});

shelvesRoute.get("/:id", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    try {
        const shelf = await getShelf(c.env.DB, c.get("userId"), shelfId);
        return c.json(success(shelf));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf not found."), 404);
        throw err;
    }
});

shelvesRoute.put("/:id", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    const body = await c.req.json<UpdateShelfInput>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);

    try {
        const shelf = await updateShelf(c.env.DB, c.get("userId"), shelfId, body);
        return c.json(success(shelf));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

shelvesRoute.put("/:id/cover", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    const body = await c.req.parseBody().catch(() => null);
    const cover = body?.cover instanceof File ? body.cover : null;
    if (!cover) return c.json(failure("VALIDATION_ERROR", "cover is required."), 400);

    try {
        const shelf = await updateShelfCover(c.env.DB, c.env.STORAGE, c.get("userId"), shelfId, cover);
        return c.json(success(shelf));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf not found."), 404);
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
});

shelvesRoute.delete("/:id", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    try {
        await deleteShelf(c.env.DB, c.env.STORAGE, c.get("userId"), shelfId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf not found."), 404);
        throw err;
    }
});

shelvesRoute.get("/:id/cover", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    const object = await getShelfCoverObject(c.env.DB, c.env.STORAGE, c.get("userId"), shelfId);
    if (!object) return c.json(failure("NOT_FOUND", "Cover not found."), 404);

    return fileResponse(c, object.body, object.httpMetadata?.contentType ?? "application/octet-stream");
});

shelvesRoute.get("/:id/books", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    const q = c.req.query();
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || DEFAULT_PAGE_SIZE));

    try {
        const result = await listShelfBooks(c.env.DB, c.get("userId"), shelfId, { page, pageSize });
        return c.json(success(result));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf not found."), 404);
        throw err;
    }
});

shelvesRoute.post("/:id/books/:bookId", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    const bookId = Number(c.req.param("bookId"));
    try {
        await addBookToShelf(c.env.DB, c.get("userId"), shelfId, bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf or book not found."), 404);
        throw err;
    }
});

shelvesRoute.delete("/:id/books/:bookId", requireAuth, async (c) => {
    const shelfId = Number(c.req.param("id"));
    const bookId = Number(c.req.param("bookId"));
    try {
        await removeBookFromShelf(c.env.DB, c.get("userId"), shelfId, bookId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Shelf not found."), 404);
        throw err;
    }
});
