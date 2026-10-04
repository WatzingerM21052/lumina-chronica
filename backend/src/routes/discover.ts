import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { success } from "../models/response";
import { optionalAuth } from "../middleware/auth";
import { discoverBooks, discoverProjects, searchUsers, type DiscoverOrder, type DiscoverSort } from "../services/discoverService";

export const discoverRoute = new Hono<AppEnv>();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SORTS = new Set<DiscoverSort>(["newest", "rating", "views", "title"]);
// Projects have no ratings.
const PROJECT_SORTS = new Set<DiscoverSort>(["newest", "views", "title"]);
const parseOrder = (value: string | undefined): DiscoverOrder => (value === "asc" ? "asc" : "desc");
// Longer terms only cost LIKE time; nothing real is that long.
const MAX_SEARCH_LENGTH = 100;

function parsePagination(q: Record<string, string>): { page: number; pageSize: number } {
    return {
        page: Math.max(1, Number(q.page) || 1),
        pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || DEFAULT_PAGE_SIZE)),
    };
}

// No auth required at all -- optionalAuth so myRating can still reflect the
// caller's own rating when they happen to be logged in, same reasoning as
// the public profile endpoint (Community Phase 1/3).
discoverRoute.get("/books", optionalAuth, async (c) => {
    const q = c.req.query();
    const sort = SORTS.has(q.sort as DiscoverSort) ? (q.sort as DiscoverSort) : "newest";
    const { page, pageSize } = parsePagination(q);

    const search = (q.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);

    const result = await discoverBooks(c.env.DB, { sort, order: parseOrder(q.order), page, pageSize, search }, c.get("userId") ?? null);
    return c.json(success(result));
});

// Public projects (newest first by default; ?sort=newest|views|title and
// ?order=asc|desc); ?search= narrows by title/description/type.
discoverRoute.get("/projects", async (c) => {
    const q = c.req.query();
    const search = (q.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
    const { page, pageSize } = parsePagination(q);

    const sort = PROJECT_SORTS.has(q.sort as DiscoverSort) ? (q.sort as DiscoverSort) : "newest";
    const result = await discoverProjects(c.env.DB, search, page, pageSize, sort, parseOrder(q.order));
    return c.json(success(result));
});

// Readers by username; a blank search lists those who share something.
discoverRoute.get("/users", async (c) => {
    const q = c.req.query();
    const search = (q.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
    const { page, pageSize } = parsePagination(q);

    const result = await searchUsers(c.env.DB, search, page, pageSize, new URL(c.req.url).origin);
    return c.json(success(result));
});
