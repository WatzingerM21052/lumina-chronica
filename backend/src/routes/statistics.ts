import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { getReadingCalendarForYear, getStatistics, setReadingGoal } from "../services/statisticsService";

export const statisticsRoute = new Hono<AppEnv>();

statisticsRoute.get("/", requireAuth, async (c) => {
    const statistics = await getStatistics(c.env.DB, c.get("userId"));
    return c.json(success(statistics));
});

// The reading calendar for one calendar year (plan C3 year picker).
statisticsRoute.get("/calendar", requireAuth, async (c) => {
    const year = Number(c.req.query("year"));
    const currentYear = new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > currentYear) {
        return c.json(failure("VALIDATION_ERROR", `year must be a whole number between 2000 and ${currentYear}.`), 400);
    }

    const calendar = await getReadingCalendarForYear(c.env.DB, c.get("userId"), year);
    return c.json(success(calendar));
});

statisticsRoute.put("/goal", requireAuth, async (c) => {
    const body = await c.req.json<{ targetBooks?: number | null }>().catch(() => null);
    if (body === null || (body.targetBooks !== null && body.targetBooks !== undefined && typeof body.targetBooks !== "number")) {
        return c.json(failure("VALIDATION_ERROR", "targetBooks must be a number or null."), 400);
    }

    const goal = await setReadingGoal(c.env.DB, c.get("userId"), body.targetBooks ?? null);
    return c.json(success(goal));
});
