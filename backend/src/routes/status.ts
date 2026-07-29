import { Hono } from "hono";
import type { Bindings } from "../models/env";
import { success } from "../models/response";

export const statusRoute = new Hono<{ Bindings: Bindings }>();

statusRoute.get("/", (c) => {
    return c.json(success({ status: "online" }));
});
