import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { getStatistics, setReadingGoal } from "../services/statisticsService";

export const statisticsRoute = new Hono<AppEnv>();

statisticsRoute.get("/", requireAuth, async (c) => {
    const statistics = await getStatistics(c.env.DB, c.get("userId"));
    return c.json(success(statistics));
});

statisticsRoute.put("/goal", requireAuth, async (c) => {
    const body = await c.req.json<{ targetBooks?: number | null }>().catch(() => null);
    if (body === null || (body.targetBooks !== null && body.targetBooks !== undefined && typeof body.targetBooks !== "number")) {
        return c.json(failure("VALIDATION_ERROR", "targetBooks must be a number or null."), 400);
    }

    const goal = await setReadingGoal(c.env.DB, c.get("userId"), body.targetBooks ?? null);
    return c.json(success(goal));
});
