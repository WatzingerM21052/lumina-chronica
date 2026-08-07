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

## Phase 2 (Authentication) — no schema changes needed

Registration, login, logout, profile view/edit, and password change (PR #33/#34) were all built against the `0001_initial.sql` schema as-is — no `0002_*.sql` migration was needed:

- **`users.password_hash`** stores the PBKDF2 hash as a single encoded string: `pbkdf2$<iterations>$<base64url-salt>$<base64url-hash>` (see `Architecture.md`'s "Password hashing" row for the iteration-count reasoning). This avoided adding separate `salt`/`iterations` columns.
- **`user_settings`** is created for every new user at registration time (see `backend/src/services/authService.ts`) — two sequential `INSERT`s with a compensating delete of the `users` row if the second insert fails, since D1's `batch()` can't express a dependent two-insert sequence atomically (the second insert needs the first's generated id).

### `0002_books.sql` (Phase 3 — Library)

- **`books`** — `id`, `owner_id` (FK → `users.id`), `title`, `author`, `description`, `cover_url` (R2 key, nullable), `language`, `genre`, `visibility` (`PRIVATE`/`SHARED`/`PUBLIC`, defaults `PRIVATE` — only `PRIVATE` is enforced this phase, see `Architecture.md`'s "`GET /api/books` scope" row), `created_at`, `updated_at`. Indexed on `owner_id` and `genre`. Per Teil 4 §46.1.
- **`book_files`** — `id`, `book_id` (FK → `books.id`), `file_url` (R2 key), `format` (`EPUB`/`PDF`/`TXT`/`MD`), `size`, `created_at`. Per Teil 4 §46.2.
- **`book_metadata`** — `id`, `book_id` (FK → `books.id`, unique — one row per book), `isbn`, `publisher`, `release_date`, `pages`. Only inserted/updated when at least one of these fields is provided. Per Teil 4 §46.3.
- **`tags`** — `id`, `name` (unique). Find-or-create by name (`INSERT OR IGNORE` then `SELECT id`, avoiding a race on concurrent creates of the same tag). Per Teil 4 §46.4.
- **`book_tags`** — `book_id`, `tag_id` (composite PK, both FKs). Many-to-many join table. Per Teil 4 §46.4.

`cover_url`/`file_url` store R2 *keys* (`books/{book-id}/cover.{ext}` / `books/{book-id}/original.{ext}`), not public URLs — see `Architecture.md`'s "Book file/cover serving" row for why these are streamed through an authenticated Worker route instead.

### `0003_reading_progress.sql` (Phase 4 — Reader)

- **`reading_progress`** — `id`, `user_id` (FK → `users.id`), `book_id` (FK → `books.id`), `chapter` (nullable, format-specific), `position` (**`TEXT`**, not the `FLOAT` in Teil 4 §48.1's field table — see `Architecture.md`'s "`reading_progress.position` type" row for the per-format meaning and reasoning), `percentage` (`FLOAT`, default 0), `last_opened`. `UNIQUE(user_id, book_id)` — one progress row per user per book, upserted on every save. Indexed on `book_id`. Per Teil 4 §48.1.

### `0004_organization.sql` (Phase 5 — Organization)

- **`favorites`** — `id`, `user_id` (FK → `users.id`), `book_id` (FK → `books.id`), `created_at`. `UNIQUE(user_id, book_id)` — toggle-add is idempotent, mirroring `reading_progress`'s upsert pattern. **Not in the source spec's schema section** (only a one-line bullet mentioning the table, no column list) — designed as the simplest shape satisfying "toggle + list + filter."
- **`shelves`** — `id`, `owner_id` (FK → `users.id`), `name`, `description`, `cover_url` (R2 key, nullable), `visibility` (`PRIVATE`/`SHARED`/`PUBLIC`, defaults `PRIVATE`, unenforced this phase — same treatment as `books.visibility`), `created_at`, `updated_at`. Per Teil 4 §47.1.
- **`shelf_books`** — `shelf_id`, `book_id` (composite PK, both FKs). Many-to-many join table. Per Teil 4 §47.2.

`deleteBook` and `deleteShelf` both clean up their respective join-table rows (`favorites`/`shelf_books`/`book_tags`/`reading_progress` for a deleted book; `shelf_books` for a deleted shelf) before the parent row, since real D1 enforces foreign keys (see the `fakeD1.ts` note under Phase 4 Story 1's lessons in `Roadmap.md`).

### `0005_oauth.sql` (OAuth login, issue #40)

- **`users.password_hash`** stays `NOT NULL`, schema unchanged. An OAuth-only account gets `OAUTH_NO_PASSWORD_SENTINEL` (`backend/src/utils/crypto.ts`) instead of a real hash — never matches the `pbkdf2$...` format, so `verifyPassword` rejects it cleanly. **Not** a nullable column via a table-rebuild: that was the first version of this migration, and it failed against real D1 with a `FOREIGN KEY constraint` error on `DROP TABLE users` even with `PRAGMA foreign_keys = OFF` set — D1 doesn't honor that pragma across a migration file the way local SQLite does. See `Architecture.md`'s "OAuth login" row for the full story.
- **`oauth_identities`** — `id`, `user_id` (FK → `users.id`, `ON DELETE CASCADE`), `provider` (`google`/`github`), `provider_user_id` (the provider's own stable subject id, never the email), `email`, `created_at`. `UNIQUE(provider, provider_user_id)`. A user can have a password, one or more linked identities, or both.
- **`oauth_states`** — `state` (PK), `provider`, `expires_at`. The CSRF `state` param for the authorize redirect, persisted here (not in-memory) since the Worker is stateless/horizontally scaled and `/callback` may land on a different instance than `/start`. Deleted on read (single-use).
- **`oauth_exchange_codes`** — `code_hash` (PK, SHA-256 of the actual code — the raw value is never stored, same principle as `password_hash`), `user_id` (FK → `users.id`, `ON DELETE CASCADE`), `expires_at`, `consumed_at`. The cross-origin token handoff: see `Architecture.md`'s "OAuth login" row for why the JWT itself is only ever signed at exchange time, not stored here.

### `0006_bookmarks.sql` (v1.5 — Personalisierung, §101 "Verbesserter Reader")

- **`bookmarks`** — `id`, `user_id` (FK → `users.id`), `book_id` (FK → `books.id`), `chapter`, `position` (`TEXT`), `percentage` (`FLOAT`, default 0), `note` (nullable), `created_at`, `updated_at`. **No `UNIQUE(user_id, book_id)`** — unlike `reading_progress`, a user can have any number of bookmarks per book. Indexed on `(user_id, book_id)`.
- **Deliberately reuses `reading_progress`'s `chapter`/`position`/`percentage` shape** instead of the source spec's single `location` field (Teil 4 §48.2, which itself gives no types and is explicitly marked "Spätere Version"). This lets the Reader's existing per-format location logic (EPUB: CFI string, PDF: page number, TXT/MD: page index or scroll fraction — see `Architecture.md`'s "`reading_progress.position` type" row) double as "bookmark the current position" with no new location encoding to invent.
- `deleteBook` deletes a book's `bookmarks` rows in the same batch as `reading_progress`/`favorites`/`shelf_books`/`book_tags`, since real D1 enforces the foreign key (same lesson as issue #59).

### `0008_projects.sql` (v2.0 — Worldbuilding, Phase 1, issue #254)

- **`projects`** — `id`, `owner_id` (FK → `users.id`), `title`, `description`, `type` (`WORLD`/`NOVEL`/`RPG`/`CUSTOM`, default `WORLD` — cosmetic/label only, not a feature gate, see `Architecture.md`'s "Project `type`" row), `cover_url` (R2 key, nullable), `map_url` (R2 key, nullable — column exists from this migration on but stays `NULL` until Phase 3, Locations & Map, issue #256, sets it), `visibility` (`PRIVATE`/`SHARED`/`PUBLIC`, defaults `PRIVATE`, unenforced this phase — same treatment as `books.visibility`/`shelves.visibility`), `created_at`, `updated_at`. Per Teil 4 §49.1. Indexed on `owner_id`.

### `0009_characters.sql` (v2.0 — Worldbuilding, Phase 2, issue #255)

- **`characters`** — `id`, `project_id` (FK → `projects.id`, **no `owner_id` of its own** — access control walks up to "do you own the parent project," same pattern as `shelf_books` inheriting the parent shelf's ownership check), `name`, `description`, `image_url` (R2 key, nullable), `age` (**`TEXT`, not an integer** — deliberate, same category as `timeline_events.date` will be: a fictional character's age can be "over 900 years," "unknown," or "immortal," not just a number), `origin`, `personality`, `biography`, `created_at`, `updated_at`. Per Teil 4 §49.3 (field list only, no types given — all chosen `TEXT`). Indexed on `project_id`.
- `deleteProject` now also deletes a project's `characters` rows (and their R2 images) in `deleteCharactersForProject`, called before the `projects` row itself is deleted — same real-D1-foreign-key lesson as `deleteBook`/`deleteShelf`.
- **`NotFoundError` was extracted to a new shared `backend/src/services/errors.ts`**, imported by both `projectService.ts` and `characterService.ts` (each re-exports it) — this phase is the first time two different service modules' errors are caught in the *same* route file (`routes/projects.ts`), and the existing per-service-file `class NotFoundError extends Error {}` pattern (`shelfService.ts`, `bookService.ts`, etc.) would silently produce two distinct classes, breaking `err instanceof NotFoundError` for whichever service wasn't the one the route file imported from. Caught by the new `characters.test.ts`'s cross-user 404 tests actually returning 500 on the first pass. `ValidationError` didn't need the same fix — it was already centralized in `fileValidation.ts` since Phase 3 of v1.0.

## Planned schema (not yet migrated)

The rest of the full schema from Teil 4 (§49–§51) — Highlights (§48.3, explicitly "Spätere Version"), `project_members` (deferred to v3.0 Community, not built this pass — see epic #9), `locations`, `timeline_events`, `project_files`, `followers`, `ratings`, `comments`, `user_statistics` (extended v1.5 statistics reuse the existing `GET /api/statistics` shape rather than this table — see `Architecture.md`) — will be migrated incrementally as each phase needs them, per the project's phase-gating rule. `lore_entries`, `project_books`, and `character_relationships` have no spec precedent at all (Teil 4 doesn't define them) and will be designed fresh in Phases 5–6 (issues #258, #259). See `documentation/master-project-bible/extracted-spec-summary.md` for the full extracted column list, and `Technical-Standards.md` for the R2 file-key structure used alongside these tables.
