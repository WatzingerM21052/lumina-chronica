# Roadmap

## Version numbering — resolved conflict

The Master Project Bible's own parts disagree on one milestone: the Implementation Blueprint (§91) lists `V0.3 Persönliche Bibliothek`, while Teil 9's GitHub Milestones list (§131) lists `V0.5 Bibliothek MVP` in the same slot. **This project follows Teil 9's numbering**, since Teil 9 is specifically the GitHub process-management document (its whole purpose is defining milestones/labels) and its version-label taxonomy (§129: v0.1, v0.2, v1.0, v1.5, v2.0, v3.0, v4.0, v5.0) is what's actually used for GitHub Milestones and issue labels.

## Milestones

| Milestone | Focus | Scope |
|---|---|---|
| v0.1 | Projektstart | Repository foundation: license, templates, project board, docs — **done** |
| v0.2 | Technisches Fundament | Frontend/backend/DB scaffolding, first deploy pipeline — **done** |
| v1.0 | Reader Release | Auth, personal library, book upload (EPUB/PDF/TXT/Markdown), reader, reading progress, shelves, tags |
| v1.5 | Personalisierung | Extended themes, bookmarks, better reader, extended statistics |
| v2.0 | Worldbuilding | Projects, worlds, characters, locations, maps, timelines |
| v3.0 | Community | Public profiles/library, following, ratings, comments |
| v4.0 | KI (AI) | Reader AI (summaries, word explanations, Q&A), Creator AI (character ideas, lore, consistency checks) |
| v5.0 | Mobile | Native mobile apps, offline sync, push notifications |

## Phase-gating rule

Per the Execution Blueprint (§112): each phase must be fully complete, tested, and documented before the next phase begins. No sprint is "just preparation" — every sprint should add visible, working value.

## v0.2 — Technical Foundation (complete)

Definition of Done (Implementation Blueprint §93 / Execution Blueprint §116):
- [x] Frontend runs (Blazor WASM scaffold, routing, layout, nav, theme engine skeleton) — live at https://watzingerm21052.github.io/lumina-chronica/
- [x] Backend runs (`GET /api/status` responding) — live at https://lumina-chronica-api.svhofkirchen-api.workers.dev
- [x] Database connected (D1 `lumina-chronica-db` created, `0001_initial.sql` applied locally and remotely)
- [x] Deployment works (frontend live on GitHub Pages, backend live on Cloudflare Workers, frontend successfully calls backend across origins — CORS confirmed restrictive and working)

Frontend and backend test suites both passing (2/2 bUnit, 3/3 Vitest). Backend CI deploy (`backend-deploy.yml`) exists but needs a `CLOUDFLARE_API_TOKEN` repo secret added by the repo owner before it can run — see Architecture.md.

## v1.0 — in progress

Per the Execution Blueprint's Master Development Flow (§114): Authentication → Library → Reader → Organization → Dashboard → Offline → **v1.0 Release**. Each phase is planned in its own pass, per the phase-gating rule above.

### Phase 2 — Authentication (complete)

Source spec's Definition of Done (§117): "Ein Benutzer kann sich vollständig anmelden und verwalten" (a user can fully register/log in/manage their account).

- [x] Registrierung — `POST /api/auth/register`, creates `users` + `user_settings`
- [x] Login — `POST /api/auth/login`
- [x] Logout — `POST /api/auth/logout`
- [x] Session — JWT in `localStorage`, `AuthenticationStateProvider`/`<AuthorizeView>` wired up
- [x] Rollen — `USER`/`ADMIN` carried in the token, no role-gated endpoints yet (nothing needs one)
- [x] Benutzerprofil — `/profile` page, `GET`/`PUT /api/users/me`, password change

**Explicitly deferred** (spec §117 lists these too, but each pulls in a dependency this project has deliberately not taken on yet):
- **Passwort zurücksetzen / E-Mail-Bestätigung** — need an email-sending provider, not yet evaluated (same cost-avoidance concern already raised about R2).
- **Avatar** — needs file upload, which needs the file-storage backend decision below (deferred to Phase 3).

