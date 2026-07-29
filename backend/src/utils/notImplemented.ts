import { Hono } from "hono";
import type { Bindings } from "../models/env";
import { failure } from "../models/response";

// Placeholder for route groups whose real implementation lands in a later
// phase (see documentation/Roadmap.md) — keeps the route structure from
// Architecture.md in place without building logic ahead of its phase.
export function notImplementedRoute(area: string) {
    const route = new Hono<{ Bindings: Bindings }>();
    route.all("*", (c) =>
        c.json(failure("NOT_IMPLEMENTED", `${area} is not implemented yet.`), 501)
    );
    return route;
}
