import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    EmailTakenError,
    InvalidPasswordError,
    UsernameTakenError,
    getUserProfile,
    updateUserProfile,
} from "../services/userService";
import { getPublicProfile } from "../services/publicProfileService";

export const usersRoute = new Hono<AppEnv>();

const MIN_PASSWORD_LENGTH = 8;

// Community Phase 1 (issue #300) -- no auth at all, not just optionalAuth:
// this is meant to be reachable by a fully logged-out visitor. Registered as
// /:username/public (not a bare /:username) so it can never shadow the
// static /me routes below regardless of router matching order.
usersRoute.get("/:username/public", async (c) => {
    const profile = await getPublicProfile(c.env.DB, c.req.param("username"));
    if (!profile) return c.json(failure("NOT_FOUND", "User not found."), 404);
    return c.json(success(profile));
});

usersRoute.get("/me", requireAuth, async (c) => {
    const profile = await getUserProfile(c.env.DB, c.get("userId"));
    if (!profile) return c.json(failure("NOT_FOUND", "User not found."), 404);
    return c.json(success(profile));
});

usersRoute.put("/me", requireAuth, async (c) => {
    const body = await c.req
        .json<{ username?: string; email?: string; currentPassword?: string; newPassword?: string }>()
        .catch(() => null);
    if (!body) return c.json(failure("VALIDATION_ERROR", "Invalid request body."), 400);
    if (body.newPassword && body.newPassword.length < MIN_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters.`), 400);
    }

    try {
        const profile = await updateUserProfile(c.env.DB, c.get("userId"), body);
        return c.json(success(profile));
    } catch (err) {
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        if (err instanceof InvalidPasswordError) return c.json(failure("INVALID_PASSWORD", "Current password is incorrect."), 400);
        throw err;
    }
});
