import type { Context } from "hono";
import { failure } from "../models/response";

// Registered via app.onError in index.ts — catches anything thrown by a
// route/service and returns the standard error envelope instead of an
// unhandled-exception stack trace.
export function handleError(err: Error, c: Context) {
    console.error(err);
    return c.json(failure("INTERNAL_ERROR", "Etwas ist schiefgelaufen. Bitte versuche es erneut."), 500);
}

// Registered via app.notFound in index.ts.
export function handleNotFound(c: Context) {
    return c.json(failure("NOT_FOUND", "Not found."), 404);
}
