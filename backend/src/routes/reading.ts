import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { NotFoundError, getProgress, saveProgress, type SaveProgressInput } from "../services/readingService";
import { parseReadingPosition } from "../utils/readingPosition";

export const readingRoute = new Hono<AppEnv>();

readingRoute.get("/:bookId", requireAuth, async (c) => {
    const bookId = Number(c.req.param("bookId"));
    try {
        const progress = await getProgress(c.env.DB, c.get("userId"), bookId);
        return c.json(success(progress));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});

readingRoute.post("/update", requireAuth, async (c) => {
    const body = await c.req.json<Partial<SaveProgressInput>>().catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "bookId and percentage are required."), 400);
    const parsed = parseReadingPosition(body);
    if ("error" in parsed) return c.json(failure("VALIDATION_ERROR", parsed.error), 400);

    try {
        const progress = await saveProgress(c.env.DB, c.get("userId"), parsed.value);
        return c.json(success(progress));
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Book not found."), 404);
        throw err;
    }
});
