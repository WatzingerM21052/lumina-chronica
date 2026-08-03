import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { getStatistics } from "../services/statisticsService";

export const statisticsRoute = new Hono<AppEnv>();

statisticsRoute.get("/", requireAuth, async (c) => {
    const statistics = await getStatistics(c.env.DB, c.get("userId"));
    return c.json(success(statistics));
});
