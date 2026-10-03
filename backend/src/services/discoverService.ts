// Discovery -- v3.0, Phase 4 (issue #310). Replaces the /discover
// placeholder. No spec precedent for this page at all (Teil 5 §64's
// page-by-page list has no Discover entry) -- designed fresh from epic
// #10's own body (newest/highest-rated sort, user search), same as
// followers/ratings before it.

import { resolveAvatarUrl } from "./userService";

export type DiscoverSort = "newest" | "rating";

export type DiscoverBookSummary = {
    id: number;
    title: string;
    author: string | null;
    coverUrl: string | null;
    genre: string | null;
    averageRating: number | null;
    ratingCount: number;
    myRating: number | null;
    ownerUsername: string;
};

export type DiscoverBooksQuery = {
    sort: DiscoverSort;
    page: number;
    pageSize: number;
    // Optional: only books whose title, author or genre contains it.
    search?: string;
};

// A user's term goes into LIKE as text: escape LIKE's own wildcards so a
// search for "100%" or "a_b" means exactly that.
export function likePattern(search: string): string {
    return `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export type DiscoverBooksResult = {
    items: DiscoverBookSummary[];
    total: number;
    page: number;
    pageSize: number;
};

// viewerId nullable (optionalAuth, same as the public profile endpoint) --
// binding null into `ratings.user_id = ?` never matches, so an anonymous
// visitor correctly gets myRating: null with no branching needed.
export async function discoverBooks(db: D1Database, query: DiscoverBooksQuery, viewerId: number | null): Promise<DiscoverBooksResult> {
    const offset = (query.page - 1) * query.pageSize;
    // id DESC as a tiebreaker -- created_at has only second resolution (the
    // same node:sqlite-vs-real-D1-adjacent gap documented for
    // dashboardService.ts), so two books created within the same second
    // would otherwise sort in SQLite's unspecified default order.
    const orderClause = query.sort === "rating" ? "average_rating DESC, books.id DESC" : "books.created_at DESC, books.id DESC";
    const search = query.search?.trim();
    const searchClause = search
        ? "AND (books.title LIKE ? ESCAPE '\\' OR books.author LIKE ? ESCAPE '\\' OR books.genre LIKE ? ESCAPE '\\')"
        : "";
    const searchParams = search ? [likePattern(search), likePattern(search), likePattern(search)] : [];

    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT books.id, books.title, books.author, books.cover_url, books.genre, users.username AS owner_username,
                    (SELECT AVG(rating) FROM ratings WHERE book_id = books.id) AS average_rating,
                    (SELECT COUNT(*) FROM ratings WHERE book_id = books.id) AS rating_count,
                    (SELECT rating FROM ratings WHERE book_id = books.id AND user_id = ?) AS my_rating
                 FROM books JOIN users ON users.id = books.owner_id
                 WHERE books.visibility = 'PUBLIC' AND users.deleted_at IS NULL ${searchClause}
                 ORDER BY ${orderClause}
                 LIMIT ? OFFSET ?`
            )
            .bind(viewerId, ...searchParams, query.pageSize, offset)
            .all<{
                id: number;
                title: string;
                author: string | null;
                cover_url: string | null;
                genre: string | null;
                owner_username: string;
                average_rating: number | null;
                rating_count: number;
                my_rating: number | null;
            }>(),
        db
            .prepare(`SELECT COUNT(*) AS total FROM books JOIN users ON users.id = books.owner_id WHERE books.visibility = 'PUBLIC' AND users.deleted_at IS NULL ${searchClause}`)
            .bind(...searchParams)
            .first<{ total: number }>(),
    ]);

    return {
        items: rows.results.map((row) => ({
            id: row.id,
            title: row.title,
            author: row.author,
            coverUrl: row.cover_url ? `/api/books/${row.id}/cover` : null,
            genre: row.genre,
            averageRating: row.average_rating,
            ratingCount: row.rating_count,
            myRating: row.my_rating,
            ownerUsername: row.owner_username,
        })),
        total: countRow?.total ?? 0,
        page: query.page,
        pageSize: query.pageSize,
    };
}

