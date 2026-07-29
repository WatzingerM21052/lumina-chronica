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

### Next: Phase 3 — Library (not yet planned in detail)

**Open decision to make when this phase is planned:** where book files (EPUB/PDF/TXT/Markdown) and covers actually get stored. R2 was the Master Project Bible's original assumption, but it requires adding a payment method to the Cloudflare account, which the user wants to avoid for a hobby project. Google Drive and Supabase Storage were evaluated as card-free alternatives (2026-07-29) — see `Architecture.md`'s "File storage" row for the tradeoffs. Decide this before starting the Library phase's implementation.
