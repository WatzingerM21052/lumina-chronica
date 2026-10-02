import { Hono } from "hono";
import type { Bindings } from "../models/env";
import { success } from "../models/response";

export const statusRoute = new Hono<{ Bindings: Bindings }>();

// Features a frontend can check for before relying on them (review §3.3):
// a new frontend against an older Worker can hide what isn't there yet
// instead of hitting NOT_FOUND. Add an entry with the change that ships it.
export const CAPABILITIES = ["resetCode", "statisticsCalendarYears", "logoutAll"] as const;

// Latest applied D1 migration (wrangler's own d1_migrations table), so a
// deploy that forgot `wrangler d1 migrations apply` is visible from outside.
async function latestMigration(db: D1Database): Promise<string | null> {
    try {
        const row = await db.prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1").first<{ name: string }>();
        return row?.name ?? null;
    } catch {
        return null;
    }
}

// Public on purpose: everything here is either already observable (what
// works and what doesn't) or a yes/no -- never a secret's value.
statusRoute.get("/", async (c) => {
    const env: Partial<Bindings> = c.env ?? {};
    return c.json(
        success({
            status: "online",
            // Set by backend-deploy.yml (`--var APP_VERSION:<git sha>`); "dev" locally.
            version: env.APP_VERSION || "dev",
            schema: env.DB ? await latestMigration(env.DB) : null,
            config: {
                passwordCodeSecret: Boolean(env.PASSWORD_CODE_SECRET),
                resend: Boolean(env.RESEND_API_KEY),
                bibleApi: Boolean(env.BIBLE_API_KEY),
                googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
                githubOAuth: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
            },
            capabilities: CAPABILITIES,
        })
    );
});
