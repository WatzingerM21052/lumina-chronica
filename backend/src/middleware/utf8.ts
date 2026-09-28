import type { MiddlewareHandler } from "hono";
import { failure } from "../models/response";

// Rejects a JSON/text request body that is not valid UTF-8, instead of
// letting Request.json()/text() silently turn the broken bytes into U+FFFD
// ("�") and storing that in D1 for good. Every real client (the Blazor
// app, fetch, curl with a UTF-8 terminal) sends UTF-8, so this only
// catches broken clients -- e.g. a Windows console piping Latin-1 --
// which then get a clear 400 instead of quietly corrupted umlauts.
//
// Multipart bodies are skipped: they carry binary file parts on purpose.
// Hono caches the body read here, so the routes' own c.req.json() still
// works afterwards (it is re-derived from the cached bytes).
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export const requireUtf8Body: MiddlewareHandler = async (c, next) => {
    const method = c.req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "DELETE") {
        return next();
    }

    const contentType = (c.req.header("content-type") ?? "").toLowerCase();
    const isText = contentType.startsWith("application/json") || contentType.startsWith("text/");
    if (!isText) {
        return next();
    }

    const bytes = await c.req.arrayBuffer();
    try {
        decoder.decode(bytes);
    } catch {
        return c.json(failure("INVALID_ENCODING", "Request body must be UTF-8 encoded."), 400);
    }
    return next();
};
