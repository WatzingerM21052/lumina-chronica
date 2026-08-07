// Discovery -- v3.0, Phase 4 (issue #310). Replaces the /discover
// placeholder. No spec precedent for this page at all (Teil 5 §64's
// page-by-page list has no Discover entry) -- designed fresh from epic
// #10's own body (newest/highest-rated sort, user search), same as
// followers/ratings before it.

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
};

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

    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT books.id, books.title, books.author, books.cover_url, books.genre, users.username AS owner_username,
                    (SELECT AVG(rating) FROM ratings WHERE book_id = books.id) AS average_rating,
                    (SELECT COUNT(*) FROM ratings WHERE book_id = books.id) AS rating_count,
                    (SELECT rating FROM ratings WHERE book_id = books.id AND user_id = ?) AS my_rating
                 FROM books JOIN users ON users.id = books.owner_id
                 WHERE books.visibility = 'PUBLIC' AND users.deleted_at IS NULL
                 ORDER BY ${orderClause}
                 LIMIT ? OFFSET ?`
            )
            .bind(viewerId, query.pageSize, offset)
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
            .prepare(`SELECT COUNT(*) AS total FROM books JOIN users ON users.id = books.owner_id WHERE books.visibility = 'PUBLIC' AND users.deleted_at IS NULL`)
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

export async function searchUsers(db: D1Database, search: string, page: number, pageSize: number): Promise<SearchUsersResult> {
    const like = `%${search}%`;
    const offset = (page - 1) * pageSize;

    const [rows, countRow] = await Promise.all([
        db
            .prepare(`SELECT username, avatar_url FROM users WHERE deleted_at IS NULL AND username LIKE ? ORDER BY username ASC LIMIT ? OFFSET ?`)
            .bind(like, pageSize, offset)
            .all<{ username: string; avatar_url: string | null }>(),
        db.prepare(`SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL AND username LIKE ?`).bind(like).first<{ total: number }>(),
    ]);

    return {
        items: rows.results.map((row) => ({ username: row.username, avatarUrl: row.avatar_url })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
    };
}
