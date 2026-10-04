import app from "./index";
import type { Bindings } from "./models/env";
import { purgeExpiredAccounts } from "./services/accountPurgeService";
import { cleanupExpiredRows } from "./services/cleanupService";

// Worker entry point (wrangler.toml's main): HTTP goes to the Hono app,
// the cron trigger to the daily cleanup (expired auth rows, and deleted
// accounts past their restore window). index.ts stays a plain Hono app so
// the tests can keep calling app.request().
export default {
    fetch: app.fetch,
    async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(
            cleanupExpiredRows(env.DB).then(
                (result) => console.log("cleanup", JSON.stringify(result)),
                (err) => console.error("cleanup failed", err)
            )
        );
        // Deleted accounts past their 90-day restore window go for good.
        ctx.waitUntil(
            purgeExpiredAccounts(env.DB, env.STORAGE).then(
                (count) => console.log("purged accounts", count),
                (err) => console.error("account purge failed", err)
            )
        );
    },
} satisfies ExportedHandler<Bindings>;
