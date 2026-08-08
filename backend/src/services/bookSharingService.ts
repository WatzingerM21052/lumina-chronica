// Explicit per-book sharing (v3.2, issue #321, migration 0017) -- who a
// SHARED book's owner has chosen to give full read access to. Deliberately
// mirrors followService.ts's shape (resolve-by-username, idempotent
// add/remove) since it's the same kind of many-to-many relationship, just
// scoped to a book instead of a user.

import { NotFoundError } from "./errors";
import { buildNotificationInsert } from "./notificationService";

export { NotFoundError };
export class SelfShareError extends Error {}

async function requireOwnedBook(db: D1Database, ownerId: number, bookId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM books WHERE id = ? AND owner_id = ?").bind(bookId, ownerId).first();
    if (!row) throw new NotFoundError();
}

async function resolveUserIdByUsername(db: D1Database, username: string): Promise<number> {
    const row = await db.prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL").bind(username).first<{ id: number }>();
    if (!row) throw new NotFoundError();
    return row.id;
}

export async function shareBookWithUser(db: D1Database, ownerId: number, bookId: number, targetUsername: string): Promise<void> {
    await requireOwnedBook(db, ownerId, bookId);
    const targetId = await resolveUserIdByUsername(db, targetUsername);
    if (targetId === ownerId) throw new SelfShareError();
    const result = await db.prepare("INSERT OR IGNORE INTO book_shares (book_id, user_id) VALUES (?, ?)").bind(bookId, targetId).run();
    // Same idempotency reasoning as followUser -- only notify when the
    // share is actually new.
    if (result.meta.changes > 0) {
        await buildNotificationInsert(db, targetId, "SHARE", ownerId, "BOOK", bookId).run();
    }
}

export async function unshareBookWithUser(db: D1Database, ownerId: number, bookId: number, targetUsername: string): Promise<void> {
    await requireOwnedBook(db, ownerId, bookId);
    const targetId = await resolveUserIdByUsername(db, targetUsername);
    await db.prepare("DELETE FROM book_shares WHERE book_id = ? AND user_id = ?").bind(bookId, targetId).run();
}

export type BookShareUser = {
    username: string;
    avatarUrl: string | null;
};

export async function listBookShares(db: D1Database, ownerId: number, bookId: number): Promise<BookShareUser[]> {
    await requireOwnedBook(db, ownerId, bookId);
    const rows = await db
        .prepare(
            `SELECT users.username, users.avatar_url FROM book_shares
             JOIN users ON users.id = book_shares.user_id
             WHERE book_shares.book_id = ?
             ORDER BY users.username ASC`
        )
        .bind(bookId)
        .all<{ username: string; avatar_url: string | null }>();

    return rows.results.map((row) => ({ username: row.username, avatarUrl: row.avatar_url }));
}
