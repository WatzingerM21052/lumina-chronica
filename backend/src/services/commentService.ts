// Comments on books and projects -- v3.3 (Community follow-up), Phase 2
// (issue #325). Source spec §50.3 gives the bare field list plus a
// polymorphic target_type/target_id and marks the table "Spätere Version",
// no enum of valid target types -- resolved via AskUserQuestion
// (2026-08-08) to Books + Projects only.
//
// Deliberately asymmetric access rule between the two target types:
// - BOOK: the same "can this caller actually read the book" rule as
//   isBookAccessibleTo (owner OR PUBLIC-logged-in OR SHARED-listed) --
//   NOT the PUBLIC-only rule ratings use. A comment on a book someone
//   shared privately with you is the natural case, matching the "borrowed
//   book" model from v3.1/v3.2.
// - PROJECT: owner OR PUBLIC. Projects have no share-list equivalent to
//   books' book_shares -- a real, permanent asymmetry, not a gap to close
//   later. (Non-owners still need PUBLIC, same as books' PUBLIC tier.)
//
// Self-commenting is allowed (unlike rating/following) -- commenting on
// your own book/project is normal (e.g. author replies).

import { NotFoundError } from "./errors";
import { isBookAccessibleTo, getBookOwnerId } from "./bookService";
import { isProjectCommentableBy, getProjectOwnerId } from "./projectService";

export { NotFoundError };
export class ForbiddenError extends Error {}
export class ValidationError extends Error {}

export type CommentTargetType = "BOOK" | "PROJECT";

export type Comment = {
    id: number;
    userId: number;
    username: string;
    content: string;
    createdAt: string;
};

const MAX_COMMENTS = 100;
const MAX_CONTENT_LENGTH = 2000;

// 404, not 403, whether the target doesn't exist or the caller simply can't
// read it -- same "don't leak existence" reasoning as findOwnedBookRow's
// callers throughout this codebase.
async function assertCommentable(db: D1Database, callerId: number, targetType: CommentTargetType, targetId: number): Promise<void> {
    const ok = targetType === "BOOK" ? await isBookAccessibleTo(db, callerId, targetId) : await isProjectCommentableBy(db, callerId, targetId);
    if (!ok) throw new NotFoundError();
}

export async function listComments(db: D1Database, callerId: number, targetType: CommentTargetType, targetId: number): Promise<Comment[]> {
    await assertCommentable(db, callerId, targetType, targetId);

    const { results } = await db
        .prepare(
            `SELECT comments.id, comments.user_id, users.username, comments.content, comments.created_at
             FROM comments JOIN users ON users.id = comments.user_id
             WHERE comments.target_type = ? AND comments.target_id = ?
             ORDER BY comments.created_at DESC, comments.id DESC
             LIMIT ?`
        )
        .bind(targetType, targetId, MAX_COMMENTS)
        .all<{ id: number; user_id: number; username: string; content: string; created_at: string }>();

    return results.map((row) => ({ id: row.id, userId: row.user_id, username: row.username, content: row.content, createdAt: row.created_at }));
}

export async function createComment(
    db: D1Database,
    callerId: number,
    targetType: CommentTargetType,
    targetId: number,
    content: string
): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) throw new ValidationError("content cannot be empty.");
    if (trimmed.length > MAX_CONTENT_LENGTH) throw new ValidationError(`content must be at most ${MAX_CONTENT_LENGTH} characters.`);

    await assertCommentable(db, callerId, targetType, targetId);
    await db.prepare("INSERT INTO comments (user_id, target_type, target_id, content) VALUES (?, ?, ?, ?)").bind(callerId, targetType, targetId, trimmed).run();
}

export async function deleteComment(db: D1Database, callerId: number, commentId: number): Promise<void> {
    const comment = await db
        .prepare("SELECT id, user_id, target_type, target_id FROM comments WHERE id = ?")
        .bind(commentId)
        .first<{ id: number; user_id: number; target_type: CommentTargetType; target_id: number }>();
    if (!comment) throw new NotFoundError();

    if (comment.user_id !== callerId) {
        // Fails closed: a null ownerId (target already gone, shouldn't
        // happen given deleteBook/deleteProject's cleanup) never falls
        // through to "allow" -- it just keeps failing the !== check below.
        const ownerId = comment.target_type === "BOOK" ? await getBookOwnerId(db, comment.target_id) : await getProjectOwnerId(db, comment.target_id);
        if (ownerId !== callerId) throw new ForbiddenError();
    }

    await db.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
}
