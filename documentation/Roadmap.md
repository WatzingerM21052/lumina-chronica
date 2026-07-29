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

### Phase 4 — Reader (complete)

Source spec's Definition of Done (§96): "Ein Benutzer kann Bücher lesen und später weitermachen" (a user can read books and later continue). Sequenced as three stories in risk order — see `Architecture.md`'s Reader-related decision rows.

- [x] Story 1 — reading-progress infrastructure (migration, `GET/POST /api/reading/*`, upsert) + TXT/Markdown readers, font-size controls, "Lesen" button
- [x] Story 2 — EPUB reader (CFI-based resume, chapters, font-size/theme injection)
- [x] Story 3 — PDF reader (canvas rendering, page navigation)

Also landed this phase (not part of the original 3-story scope, added mid-phase per user request):
- Reader-content/upload-form UI polish (issue #62/PR #63 — centered reader content, upload form as a card with a cover preview).
- Reader UX polish after live-testing feedback (issue #79/PR #80 — wider/taller reader frame for both EPUB and PDF, PDF pages scaled to fit both width and height instead of just width, and an editable page-number input to jump directly to a PDF page instead of only Weiter/Zurück).

Story 1 verified end-to-end against the real production backend, D1, and the deployed site (2026-07-29): uploaded a real TXT book and a real Markdown book → opened each in the reader → content rendered correctly (Markdown headings/bold/italic/links; `<script>` tags stripped) → scrolled, navigated away, reopened → resumed at the same position → deleted the books afterward. Found and fixed two real bugs during this pass:
- Issue #57/PR #58 — `reading_progress.position` was saved with a comma decimal separator (`"0,2700"`) instead of a period, because `double.ToString("F4")` used the app's ambient German UI culture. Fixed with explicit `CultureInfo.InvariantCulture`.
- Issue #59/PR #60 — deleting a book that had a `reading_progress` row failed with `500` (real D1 enforces the FK; the local test double didn't, so this wasn't caught until live testing). Fixed by deleting `reading_progress` in `deleteBook`, and by enabling `PRAGMA foreign_keys` in the test double so this class of bug is caught locally from now on.

Story 2 verified end-to-end against the real production backend, D1, and the deployed site (2026-07-29): uploaded EPUB files (initially non-copyrighted test fixtures, then a real book from the user's own library once they confirmed it was fine to use) → opened in the reader → chapters render, pagination (next/prev) works, font-size control changes rendered text size, CFI-based resume lands on the exact same content after reopening. Found and fixed three real bugs during this pass:
- Issue #65/PR #66 — book upload rejected a genuinely valid `.epub` file with "content does not match its .epub extension." Chrome on Windows without an ebook reader installed reports `.epub` files as `application/octet-stream` (the generic fallback for extensions with no OS MIME association), which the backend's strict MIME-hint check treated as a mismatch. Fixed by treating `application/octet-stream` as "unknown" (same as an empty `file.type`), not a mismatch.
- Issue #67/PR #68 — a real but ultimately non-root-cause fix: `bytes.buffer` (from a `byte[]` JS interop parameter) isn't guaranteed to be exactly the call's data, so slicing to `byteOffset`/`byteLength` before handing it to `ePub()` is correct defensive practice. This did **not**, however, fix the "No Section Found" error users kept hitting on every real EPUB — that pointed at a second bug (below), found only after the user reported the reader was still broken and reproduced it with their own files.
- **Issue #75/PR #76 (the actual root cause)** — `Pages/Reader.razor`'s `<EpubReader InitialCfi="_initialCfi" ...>` was missing the `@` prefix. Since `InitialCfi` is `string?`, Razor silently compiled the bare attribute as the **literal string** `"_initialCfi"` instead of binding the field — no compile error, since a string literal type-checks fine against a string parameter. Every open called `rendition.display("_initialCfi")`, an unresolvable target, failing identically for every book regardless of caching or tab state (both investigated and ruled out via temporary diagnostic instrumentation before finding this). `Bytes`/`FontSize` (non-string types) happened to bind correctly even without `@`, which is why only this one parameter was affected.
- Also diagnosed along the way (not a bug, no fix needed): epub.js's paginated layout depends on `requestAnimationFrame`, which Chrome throttles for backgrounded/hidden tabs — this can make automated live-verification appear to hang even when the app is correct. Confirmed by patching `requestAnimationFrame` to fire immediately during diagnosis. Real users with a visible/focused tab are unaffected — see memory.

Story 3 verified end-to-end against the real production backend, D1, and the deployed site (2026-07-29): uploaded a real PDF from the user's own library → opened in the reader → cover/pages render correctly with no worker-loading console errors on the deployed GitHub Pages subpath (the named risk from the original plan), page navigation and the page-jump input both work, resume lands on the correct page after reopening. No pdf.js-specific bugs found this time — the two regression tests added alongside Story 3 (asserting `EpubReader`/`PdfReader` actually receive the saved position, not a placeholder) meant the Story-2-class bug couldn't recur silently. Live-testing feedback after this story shipped led to the reader UX polish above (issue #79/PR #80).
Frontend: 28/28 bUnit tests passing. Backend: 44/44 Vitest tests passing.

**Phase 4 (Reader) is now complete** — all three stories shipped and live-verified, plus mid-phase UI/UX polish. Remaining phases per the Master Development Flow: Organization → Dashboard → Offline → v1.0 Release.

### Cross-cutting design pass (2026-07-29, issue #82/PR #83-84)

After Phase 4 shipped, the user asked for a full app review: check for remaining errors, and give the app a real visual design pass ("professional and modern, but still old library and old books"). `Architecture.md`'s "Color tokens"/"Typography" rows had explicitly deferred real values to exactly this pass since Phase 1 scaffolding. Landed:

- **Real bug found and fixed**: `Home.razor` was fully static placeholder markup left over from early scaffolding, never wired to the books API — always showed "library is empty" regardless of real data. Now shows the 6 most recently added books.
- Self-hosted Fraunces (display serif) + Literata (reading serif, previously referenced but never actually loaded). Real color tokens for `classic-library`/`dark-library` (brass/gilt + oxblood-leather palette). A chapter-heading-style double-rule signature under every page `<h1>`. Dark "wood paneling" header/nav frame. EPUB reader content now picks up the app's actual theme instead of always rendering black-on-white. Visible keyboard focus added everywhere. Fixed every non-primary button (Filtern, A-/A+, Zurück/Weiter, Abmelden, etc.), which had been falling back to unstyled native browser chrome since only `.btn-primary` had real styling.
- Live-verified in both library themes (light and dark) across Home, Library, BookDetail, BookUpload, Reader (EPUB + PDF), Settings, and Profile. Two issues found only through live verification and fixed same-day: heading vertical rhythm (h2/h3 had no top margin, so stacked sections looked cramped) and the EPUB theme injection (epub.js's documented `themes.register()`/`.select()` API didn't reliably apply in this build — switched to the `hooks.content` + `Contents.addStylesheetRules()` approach, which does).

Frontend: 29/29 bUnit tests passing.

### Upload metadata extraction (2026-07-29, issue #86/PR #87)

The user's mid-Phase-4 request ("title, description, image, isbn and the other infos gets extracted from the uploaded file if possible") was picked up as a follow-up story once Phase 4's Reader stories had vendored epub.js/pdf.js to reuse — see `Architecture.md`'s "Upload metadata extraction" row.

- Selecting an EPUB or PDF on the Upload page now pre-fills title/author/description/language/publisher/ISBN and the cover preview client-side, without ever overwriting a value the user already typed. TXT/MD are skipped (no container-level metadata to extract).
- Live-verified against real files in `bookDownloads/` before writing any C# code (probed epub.js's `book.loaded.metadata`/`.cover` and pdf.js's `getMetadata()`/page-render directly in the browser console against real books first): confirmed `metadata.identifier` is a UUID rather than an ISBN for most epubBooks.com/Blyton titles, which shaped the ISBN-shape guard actually shipped, rather than assuming the field was trustworthy.
- End-to-end verified on the deployed site after merge: uploaded a real EPUB with the extraction path active → book appeared in the library with the real extracted cover, confirming the new `ByteArrayContent` cover-upload path (previously untested, since it never had a caller before this feature) round-trips correctly through the backend and R2.

Frontend: 32/32 bUnit tests passing.
