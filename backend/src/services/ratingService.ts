// 1-5 star ratings on books -- v3.0 (Community), Phase 3 (issue #307). No
// spec precedent beyond the bare `ratings(id, user_id, book_id, rating,
// created_at)` field list (§50.2); this file's shape is designed fresh.

import { NotFoundError } from "./errors";
import { recordRatingActivity } from "./activityService";

export { NotFoundError };
export class SelfRatingError extends Error {}
export class NotPublicError extends Error {}
export class ValidationError extends Error {}

const MIN_RATING = 1;
const MAX_RATING = 5;

export async function rateBook(db: D1Database, userId: number, bookId: number, rating: number): Promise<void> {
    if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
        throw new ValidationError(`rating must be an integer between ${MIN_RATING} and ${MAX_RATING}.`);
    }

    const row = await db.prepare("SELECT owner_id, visibility FROM books WHERE id = ?").bind(bookId).first<{ owner_id: number; visibility: string }>();
    if (!row) throw new NotFoundError();
    if (row.owner_id === userId) throw new SelfRatingError();
    // Only a PUBLIC book is visible to a non-owner at all -- rating a
    // PRIVATE book is unreachable through any other endpoint, so this is
    // the same access check as getBookCoverObject's PUBLIC bypass, not a
    // new visibility rule.
    if (row.visibility !== "PUBLIC") throw new NotPublicError();

    await db
        .prepare(
            `INSERT INTO ratings (user_id, book_id, rating) VALUES (?, ?, ?)
             ON CONFLICT(user_id, book_id) DO UPDATE SET rating = excluded.rating`
        )
        .bind(userId, bookId, rating)
        .run();

    // A re-rate is logged as a new activity too -- ratings are upsert, but
    // each PUT is still a distinct, chronologically real event.
    await recordRatingActivity(db, userId, bookId, rating);
}

export async function unrateBook(db: D1Database, userId: number, bookId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM books WHERE id = ?").bind(bookId).first();
    if (!row) throw new NotFoundError();
    await db.prepare("DELETE FROM ratings WHERE user_id = ? AND book_id = ?").bind(userId, bookId).run();
}
