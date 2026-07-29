# Database

Cloudflare D1 (SQLite-compatible), binding name `DB`, database name `lumina-chronica-db`. See [`Architecture.md`](Architecture.md) for the reasoning behind the D1/R2 split (structured data in D1, files in R2 — files are never stored directly in D1).

Conventions (Technical Standards §3, binding):
- Table names: `snake_case`, plural (`users`, `books`, `reading_progress`).
- Primary key: always `id INTEGER PRIMARY KEY`.
- Foreign keys: `<entity>_id` (`user_id`, `book_id`, `project_id`).
- Every table gets `created_at`, `updated_at`; tables supporting soft-delete also get `deleted_at`.
- Migrations live in `database/migrations/`, named `0001_initial.sql`, `0002_...` — never edited after being merged; every schema change is a new migration file.

## Migrations applied

### `0001_initial.sql`

Creates the tables needed for Phase 1 (technical foundation) — enough for a user record and its settings to exist, ahead of the full Authentication system built in Phase 2:

- **`roles`** — `id`, `name`, `permissions` (JSON). Seeded with `USER` and `ADMIN` (Teil 4 §45.2 / Feature Spec §12.1).
- **`users`** — `id`, `username`, `email`, `password_hash`, `avatar_url`, `role_id` (FK → `roles.id`), `created_at`, `last_login`, `updated_at`, `deleted_at`. Columns per Teil 4 §45.1, extended with `updated_at`/`deleted_at` per the Technical Standards timestamp rule.
- **`user_settings`** — `id`, `user_id` (FK → `users.id`), `theme`, `reader_mode`, `font_size`, `language`, `created_at`, `updated_at`. Per Teil 4 §45.3.

Auth (registration/login, password hashing) is Phase 2 scope — these tables exist now only so the schema/DB connectivity can be verified end-to-end in Phase 1.

## Planned schema (not yet migrated)

The full schema from Teil 4 (§45–§51) — `books`, `book_files`, `book_metadata`, `tags`, `book_tags`, `shelves`, `shelf_books`, `reading_progress`, `bookmarks`, `projects`, `project_members`, `characters`, `locations`, `timeline_events`, `project_files`, `followers`, `ratings`, `comments`, `user_statistics` — will be migrated incrementally as each phase needs them (Library in Phase 3, Reader progress in Phase 4, Organization in Phase 5, etc.), per the project's phase-gating rule. See `documentation/master-project-bible/extracted-spec-summary.md` for the full extracted column list, and `Technical-Standards.md` for the R2 file-key structure used alongside these tables.
