import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { success } from "../models/response";
import { optionalAuth } from "../middleware/auth";
import { discoverBooks, searchUsers, type DiscoverSort } from "../services/discoverService";

export const discoverRoute = new Hono<AppEnv>();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SORTS = new Set<DiscoverSort>(["newest", "rating"]);

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

    const result = await discoverBooks(c.env.DB, { sort, page, pageSize }, c.get("userId") ?? null);
    return c.json(success(result));
});

discoverRoute.get("/users", async (c) => {
    const q = c.req.query();
    const search = (q.search ?? "").trim();
    const { page, pageSize } = parsePagination(q);

    if (!search) return c.json(success({ items: [], total: 0, page, pageSize }));

    const result = await searchUsers(c.env.DB, search, page, pageSize);
    return c.json(success(result));
});
