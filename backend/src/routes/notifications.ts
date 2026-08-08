import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { success, failure } from "../models/response";
import { requireAuth } from "../middleware/auth";
import { listNotifications, markNotificationRead, markAllNotificationsRead, listPreferences, setPreference, type PreferenceType } from "../services/notificationService";

// In-app notifications (v3.3 Phase 3, issue #326). No email/push.
export const notificationsRoute = new Hono<AppEnv>();

const PREFERENCE_TYPES = new Set<PreferenceType>(["FOLLOW", "COMMENT", "RATING", "SHARE", "ACTIVITY_RATING", "ACTIVITY_RATING_STARS"]);

notificationsRoute.get("/", requireAuth, async (c) => {
    const result = await listNotifications(c.env.DB, c.get("userId"));
    return c.json(success(result));
});

notificationsRoute.post("/:id/read", requireAuth, async (c) => {
    await markNotificationRead(c.env.DB, c.get("userId"), Number(c.req.param("id")));
    return c.body(null, 204);
});

notificationsRoute.post("/read-all", requireAuth, async (c) => {
    await markAllNotificationsRead(c.env.DB, c.get("userId"));
    return c.body(null, 204);
});

notificationsRoute.get("/preferences", requireAuth, async (c) => {
    const result = await listPreferences(c.env.DB, c.get("userId"));
    return c.json(success(result));
});

notificationsRoute.put("/preferences", requireAuth, async (c) => {
    const body = await c.req.json<{ type?: string; enabled?: boolean }>();
    if (!body.type || !PREFERENCE_TYPES.has(body.type as PreferenceType) || typeof body.enabled !== "boolean") {
        return c.json(failure("VALIDATION_ERROR", "type must be a known preference type and enabled must be a boolean."), 400);
    }
    await setPreference(c.env.DB, c.get("userId"), body.type as PreferenceType, body.enabled);
    return c.body(null, 204);
});
