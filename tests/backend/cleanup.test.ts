import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeD1 } from "./fakeD1";
import { cleanupExpiredRows } from "../../backend/src/services/cleanupService";
import worker from "../../backend/src/worker";

let db: D1Database;
const now = new Date("2026-10-02T12:00:00.000Z");
const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;

async function count(table: string): Promise<number> {
    return (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
}

beforeEach(async () => {
    db = createFakeD1();
    await db.prepare("INSERT INTO users (id, username, email, password_hash, role_id) VALUES (1, 'alice', 'alice@example.com', 'x', (SELECT id FROM roles LIMIT 1))").run();
});

describe("cleanupExpiredRows", () => {
    it("deletes expired rate-limit rows right away and keeps live ones", async () => {
        await db.prepare("INSERT INTO auth_rate_limits (route, ip, identifier, expires_at) VALUES ('login', '1.1.1.1', 'a', ?), ('login', '1.1.1.1', 'b', ?)").bind(iso(-1000), iso(HOUR)).run();

        const result = await cleanupExpiredRows(db, now);

        expect(result.rateLimits).toBe(1);
        expect(await count("auth_rate_limits")).toBe(1);
    });

    it("keeps tokens and OAuth rows for a day after they expire, then deletes them", async () => {
        await db
            .prepare("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ('old', 1, ?), ('recent', 1, ?), ('live', 1, ?)")
            .bind(iso(-25 * HOUR), iso(-2 * HOUR), iso(HOUR))
            .run();
        await db.prepare("INSERT INTO oauth_states (state, provider, expires_at) VALUES ('s-old', 'github', ?), ('s-new', 'github', ?)").bind(iso(-25 * HOUR), iso(-HOUR)).run();
        await db.prepare("INSERT INTO oauth_exchange_codes (code_hash, user_id, expires_at) VALUES ('c-old', 1, ?), ('c-live', 1, ?)").bind(iso(-48 * HOUR), iso(HOUR)).run();

        const result = await cleanupExpiredRows(db, now);

        expect(result).toEqual({ rateLimits: 0, passwordResetTokens: 1, oauthStates: 1, oauthExchangeCodes: 1 });
        expect(await count("password_reset_tokens")).toBe(2);
        expect(await count("oauth_states")).toBe(1);
        expect(await count("oauth_exchange_codes")).toBe(1);
    });
});

describe("worker entry", () => {
    it("runs the cleanup from the cron trigger via waitUntil", async () => {
        await db.prepare("INSERT INTO auth_rate_limits (route, ip, identifier, expires_at) VALUES ('login', '1.1.1.1', 'a', '2000-01-01T00:00:00.000Z')").run();
        const pending: Promise<unknown>[] = [];
        const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext;

        await worker.scheduled!({ cron: "17 3 * * *", scheduledTime: Date.now(), noRetry: vi.fn() } as unknown as ScheduledController, { DB: db } as never, ctx);
        await Promise.all(pending);

        expect(await count("auth_rate_limits")).toBe(0);
    });

    it("still serves HTTP through the Hono app", async () => {
        const res = await worker.fetch!(new Request("http://localhost/api/status"), {} as never, {} as ExecutionContext);
        expect(res.status).toBe(200);
    });
});