export type DiscoverUserSummary = {
    username: string;
    avatarUrl: string | null;
};

export type SearchUsersResult = {
    items: DiscoverUserSummary[];
    total: number;
    page: number;
    pageSize: number;
};

// A blank search lists the readers who share something -- a public book or
// project -- rather than every account: Discover browses what people chose
// to show, it isn't a member directory.
const SHARES_SOMETHING =
    "(EXISTS (SELECT 1 FROM books WHERE books.owner_id = users.id AND books.visibility = 'PUBLIC') OR EXISTS (SELECT 1 FROM projects WHERE projects.owner_id = users.id AND projects.visibility = 'PUBLIC'))";

export async function searchUsers(db: D1Database, search: string, page: number, pageSize: number, origin: string): Promise<SearchUsersResult> {
    const term = search.trim();
    const where = term ? "deleted_at IS NULL AND username LIKE ? ESCAPE '\\'" : `deleted_at IS NULL AND ${SHARES_SOMETHING}`;
    const params = term ? [likePattern(term)] : [];
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
        db
            .prepare(`SELECT username, avatar_url, avatar_key FROM users WHERE ${where} ORDER BY username ASC LIMIT ? OFFSET ?`)
            .bind(...params, pageSize, offset)
            .all<{ username: string; avatar_url: string | null; avatar_key: string | null }>(),
        db.prepare(`SELECT COUNT(*) AS total FROM users WHERE ${where}`).bind(...params).first<{ total: number }>(),
    ]);

    return {
        items: rows.results.map((row) => ({ username: row.username, avatarUrl: resolveAvatarUrl(row.avatar_url, row.avatar_key, row.username, origin) })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
    };
}

// Public projects for Discover (newest first), optionally searched by
// title, description or type. Only PUBLIC projects of active accounts --
// the same rule as the public profile's projects chapter.
export type DiscoverProjectSummary = {
    id: number;
    title: string;
    description: string | null;
    type: string;
    coverUrl: string | null;
    ownerUsername: string;
};

export type DiscoverProjectsResult = {
    items: DiscoverProjectSummary[];
    total: number;
    page: number;
    pageSize: number;
};

const PROJECT_DESCRIPTION_PREVIEW = 160;

export async function discoverProjects(db: D1Database, search: string, page: number, pageSize: number): Promise<DiscoverProjectsResult> {
    const offset = (page - 1) * pageSize;
    const term = search.trim();
    const searchClause = term ? "AND (projects.title LIKE ? ESCAPE '\\' OR projects.description LIKE ? ESCAPE '\\' OR projects.type LIKE ? ESCAPE '\\')" : "";
    const searchParams = term ? [likePattern(term), likePattern(term), likePattern(term)] : [];

    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT projects.id, projects.title, projects.description, projects.type, projects.cover_url, users.username AS owner_username
                 FROM projects JOIN users ON users.id = projects.owner_id
                 WHERE projects.visibility = 'PUBLIC' AND users.deleted_at IS NULL ${searchClause}
                 ORDER BY projects.created_at DESC, projects.id DESC
                 LIMIT ? OFFSET ?`
            )
            .bind(...searchParams, pageSize, offset)
            .all<{ id: number; title: string; description: string | null; type: string; cover_url: string | null; owner_username: string }>(),
        db
            .prepare(`SELECT COUNT(*) AS total FROM projects JOIN users ON users.id = projects.owner_id WHERE projects.visibility = 'PUBLIC' AND users.deleted_at IS NULL ${searchClause}`)
            .bind(...searchParams)
            .first<{ total: number }>(),
    ]);

    return {
        items: rows.results.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description && row.description.length > PROJECT_DESCRIPTION_PREVIEW
                ? `${row.description.slice(0, PROJECT_DESCRIPTION_PREVIEW).trimEnd()}…`
                : row.description,
            type: row.type,
            coverUrl: row.cover_url ? `/api/projects/${row.id}/cover` : null,
            ownerUsername: row.owner_username,
        })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
    };
}
