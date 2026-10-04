// Deleted accounts can be restored for RESTORE_WINDOW_DAYS (user decision
// 2026-10-04, also stated in the privacy policy); after that the daily
// cleanup removes them for good -- the account row and everything it owns
// or wrote: books (files, covers), shelves, projects (pictures, files),
// ratings, comments, follows, reading data, notifications, preferences.
// Until then deleteUser's soft delete keeps it all invisible but intact.
import { deleteBook } from "./bookService";
import { deleteProject } from "./projectService";
import { deleteShelf } from "./shelfService";

export const RESTORE_WINDOW_DAYS = 90;

// SQL condition: the account is still within its restore window. deleted_at
// is CURRENT_TIMESTAMP text, so it's compared via julianday() -- never as
// plain text against an ISO string (see #547).
export const WITHIN_RESTORE_WINDOW = `julianday(deleted_at) >= julianday('now', '-${RESTORE_WINDOW_DAYS} days')`;

// A few accounts per run keep one cron invocation short; any left over go
// the next day.
const ACCOUNTS_PER_RUN = 20;

export async function purgeExpiredAccounts(db: D1Database, storage: R2Bucket): Promise<number> {
    const expired = await db
        .prepare(
            `SELECT id FROM users
             WHERE deleted_at IS NOT NULL AND julianday(deleted_at) < julianday('now', '-${RESTORE_WINDOW_DAYS} days')
             ORDER BY deleted_at LIMIT ?`
        )
        .bind(ACCOUNTS_PER_RUN)
        .all<{ id: number }>();

    for (const { id } of expired.results) {
        await purgeAccount(db, storage, id);
    }
    return expired.results.length;
}

export async function purgeAccount(db: D1Database, storage: R2Bucket, userId: number): Promise<void> {
    // Owned content through the same paths as a normal delete, so files,
    // covers and every dependent row go with it.
    const [books, projects, shelves] = await db.batch([
        db.prepare("SELECT id FROM books WHERE owner_id = ?").bind(userId),
        db.prepare("SELECT id FROM projects WHERE owner_id = ?").bind(userId),
        db.prepare("SELECT id FROM shelves WHERE owner_id = ?").bind(userId),
    ]);
    for (const { id } of shelves.results as { id: number }[]) await deleteShelf(db, storage, userId, id);
    for (const { id } of projects.results as { id: number }[]) await deleteProject(db, storage, userId, id);
    for (const { id } of books.results as { id: number }[]) await deleteBook(db, storage, userId, id);

    // What the account did on other people's things, then the account.
    await db.batch([
        db.prepare("DELETE FROM reading_progress WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM reading_activity_books WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM reading_activity WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM bookmarks WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM favorites WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM ratings WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM book_shares WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM comments WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM notifications WHERE user_id = ? OR actor_user_id = ?").bind(userId, userId),
        db.prepare("DELETE FROM followers WHERE follower_id = ? OR following_id = ?").bind(userId, userId),
        db.prepare("DELETE FROM profile_activities WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM user_settings WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM user_preferences WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM oauth_identities WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM oauth_exchange_codes WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM oauth_states WHERE linking_user_id = ?").bind(userId),
        db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
    ]);
}
