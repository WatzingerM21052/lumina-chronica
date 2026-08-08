// Linked books -- v2.0, Phase 6 (issue #259). project_books is a plain join
// table with no surrogate id, mirroring shelfService.ts's shelf_books
// exactly. Only books the caller owns can be linked.

import { NotFoundError } from "./errors";
import { BOOK_ROW_COLUMNS, toSummary as toBookSummary, type BookRow, type BookSummary } from "./bookService";

export { NotFoundError };

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

// A book not owned by the caller must also 404 -- checked via a join
// against books.owner_id, same as shelfService.ts's assertBookOwnedByCaller.
async function assertBookOwnedByCaller(db: D1Database, ownerId: number, bookId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM books WHERE id = ? AND owner_id = ?").bind(bookId, ownerId).first();
    if (!row) throw new NotFoundError();
}

export async function addBookToProject(db: D1Database, ownerId: number, projectId: number, bookId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    await assertBookOwnedByCaller(db, ownerId, bookId);
    await db.prepare("INSERT OR IGNORE INTO project_books (project_id, book_id) VALUES (?, ?)").bind(projectId, bookId).run();
}

export async function removeBookFromProject(db: D1Database, ownerId: number, projectId: number, bookId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    await db.prepare("DELETE FROM project_books WHERE project_id = ? AND book_id = ?").bind(projectId, bookId).run();
}

export async function listProjectBooks(db: D1Database, ownerId: number, projectId: number): Promise<BookSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const rows = await db
        .prepare(
            `SELECT ${BOOK_ROW_COLUMNS} FROM books
             JOIN project_books ON project_books.book_id = books.id
             WHERE project_books.project_id = ? ORDER BY books.title ASC`
        )
        .bind(projectId)
        .all<BookRow>();
    return rows.results.map((row) => toBookSummary(row, ownerId));
}

// Used by deleteProject (projectService.ts) to clean up a project's book
// links before the project row itself is deleted -- real D1 enforces
// foreign keys, same lesson as deleteShelf. The linked books themselves are
// untouched, same as deleteShelf leaving shelf_books' books alone.
export async function deleteProjectBooksForProject(db: D1Database, projectId: number): Promise<void> {
    await db.prepare("DELETE FROM project_books WHERE project_id = ?").bind(projectId).run();
}
