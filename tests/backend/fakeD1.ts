import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Minimal local typing for the subset of node:sqlite's DatabaseSync used
// here -- deliberately not `import type`-ed from "node:sqlite" itself, since
// Vite's import scanner resolves that specifier eagerly (even when
// type-only) and fails: "node:sqlite" is a newer/experimental Node builtin
// not yet in its built-in-module allowlist.
type SqliteStatement = {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
    all(...params: unknown[]): unknown[];
};
type SqliteDatabase = {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
};

// Loaded via a plain Node `require` (not `import`) -- vite-node's SSR module
// loader intercepts `import`/dynamic `import()` and strips the "node:"
// prefix when externalizing, which breaks "node:sqlite" (a newer Node
// builtin only available under the prefixed form, unlike e.g. "node:fs").
// A `require` obtained via createRequire bypasses that instrumentation.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
};

// A minimal D1Database shim backed by Node's built-in node:sqlite, applying
// the real database/migrations/*.sql on creation. This exercises real SQL
// (constraints, positional-parameter binding) without needing a Workers
// runtime in the test process -- @cloudflare/vitest-pool-workers was tried
// first but hits a known Windows-path-with-spaces bug in this environment.
class FakeD1PreparedStatement {
    constructor(
        private readonly db: SqliteDatabase,
        private readonly sql: string,
        private readonly params: unknown[] = []
    ) {}

    bind(...params: unknown[]): FakeD1PreparedStatement {
        return new FakeD1PreparedStatement(this.db, this.sql, params);
    }

    async first<T>(): Promise<T | null> {
        const row = this.db.prepare(this.sql).get(...(this.params as never[]));
        return (row as T) ?? null;
    }

    async run(): Promise<{ meta: { last_row_id: number; changes: number } }> {
        const result = this.db.prepare(this.sql).run(...(this.params as never[]));
        return {
            meta: {
                last_row_id: Number(result.lastInsertRowid),
                changes: Number(result.changes),
            },
        };
    }

    async all<T>(): Promise<{ results: T[] }> {
        const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
        return { results: rows as T[] };
    }
}

export function createFakeD1(): D1Database {
    const db = new DatabaseSync(":memory:");
    // Real D1 enforces foreign keys; SQLite defaults this off, which let a
    // real bug (deleting a book with a reading_progress row referencing it)
    // pass locally and only surface against production. See issue #59.
    db.exec("PRAGMA foreign_keys = ON;");

    const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../database/migrations");
    for (const file of readdirSync(migrationsDir).sort()) {
        if (!file.endsWith(".sql")) continue;
        db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    }

    return {
        prepare(sql: string) {
            return new FakeD1PreparedStatement(db, sql);
        },
        async batch(statements: FakeD1PreparedStatement[]) {
            const results = [];
            for (const statement of statements) results.push(await statement.run());
            return results;
        },
    } as unknown as D1Database;
}
