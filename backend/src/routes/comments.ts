import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { ForbiddenError, NotFoundError, deleteComment } from "../services/commentService";

// Comments (v3.3, issue #325) -- delete lives on its own top-level route
// rather than nested under /books or /projects, since deleteComment derives
// the target (and its owner, for authorization) from the comment row
// itself and needs no path context beyond the comment's own id.
export const commentsRoute = new Hono<AppEnv>();

commentsRoute.delete("/:id", requireAuth, async (c) => {
    const commentId = Number(c.req.param("id"));
    try {
        await deleteComment(c.env.DB, c.get("userId"), commentId);
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "Comment not found."), 404);
        if (err instanceof ForbiddenError) return c.json(failure("FORBIDDEN", "You cannot delete this comment."), 403);
        throw err;
    }
});
