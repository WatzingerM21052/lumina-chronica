import type { Context } from "hono";

// Runs work after the response is sent (Workers' waitUntil), or awaits it
// when there is no execution context -- Hono's app.request in the tests
// doesn't pass one, and c.executionCtx throws instead of returning undefined
// then. Errors are logged, never thrown: callers use this for work whose
// outcome must not change the response (review M-5).
export async function runAfterResponse(c: Context, label: string, work: () => Promise<void>): Promise<void> {
    const task = work().catch((err) => console.error(`${label} failed`, err));

    let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
    try {
        ctx = c.executionCtx;
    } catch {
        ctx = undefined;
    }

    if (ctx) {
        ctx.waitUntil(task);
    } else {
        await task;
    }
}
