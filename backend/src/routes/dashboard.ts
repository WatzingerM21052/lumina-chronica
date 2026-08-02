import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { getDashboard } from "../services/dashboardService";

export const dashboardRoute = new Hono<AppEnv>();

dashboardRoute.get("/", requireAuth, async (c) => {
    const dashboard = await getDashboard(c.env.DB, c.get("userId"));
    return c.json(success(dashboard));
});