Verified end-to-end against the real production backend and D1 (2026-07-29): register → JWT issued → login → profile update persists → password change + re-login → real remote `users.password_hash` confirmed hashed, not plaintext. Frontend: 7/7 bUnit tests passing. Backend: 20/20 Vitest tests passing (`auth.test.ts`, `users.test.ts`). See `Architecture.md`'s "Password hashing"/"Auth token"/"Token storage"/"Auth middleware" rows for the decisions made.

Same-day follow-ups (2026-07-29): login now accepts a username *or* email (`identifier` field, issue #41/PR #42, see `Architecture.md`'s "Login identifier" row); OAuth (Google/GitHub) was explicitly deferred to a later phase rather than built now (backlog issue #40, no milestone).

### Phase 3 — Library (complete)

Source spec's Definition of Done (§118): "Eigene Bücher können vollständig verwaltet werden" (a user's own books can be fully created/read/updated/deleted, browsed/searched/filtered/sorted).

- [x] Buchmodell — `books`/`book_files`/`book_metadata`/`tags`/`book_tags` (migration `0002_books.sql`)
- [x] Upload — `POST /api/books/upload` (multipart, metadata + file + optional cover)
- [x] EPUB / PDF / TXT / Markdown — accepted upload formats (validated by extension/MIME, stored as-is; content *parsing* is Phase 4/Reader scope, see `Architecture.md`)
- [x] Metadaten — title/author/description/genre/language/isbn/publisher/releaseDate/pages/tags, entered manually on upload and editable afterwards (`PUT /api/books/:id`)
- [x] Cover — optional upload, served via an auth-checked streaming endpoint + frontend blob-URL pattern (not a public bucket URL)
- [x] Bibliotheksübersicht — `/library` page
- [x] Grid — grid view with `BookCard` (Normal size)
- [x] Listenansicht — list view with `BookCard` (Small size)
- [x] Suche — title/author search (`?search=`)
- [x] Filter — genre filter (`?genre=`)
- [x] Sortierung — sort by created date/title/author, asc/desc (`?sort=&order=`)

**File-storage decision resolved** (was the open item blocking this phase): **Cloudflare R2** — the user chose it explicitly after seeing the concrete tradeoffs of the card-free alternatives (Supabase's 1GB cap + 7-day auto-pause; Google Drive's OAuth complexity). See `Architecture.md`'s "File storage" row.

**Explicitly out of scope this phase:**
- **Shelves** (`shelves`/`shelf_books`) — not in this phase's item list, belongs to the Organization epic (#7).
- **EPUB/PDF content parsing** (metadata auto-extraction, chapter/page counts) — deferred to Phase 4 (Reader), which has to parse these formats to render them anyway; see `Architecture.md`'s "Metadata extraction on upload" row.
- **Public/shared book browsing** — `visibility` column exists but every list/get is owner-scoped only; no Discovery/sharing surface exists yet.

Frontend: 20/20 bUnit tests passing. Backend: 34/34 Vitest tests passing (`auth.test.ts`, `users.test.ts`, `books.test.ts`, `status.test.ts`). See `Architecture.md`'s "File storage"/"R2 key layout"/"Upload limits"/"Metadata extraction on upload"/"`GET /api/books` scope"/"Book file/cover serving" rows for the decisions made.

Verified end-to-end against the real production backend, D1, and R2 (2026-07-29): uploaded a real book with a cover on the deployed site → appeared in the library grid with its cover rendered (via the blob-URL pattern) → detail page → edit persisted → delete removed it from the grid, D1, and R2. Found and fixed one real bug during this pass: uploads from the deployed Blazor client failed outright (issue #50/PR #51 — .NET's `MultipartFormDataContent` emits unquoted `Content-Disposition` field names, which RFC 7578 requires to be quoted; not caught by any existing automated test, only by exercising the real client against the real backend).

### Next: Phase 4 — Reader (not yet planned in detail)
