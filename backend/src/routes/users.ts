import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { conditionalCoverResponse } from "../utils/fileResponse";
import { optionalAuth, requireAuth } from "../middleware/auth";
import {
    EmailTakenError,
    InvalidPasswordError,
    UsernameTakenError,
    ValidationError,
    getUserAvatarObject,
    getUserProfile,
    updateUserAvatar,
    updateUserProfile,
} from "../services/userService";
import { getPublicProfile } from "../services/publicProfileService";
import { NotFoundError, SelfFollowError, followUser, unfollowUser } from "../services/followService";

export const usersRoute = new Hono<AppEnv>();

const MIN_PASSWORD_LENGTH = 8;

// Community Phase 1 (issue #300) -- optionalAuth, not requireAuth: still
// reachable by a fully logged-out visitor (viewerId falls back to null),
// but Phase 2 (issue #304) needs to know the caller's identity when they
// do have one, to compute isFollowing/isOwnProfile. Registered as
// /:username/public (not a bare /:username) so it can never shadow the
// static /me routes below regardless of router matching order.
usersRoute.get("/:username/public", optionalAuth, async (c) => {
    const profile = await getPublicProfile(c.env.DB, c.req.param("username") ?? "", c.get("userId") ?? null, new URL(c.req.url).origin);
    if (!profile) return c.json(failure("NOT_FOUND", "User not found."), 404);
    return c.json(success(profile));
});

// Deliberately no auth at all (not even optionalAuth) -- an avatar has no
// privacy concept, unlike a book/shelf cover; anyone with the URL (which is
// itself only ever handed out already-resolved in a profile response) can
// load it, same as an external OAuth avatar URL always could.
usersRoute.get("/:username/avatar", async (c) => {
    const object = await getUserAvatarObject(c.env.DB, c.env.STORAGE, c.req.param("username") ?? "");
    if (!object) return c.json(failure("NOT_FOUND", "Avatar not found."), 404);
    return conditionalCoverResponse(c, object, true);
});

// Community Phase 2 (issue #304). Idempotent by design (INSERT OR IGNORE /
// plain DELETE) -- POSTing to follow someone you already follow, or
// DELETEing a follow that doesn't exist, both succeed rather than erroring.
usersRoute.post("/:username/follow", requireAuth, async (c) => {
    try {
        await followUser(c.env.DB, c.get("userId"), c.req.param("username") ?? "");
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "User not found."), 404);
        if (err instanceof SelfFollowError) return c.json(failure("VALIDATION_ERROR", "You cannot follow yourself."), 400);
        throw err;
    }
});

usersRoute.delete("/:username/follow", requireAuth, async (c) => {
    try {
        await unfollowUser(c.env.DB, c.get("userId"), c.req.param("username") ?? "");
        return c.body(null, 204);
    } catch (err) {
        if (err instanceof NotFoundError) return c.json(failure("NOT_FOUND", "User not found."), 404);
        throw err;
    }
});

usersRoute.get("/me", requireAuth, async (c) => {
    const profile = await getUserProfile(c.env.DB, c.get("userId"), new URL(c.req.url).origin);
    if (!profile) return c.json(failure("NOT_FOUND", "User not found."), 404);
    return c.json(success(profile));
});

usersRoute.put("/me/avatar", requireAuth, async (c) => {
    const body = await c.req.parseBody().catch(() => null);
    const avatar = body?.avatar instanceof File ? body.avatar : null;
    if (!avatar) return c.json(failure("VALIDATION_ERROR", "avatar is required."), 400);

    try {
        const profile = await updateUserAvatar(c.env.DB, c.env.STORAGE, c.get("userId"), avatar, new URL(c.req.url).origin);
        return c.json(success(profile));
    } catch (err) {
        if (err instanceof ValidationError) return c.json(failure("VALIDATION_ERROR", err.message), 400);
        throw err;
    }
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
        const profile = await updateUserProfile(c.env.DB, c.get("userId"), body, new URL(c.req.url).origin);
        return c.json(success(profile));
    } catch (err) {
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        if (err instanceof InvalidPasswordError) return c.json(failure("INVALID_PASSWORD", "Current password is incorrect."), 400);
        throw err;
    }
});
