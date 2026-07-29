import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { failure, success } from "../models/response";
import { requireAuth } from "../middleware/auth";
import {
    EmailTakenError,
    InvalidCredentialsError,
    UsernameTakenError,
    loginUser,
    registerUser,
} from "../services/authService";

export const authRoute = new Hono<AppEnv>();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

authRoute.post("/register", async (c) => {
    const body = await c.req.json<{ username?: string; email?: string; password?: string }>().catch(() => null);
    const { username, email, password } = body ?? {};

    if (!username || !email || !password) {
        return c.json(failure("VALIDATION_ERROR", "username, email, and password are required."), 400);
    }
    if (!EMAIL_PATTERN.test(email)) {
        return c.json(failure("VALIDATION_ERROR", "email is not a valid address."), 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `password must be at least ${MIN_PASSWORD_LENGTH} characters.`), 400);
    }

    try {
        const result = await registerUser(c.env.DB, c.env.JWT_SECRET, { username, email, password });
        return c.json(success(result), 201);
    } catch (err) {
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        throw err;
    }
});

authRoute.post("/login", async (c) => {
    const body = await c.req.json<{ identifier?: string; password?: string }>().catch(() => null);
    if (!body?.identifier || !body?.password) {
        return c.json(failure("VALIDATION_ERROR", "identifier and password are required."), 400);
    }

    try {
        const result = await loginUser(c.env.DB, c.env.JWT_SECRET, { identifier: body.identifier, password: body.password });
        return c.json(success(result));
    } catch (err) {
        if (err instanceof InvalidCredentialsError) {
            return c.json(failure("INVALID_CREDENTIALS", "Username/email or password is incorrect."), 401);
        }
        throw err;
    }
});

// Stateless JWT: nothing to invalidate server-side. Logout is a client-side
// token discard; this endpoint exists mainly to require a valid token before
// confirming the session is over. See documentation/Architecture.md.
authRoute.post("/logout", requireAuth, (c) => c.body(null, 204));
