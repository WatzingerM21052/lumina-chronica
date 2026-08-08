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
| v2.1 | Sicherheit | Not part of the original §100–§112 version sequence — an unplanned security release triggered by Dependabot alerts after v2.0; Dependabot vulnerability remediation + a general security hardening pass |
| v3.0 | Community | Public profiles/library, following, ratings, comments |
| v3.1 | Borrowed Reading | Not part of the original §100–§112 version sequence — a user-requested follow-up to v3.0: `SHARED`-visibility books fully readable by any logged-in user, with per-user progress/bookmarks, saving cloud storage |
| v3.2 | Sharing | Not part of the original §100–§112 version sequence — same-day user follow-up to v3.1: swapped PUBLIC/SHARED meanings and added an explicit per-book share list for SHARED |
| v3.3 | Comments, Notifications, Activities | Deferred-from-v3.0 items from issue #299 (Phase 8/§123's original 7-item list): comments on books/projects, in-app notifications with per-type preferences, profile activity log — three sequenced phases (#324 → #325 → #326) |
| v3.4 | Community Premium Design | Not part of the original §100–§112 version sequence — a user-requested visual rework of the Community pages (backlog issue #315, sibling to #269's Worldbuilding rework): Public Profile + Discover as a "digital literary archive," no new functionality. Three sequenced phases (#339 → #340 → #341) |
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

### Phase 5 — Organization (complete)

Epic #7, "Personal organization: shelves, tags, favorites." The source spec's own "Phase 5 — Organisation" (§120) lists 7 items; this phase scoped to the epic's own 3-item description and explicitly excluded "Zuletzt gelesen"/"Leseverlauf" (Dashboard epic #8), "Offline-Bibliothek" (Offline epic #13), and "Mehrfachzuordnung" (inherent to `shelf_books`'s many-to-many schema, not a separate story).

- [x] Story 1 — Tags browsing/filtering (issue #89/PR #92): `GET /api/books?tag=<name>` filter mirroring the existing `genre` filter shape; Library toolbar `Tag` input; Book Detail's tags render as clickable links deep-linking back into the filtered Library view. Purely additive — tag storage already existed end-to-end since Phase 3.
- [x] Story 2 — Favorites (issue #90/PR #93): new `favorites` table, `POST`/`DELETE /api/books/:id/favorite` nested under books, star toggle on `BookCard` and Book Detail, "Nur Favoriten" filter checkbox. `isFavorite` computed via a correlated subquery on the existing book-row query rather than a second round trip.
- [x] Story 3 — Shelves (issue #91/PR #94): `shelves`/`shelf_books` tables per the source spec's schema, `shelfService.ts`/`routes/shelves.ts` mirroring the Reader's `readingService.ts` shape, `Pages/Shelves.razor`/`ShelfDetail.razor`, `Components/ShelfCard`, and a shelf-picker on Book Detail.

Verified end-to-end against the real production backend, D1, and the deployed site (2026-07-29) after each story: filtered the real library by an existing tag and confirmed the tag-link round trip; toggled favorite on a real book from both the grid and detail view and confirmed it persisted and the favorites-only filter worked; created a real shelf, added/removed a real book via the Book Detail picker, confirmed the shelf's book count and grid updated, and confirmed deleting the shelf left the book itself untouched in the library.

Backend: 61/61 Vitest tests passing. Frontend: 42/42 bUnit tests passing.

**Phase 5 (Organization) is now complete.** Remaining phases per the Master Development Flow: Dashboard → Offline → v1.0 Release.

### Cover replace after creation (2026-07-30, issue #96/PR #97)

The user asked why book/shelf cover images could only be set at upload/creation time — not an architectural gap, just UI/endpoints that were never built for the edit forms. Added `PUT /api/books/:id/cover` and `PUT /api/shelves/:id/cover`, a cover field on both edit forms, and a cover display on Shelf Detail's view mode (which previously showed no cover at all). Verified live: replaced a real book's cover, confirmed the old R2 object was actually deleted (`wrangler r2 object get` returned "key does not exist" for the old key).

Frontend: 43/43 bUnit tests passing.

### Library UX polish (2026-07-30, issues #98-100)

User feedback after the Organization phase: the Genre/Tag filters should be multi-select dropdowns instead of free text, filters should apply immediately instead of needing a "Filtern" click, search should suggest matches as you type, there should be a way to clear all filters, and the release-date field should be a real date picker. Landed as three stories — see `Architecture.md`'s "Library facets + multi-value filtering" / "`MultiSelectDropdown` component" / "Library search-as-you-type" / "Library pagination" / "Release date input" rows for the technical detail.

- [x] Story 1 (#98/PR #101) — `GET /api/books/facets`, multi-value `tag`/`genre` filtering.
- [x] Story 2 (#99/PR #102) — `MultiSelectDropdown` component, auto-apply-on-change, debounced search suggestions, "Filter zurücksetzen", and a real pagination bug fix (`LoadBooksAsync` had never sent `page`/`pageSize` since Phase 3 — any library over 20 books silently only showed the first page).
- [x] Story 3 (#100/PR #104) — `InputDate` for release date on both the Upload and Book Detail edit forms.

**Real bug found via live testing, fixed same-day (PR #103)**: right after Story 2 shipped, live-testing found the search box's debounced fetch fired correctly (confirmed via network log and a direct backend check) but the grid/suggestions never updated on screen. A callback reached via `InvokeAsync` from a `System.Threading.Timer` doesn't auto-render the way handlers invoked directly from Blazor's own event pipeline do — fixed with an explicit `StateHasChanged()`. Notably, bUnit's test renderer does not reproduce this gap: a test written specifically to catch it passed even with the bug still present, confirmed by reverting the fix and re-running. This class of bug is live-verification-only.

Live-verified end-to-end on the deployed site after every story: selected multiple tags in the dropdown and confirmed the grid updated with no button click, typed a partial title and confirmed suggestions appeared and navigated to the right book, confirmed "Filter zurücksetzen" cleared state, and confirmed the release-date picker round-trips correctly (`tt.mm.jjjj` placeholder confirmed live, matching the German-locale prediction).

Backend: 68/68 Vitest tests passing. Frontend: 52/52 bUnit tests passing.

### Metadata enrichment (2026-07-30, issue #106/PR #107)

User feedback after Library UX polish: books added from real files often have empty description/genre/publisher/page-count fields since local file extraction (Story 4) can only pull what the file itself contains. Added an "Info abrufen" button next to the ISBN field on both the Upload form and Book Detail's edit form, looking up the ISBN against OpenLibrary and filling only the fields that are still empty — see `Architecture.md`'s "Metadata enrichment (OpenLibrary)" row for the two-call API shape and the description/date-format gotchas found via live probing before implementation.

Frontend: 56/56 bUnit tests passing.

Live-verified end-to-end on the deployed site: on an existing book with an empty description/genre/pages but an already-set publisher and release date, looked up a real ISBN (`9783791500119`) and confirmed description and pages filled in while publisher and release date stayed untouched (genre/cover stayed empty too — this edition had neither in OpenLibrary, handled gracefully with no error). On the Upload form, a bogus ISBN correctly showed "Keine Daten gefunden." with no other side effects.

### Metadata enrichment: review/confirm step + title/author search (2026-07-30, issue #109/PR #110)

Same-day follow-up: the user tried the shipped "Info abrufen" flow live and asked for a review step before OpenLibrary data lands in the form, plus a way to search by title/author instead of only ISBN. Landed: a preview card (per field: "wird gesetzt: X" / "bleibt unverändert" / "keine Daten gefunden") with explicit "Übernehmen"/"Verwerfen" actions, and a new title/author search backed by OpenLibrary's `search.json` — see `Architecture.md`'s "Metadata enrichment review/confirm + search" row for the API shape.

**Real bug found and fixed in the same PR**: OpenLibrary's work `subjects` are plain strings, not `{name}` objects — the original `lookupByIsbn` (issue #106/PR #107) read `subjects[0]?.name`, which silently evaluated to `null` on every real lookup, so genre never actually filled in from the original feature. Confirmed dead via a direct API probe (`work.subjects` returned `["The Lord of the Rings", "Fiction", ...]`, plain strings), fixed to read `subjects[0]` directly, then confirmed working live (a real search-and-select lookup filled "Elves" into the Genre field for a Tolkien book).

Frontend: 61/61 bUnit tests passing.

Live-verified end-to-end on the deployed site: searched "Der Herr der Ringe" on an existing book's edit form, got 8 real OpenLibrary results with cover thumbnails, selected one, confirmed the preview correctly showed "wird gesetzt" for empty fields (description, genre, pages) and "bleibt unverändert" for fields the book already had (publisher, release date, cover), clicked "Übernehmen" and confirmed the fields actually filled in (including the fixed genre field), then ran a second lookup and clicked "Verwerfen" and confirmed nothing changed, then searched a nonsense query and confirmed "Keine Treffer gefunden." with no errors.

### Phase 6 — Dashboard (complete)

Epic #8, scoped to its own description ("Home dashboard: continue reading, library overview, recommendations") rather than the source spec's fuller §121 list (Weiterlesen, Statistiken, Empfehlungen, Trends, Schnellzugriffe, Bibliotheksübersicht) — same scoping-to-the-epic pattern as Phase 5. Landed as two stories — see `Architecture.md`'s "Dashboard (`GET /api/dashboard`)" row for the full technical detail.

- [x] Story 1 (#112/PR #114) — `GET /api/dashboard`: continue-reading list (recent `reading_progress`, capped at 5) and overview counts (books/shelves/favorites/finished). `Home.razor` gained a "Weiterlesen" section (reusing `BookCard`, which gained an optional `Href` override so these cards link straight into the Reader) and a "Bibliotheksübersicht" stat row.
- [x] Story 2 (#113/PR #115) — recommendations: books with no `reading_progress` row at all, newest first, capped at 5. `Home.razor` gained an "Empfehlungen" section, shown only when unstarted books exist.

**Explicitly out of scope this phase**: `user_statistics`/a full Statistics page (epic #12 — at the time, mislabeled v1.5 from a lossy pre-reading of the spec rather than the raw Teil 8/Teil 4 PDFs; corrected to v1.0 and shipped separately, see the "Statistics" entry below), "Trends" (needs cross-user data, out of scope until Discovery/Community), and Home's "Aktuelle Projekte" section (epic #9, v2.0 — left untouched).

Backend deployed manually via `wrangler deploy` after each story (no CI deploy configured for this repo — see the "CI/CD" row in `Architecture.md`).

Backend: 77/77 Vitest tests passing (9 new across both stories). Frontend: 66/66 bUnit tests passing (5 new).

Live-verified end-to-end on the deployed site after each story: confirmed the real Weiterlesen section showed all 4 in-progress books linking to `/read` with correct progress bars, and the overview stat row matched real counts (4 Bücher/1 Regal/2 Favoriten/0 Gelesen). For recommendations, confirmed the section stayed hidden while every book had reading progress, then uploaded a real test book (`bookDownloads/`, user-authorized for in-app testing) without opening it and confirmed it appeared under "Empfehlungen" — then deleted the test book to restore the account to its prior state.

**Phase 6 (Dashboard) is now complete.** Remaining phases per the Master Development Flow: Offline → v1.0 Release.

### Description HTML-stripping fix + Google Books search merge (2026-08-02, issues #117/#119, PRs #118/#120)

User feedback after the Dashboard phase: BookDetail was showing raw HTML markup in the description field for a book enriched via OpenLibrary, and the title/author search should pull from Google Books too, in addition to OpenLibrary, without duplicate results. See `Architecture.md`'s "Description HTML stripping" / "Metadata search (Google Books)" rows for the full technical detail.

- [x] Issue #117/PR #118 — `stripHtml()` (DOMParser-based, strips tags and decodes entities) applied to description text from both OpenLibrary enrichment and EPUB metadata extraction.
- [x] Issue #119/PR #120 — `searchByQuery` merges OpenLibrary + Google Books results, deduped by ISBN-set intersection with a title+author fallback. `EnrichmentSearchResult` gained a `Source` discriminator so selecting a result dispatches to the correct lookup function.

**Google Books requires a free API key, confirmed live**: anonymous/keyless access is hard-blocked (`quota_limit_value: "0"`) — confirmed identically from a sandboxed `curl`, `WebFetch`, and a real browser `fetch()` on the user's own machine, ruling out an IP-specific rate limit. `GOOGLE_BOOKS_API_KEY` ships as an empty constant; Google Books is silently skipped until the user provides a key (safe to embed once obtained — Google's security model for this key type is referrer restriction, not secrecy). Two other free/keyless candidates were probed and rejected: `bigbookapi.com` (401, needs a key) and `archive.org`'s `advancedsearch.php` (works, but data is too noisy/inconsistent for a clean merged result list).

Live-verified end-to-end on the deployed site: re-uploaded a real EPUB (Dragon Rider) whose description previously showed raw `<p class="description">` tags — confirmed clean plain text after the fix, then deleted the test book. Ran a real title/author search ("Struwwelpeter") through the merged search path with Google Books still disabled (empty key) — confirmed the OpenLibrary-only flow (search → select result → apply) still works correctly end-to-end with no regressions from the refactor.

Frontend: 68/68 bUnit tests passing.

### Impressum page (2026-08-02, issue #122/PR #123)

User request: a standard legal Impressum page, footer-linked from every page, doubling as the (not-yet-built) entry point for a secret Bible-reader page reached by clicking the responsible person's name — see `Architecture.md`'s "Impressum page" row.

Shipped with placeholder markers (`[Platzhalter — bitte ausfüllen]`) for the real Name/Anschrift/E-Mail, since that's personal legal content the user has to supply. Live-verified reachable while logged out (cleared `lumina_auth_token` from `localStorage`, reloaded, confirmed no redirect to login) and that the footer link renders on every page.

Frontend: 70/70 bUnit tests passing.

**Not yet done, waiting on the user**: the secret Bible-page link itself (added once that page exists, deprioritized to last per explicit user request).

### Google Books key activated + real Impressum content (2026-08-02)

The user provided a referrer-restricted Google Books API key and their real Impressum details (Name, Anschrift, E-Mail) same-day. `GOOGLE_BOOKS_API_KEY` set in `metadataEnrichment.js`; `Impressum.razor`'s placeholder markers replaced with real content.

Live-verified in two steps: first request from the deployed site returned `403 API_KEY_HTTP_REFERRER_BLOCKED` for `https://watzingerm21052.github.io/` — the key was valid and correctly referrer-restricted, just missing that exact origin in Cloud Console's allowlist. After the user added it, repeated live requests intermittently returned `503 Service temporarily unavailable` (`backendFailed`) before succeeding — a transient Google-side issue, not a config problem, confirmed by retrying until a real result (`"Dragon Rider"`) came back. Ran a real merged search ("Dune Frank Herbert") through the actual Upload page afterward: 8 deduped results spanning both OpenLibrary and Google Books data, no visible duplicates — the original "more results, no double results" request is fully working end-to-end.

### Phase 7 — Offline (2026-08-02, issue #127/PR #128)

The next phase per the Master Development Flow. **Scope note**: the source spec's §100 "Version 1.0 Release — Definition of Done" checklist (Benutzer/Bibliothek/Reader/Organisation/Deployment) does not explicitly list Offline as required for v1.0, even though the Master Development Flow sequences this phase before "V1.0 Release." Flagged to the user before starting; they chose to build it now rather than defer to v1.5. See `Architecture.md`'s "Offline reading (IndexedDB)" row for the full technical detail.

- [x] Issue #127/PR #128 — per-book file caching via IndexedDB, exactly the spec's flow (§99): Buch auswählen → Offline speichern → Ohne Internet lesen. `BookDetail.razor` gained an "Offline speichern"/"Offline entfernen" button (shows the stored size); a new `/offline` page ("Offline Bücher", nav-linked) lists all saved books with total size used; `Reader.razor` falls back to the IndexedDB copy — book metadata and file bytes independently — whenever the corresponding API call fails.

**Deliberately not built this phase**: a service worker / full PWA app-shell offline mode. A misconfigured service worker scope could permanently pin stale assets in a user's real browser across future deploys, given this repo's `<base href>` rewrite for the GitHub Pages subpath (the same mechanism behind issue #38) — a materially different risk profile than IndexedDB's purely additive, per-book, user-initiated caching. Left as a possible future story under epic #13, not filed yet.

Frontend: 79/79 bUnit tests passing (9 new). Backend: unchanged, 77/77 Vitest tests passing (sanity check only — this phase has no backend/DB changes).

Live-verified end-to-end on the deployed site: saved a real book offline from its detail page (button switched to "Offline entfernen (298 KB)"), confirmed it listed correctly on `/offline` with the right total size, then simulated the API being unreachable (overrode `window.fetch` to reject calls to `/api/books/7*` before a client-side navigation into the reader) and confirmed the PDF still opened and rendered correctly from the IndexedDB copy. Confirmed removal via both the detail page and the `/offline` page's "Entfernen" button.

**Found and fixed while writing tests for this phase (not a production bug — bUnit-only)**: bUnit's mocked `IJSObjectReference` needs an explicit `.SetVoidResult()` on a `SetupVoid(...)` handler before an `await module.InvokeVoidAsync(...)` in the component under test will actually resume — the mock records the invocation immediately regardless, so a test asserting only "was the JS function called" can pass even though the code path after that `await` (here: updating `_isOfflineSaved` after a delete) never actually ran in the test. Worth remembering for any future bUnit test around a void JS interop call.

**Phase 7 (Offline) is now complete.** Remaining per the Master Development Flow: V1.0 Release.

### Secret Bible reader page (2026-08-02, issue #130/PR #131)

Standalone easter egg, not part of the original roadmap — the user asked for it same-session as the Impressum (2026-08-02), explicitly deprioritized to build last. Full requirements were gathered in advance (Phil 2:14 on open, curated translation choice, baroque-leaning dark-academia design in both themes, position memory) — see `Architecture.md`'s "Secret Bible reader page" row for the full technical detail.

- [x] Issue #130/PR #131 — `backend/src/routes/bible.ts` + `services/bibleService.ts` proxy `rest.api.bible` behind a curated 5-translation allowlist (NIV 2011, WEB, ASV, Luther 1912, unrevised Elberfelder), deliberately public (no auth) since the page itself is only reachable from the public Impressum. `Pages/Bible.razor` (`/bible`) always opens on Philippians 2:14, with translation switching, book/chapter navigation, and full-text search. FUMS view-tracking wired per api.bible's license. Impressum's responsible-person name is now the entry point; its Urheberrecht section gained the API.Bible copyright paragraph.

**Resolved before building**: verified live against `docs.api.bible` that the auth header is `api-key` (not OAuth2, as suspected) and how FUMS actually works (a `fums-version=3` request param returns a `meta.fumsToken`; the page loads api.bible's own tracker script and reports it). Verified the 5 curated translation IDs live against api.bible's own `/v1/bibles` catalog rather than guessing them from the abbreviation.

Backend: 86/86 Vitest tests passing (9 new — allowlist validation, proxy correctness, error mapping, intro-chapter filtering, search). Frontend: 86/86 bUnit tests passing (7 new).

Live-verified end-to-end on the deployed site: clicking the Impressum name lands on Philippians 2:14 with the verse scrolled-to and highlighted; switching NIV → Luther 1912 reloads the same chapter and refreshes the book/chapter pickers into the German translation's own book list ("Philipper 2" / "Der Brief des Apostels Paulus an die Philipper"); a German full-text search ("Liebe") returned 20 real results, and selecting one navigated to and highlighted that verse; FUMS confirmed firing via real network requests to both `pkg.api.bible` and `fums.api.bible` (200 on each); design confirmed correct in both Classic Library (light) and Dark Library (dark) themes.

### Design Rework (2026-08-02, issue #133/PR #134)

User request directly after the Bible page: a dedicated design pass, Reader first ("drastisch optimiert... dynamische Größe zwecks PDFs"), then app-wide spacing/hover polish, with explicit instruction to take as much time as needed. See `Architecture.md`'s "Design Rework" rows for the full technical detail.

- [x] Issue #133/PR #134 — PDF's reader frame now hugs the actual rendered page shape instead of floating it inside a fixed-shape box (root cause: the frame's own CSS size never adapted to the page's aspect ratio, even though `pdfReader.js`'s scale math already correctly fit both width and height). EPUB's frame swapped a flat `72rem` cap for a responsive `min(94vw, 80rem)`. Both readers' navigation moved below the frame (matching the source spec's three-zone `Zurück/Kapitel/Einstellungen` — content — `Seite/Fortschritt/Navigation` layout), and EPUB's nav gained a live percentage readout. Button-group spacing widened 8px→16px in 4 places, `.form-actions` gained `flex-wrap`, and 4 hover states that changed instantly now transition smoothly.

**Explicitly out of scope this pass** (per the issue): fullscreen, bookmarks, page-turn animation, EPUB two-page spread, a new Home hero/logo, and a full line-by-line audit against every qualitative point in the source spec's Teil 5 (§59-72) — scoped instead to the concrete, actionable items (layout/sizing, spacing, hover/focus, error/empty tone), the last of which was already solid from prior work (no raw technical error text found anywhere in the app).

Frontend: 86/86 bUnit tests passing (1 new assertion).

Live-verified on the deployed site: a real portrait PDF (existing library book) now renders with no dead gutters on either side and the page-nav below the frame; uploaded a real EPUB (Enid Blyton, *The Secret Island*, from the user's authorized local test files) to confirm the wider responsive frame and the new percentage readout (showed "4%" after paging forward), then deleted the test book; BookDetail's 4-button action row now wraps with comfortable spacing instead of a cramped 8px gap.

**Design Rework (Reader half) is complete.** A further app-wide polish pass beyond this issue's scope (e.g. a fuller Teil 5 audit) is not currently planned — only pick it up if the user asks.

### Reader-Erlebnis: cover fix + PDF zoom (2026-08-02, issue #136/PR #137, hotfix PR #138)

Same-day follow-up after Design Rework: the user asked a factual question about reading modes (see below), reported a cover-image stretching bug, and asked for PDF zoom plus per-format pagination-granularity settings. Scoped down (per explicit "denk selber nach, berate dich gegebenenfalls" latitude, confirmed via an advisor consultation) into three separately-sized pieces rather than one large story: this one (cover fix + zoom, small/well-defined, built first), a Reader Settings story (font/line-spacing/margins, spec-defined, not yet started), and reading-modes + per-format pagination (the large, open-ended one — deferred, not filed).

**Reading-modes fact-check, answered directly rather than built to spec a misremembering**: the source spec (Teil 2 §14.1) defines exactly **two** reading modes — "Mode A – Book View" (paginated, page-turn animation, book margins) and "Mode B – Scroll View" (continuous scroll) — plus mobile-only swipe-to-turn-pages. Neither is named "Kindle" or "Modern"; "Kindle" appears elsewhere (§59.2) only as a design-inspiration citation, and "Modern" is a theme name (Modern Light), not a reading mode. Not implemented this pass — see the deferred story below.

- [x] Issue #136/PR #137 — `.book-detail`'s missing `align-items` (defaulting to `stretch`) was overriding the cover wrapper's `aspect-ratio: 2/3` on the Edit form's long field list, reproduced live on book #7 (computed wrapper height 1194px, not 288px); fixed with `align-items: flex-start`. `.enrichment-search-cover` gained the same `aspect-ratio`/`object-fit` lock the other two cover spots already had. PDF zoom (+/−/reset, 50%–250%, persisted like font size) added to `PdfReader`.
- [x] Hotfix PR #138 — live-verifying the zoom feature immediately after deploy caught a real crash (pdf.js throws on overlapping `render()` calls on the same canvas, easily triggered by clicking zoom faster than a page renders); `renderPage()` now serializes per reader instance. See `Architecture.md`'s "PDF zoom" row for the full detail.

Frontend: 86/86 bUnit tests passing (1 new assertion; PDF zoom's actual concurrency behavior isn't bUnit-testable — real pdf.js/canvas rendering — so it's covered by live verification only, same stance as the rest of the PDF/EPUB reader).

Live-verified on the deployed site: cover on book #7's Edit page (long form) renders at correct 2:3 proportions instead of a stretched strip. PDF zoom stress-tested with 24 zero-delay programmatic clicks (10 up/6 down/8 up) after the hotfix, settling correctly at the 250% cap with no crash, then 15 more settling at the 50% floor — confirming the race fix holds even far beyond realistic human click speed. (First test round, before the hotfix, did crash exactly as expected — that's what caught the bug.)

**Deferred, not filed as an issue yet**: per-format pagination granularity for TXT/MD (page-break markers/paragraph pagination) — a new text-chunking layer that interacts with `reading_progress.position`'s per-format meaning (CFI/page-number/scroll-fraction) in a way that needs a decision before implementation, not after. (Reader Settings shipped 2026-08-03; the EPUB/PDF half of reading-modes — Book View/Scroll View toggle — shipped 2026-08-03, issue #174, see below.)

### EPUB piracy-watermark stripping (2026-08-02, issue #141/PR #142)

Same-day follow-up: several real test EPUBs carry an "OceanofPDF.com" link/text stamped into every chapter (a ripping tool's signature, not a one-off page), which the user asked to remove if it could be done cleanly. See `Architecture.md`'s "EPUB piracy-watermark stripping" row for the full technical detail.

- [x] Issue #141/PR #142 — `epubReader.js` gained a content hook that removes the injected watermark link/wrapper from each chapter before it's paginated, without touching the stored uploaded file.

Frontend: 86/86 bUnit tests passing (unaffected — real epub.js rendering isn't bUnit-testable, same stance as the rest of the EPUB reader). Live-verified: uploaded a real affected EPUB, scripted 40 forward page-turns spanning multiple chapter boundaries, zero watermark occurrences in any rendered page; test book removed afterward.

### Reader Settings: typography (2026-08-03, issue #147/PR #148)

Next planned step per the deferred list above (§14.2 — font family, line-spacing, page width; size and color themes already existed). See `Architecture.md`'s "Reader Settings (typography)" row for the full technical detail, including the EPUB live-update mechanism.

- [x] Issue #147/PR #148 — font family (serif/sans), line-height (tight/normal/loose), page width (narrow/normal/wide) added for TXT/MD/EPUB, persisted client-locally. EPUB updates the currently-displayed page live, without a page turn. PDF's reader-controls bar (previously showed dead font-size buttons) is now hidden entirely. Folds in and closes #146 (EPUB/MD images now scale responsively) along the same code path.

Frontend: 87/87 bUnit tests passing (1 new test covering the typography controls' presence and live class application; EPUB's actual live-restyle behavior isn't bUnit-testable — real epub.js/iframe rendering — same stance as the rest of the EPUB reader, covered by live verification only).

Live-verified on the deployed site: uploaded a real Markdown test file with an embedded image, confirmed font/line-height/width switch correctly and the image stays responsively constrained at every width; opened a real EPUB (Cornelia Funke, *Die Feder eines Greifs*) and confirmed all three settings apply immediately to the currently-visible page with no page turn; confirmed PDF shows no reader-controls bar at all. Test book removed afterward.

### Reader Settings: dropdown menu, real page-width/image fixes, EPUB crash fix (2026-08-03, issue #150/PR #151/#152/#153)

Same-day follow-up: the user tried #148 live and reported the settings should be a dropdown menu, page width did nothing on EPUB, and images still didn't scale with font size. All three were real bugs, not misunderstandings — see `Architecture.md`'s "Reader Settings: dropdown menu + real fixes" and "EPUB: serialize rendition operations" rows for the full root-cause detail (in short: epub.js owns `body`'s inline width/padding for its own pagination math, so a stylesheet rule can never win against it; and epub.js registers its own `!important` image-sizing rule that silently beat ours).

- [x] Issue #150/PR #151 — settings consolidated into a single dropdown menu (same pattern as `MultiSelectDropdown`); EPUB page width now resizes `.epub-reader-frame` itself and calls `rendition.resize()`; images switched to `max-width: min(100%, 28em)`.
- [x] PR #152 — found during live-verification of #151: images still weren't scaling on EPUB specifically, because epub.js's own Layout code sets `max-width` on every image with `!important`. Fixed by matching `!important`.
- [x] PR #153 — found during live-verification of #152 (a deliberate rapid-click stress test, same kind that caught the PDF reader's canvas race in #138): clicking through EPUB pages faster than epub.js's own async page-turn completes crashed the reader. Every rendition-touching call now runs through a per-instance serial queue.

Frontend: 87/87 bUnit tests passing.

Live-verified end-to-end on the deployed site, each fix confirmed via direct DOM/CSSOM inspection rather than just visual screenshots: page-width toggle visibly resizes the EPUB frame and reflows pagination; a real embedded illustration's rendered width was measured before/after a font-size change and tracked it correctly (`getComputedStyle` showed `max-width: min(100%, 560px)` at 20px, i.e. 28× the current font-size); 30 zero-delay `next()` clicks plus a mixed next/prev/resize/setting-change stress sequence both completed with no crash and no error boundary.

### Backlog additions (2026-08-02, not yet started)

Three items filed for later, explicitly not to be picked up without being asked:
- **Issue #140** — a real professional favicon/logo/Home hero banner, replacing the current Blazor-template placeholder favicon and the text-only header wordmark.
- **Issue #143** — a much larger "Dark Academia/Baroque Experience" theme system for the Bible page specifically (selectable in settings, full-viewport animated parallax background, scroll-triggered animations, page-turn transitions, dedicated typography/color system) — a detailed multi-section spec from the user, preserved verbatim in the issue.
- **Issue #144** — a small QoL bundle: a real confirm-dialog/modal component (delete confirmation is currently an inline button-swap duplicated in `BookDetail.razor`/`ShelfDetail.razor`, no modal component exists in the codebase), reader keyboard navigation (arrow keys/spacebar page-turning), drag-and-drop file upload.

### Full Master Project Bible re-read + Statistics re-scope (2026-08-03, issue #156)

The user asked directly whether every file under `documentation/master-project-bible/` had actually been read in full — the honest answer was no: only Teil 2 (Feature Specification) and Teil 5 (UI/UX Design System) had been read as raw PDFs; everything else (Teil 1, 3, 4, 6/AI Guidelines, 7/Implementation Blueprint, 8, 9) had only been sourced from `extracted-spec-summary.md`, a lossy prior research-agent summary. Instructed to "read ALL docs and then continue with the missing stuff" — all 9 parts are now read in full.

Repo-hygiene/process cross-check against Teil 8 §115 (LICENSE/CONTRIBUTING.md/CODE_OF_CONDUCT.md/CHANGELOG.md/issue+PR templates) and Teil 9's GitHub PM taxonomy (Epics/Milestones/Labels) found both already fully satisfied — no action needed there.

**One real gap found**: Teil 8 §114's Master Development Flow places Dashboard (which includes "Statistiken" per §121) before the V1.0 Release milestone, and Teil 4 §51's `user_statistics` table carries no "Spätere Version" deferral marker — unlike Bookmarks (§48.2), Highlights (§48.3), and Comments (§50.3) in the same document. Epic #12 had been scoped to v1.5 (and Phase 6/Dashboard's write-up above explicitly deferred it there) — a decision made before the raw Teil 8 PDF had been read. Corrected to v1.0 and shipped as issue #156: `GET /api/statistics` (books read/in-progress, estimated pages read from `book_metadata.pages` weighted by progress percentage, genre breakdown among started books, recent activity) and a real `Statistics.razor` replacing its `EmptyState` stub. See `Architecture.md`'s "Statistics" row for the full technical detail, including why `readingTime`/"Lesedauer" stays out of scope (no session-time instrumentation exists to derive it from).

Backend: 94/94 Vitest tests passing (8 new). Frontend: 92/92 bUnit tests passing (5 new). Backend deployed via `wrangler deploy`.

Live-verified end-to-end on the deployed site against the real account: 1 gelesenes Buch / 1 in Arbeit / 24 gelesene Seiten matched the real reading history, genre breakdown showed "Unbekannt" and "Children's fiction" (1 each), and "Zuletzt gelesen" listed both real in-progress books with correct progress bars linking into the Reader.

### EPUB table of contents / chapter navigation (2026-08-03, issue #159)

A second gap found during the same full spec re-read: Phase 4 (Reader) was marked complete above, but Teil 8 §119 lists "Inhaltsverzeichnis"/"Kapitelnavigation" as separate items from pagination, and neither existed anywhere in the reader — only Weiter/Zurück page-turning. Scoped to EPUB only (the only format with a real chapter structure via epub.js's `book.navigation.toc`). See `Architecture.md`'s "EPUB table of contents / chapter navigation" row for the technical detail.

Frontend: 93/93 bUnit tests passing (1 new).

**Live verification hit the rAF-throttling automation artifact already documented in memory, and it's worth recording how it was actually diagnosed this time**: after deploying, the "📑 Inhaltsverzeichnis" button never appeared, with no console error at all — not even after adding temporary diagnostic logging and a 5-second timeout race around the `getToc()` call (issues found and reverted in the same pass, PRs #161/#162). The absence of *any* log, even from the timeout side of the race, was the key clue: it meant the code never reached that point at all, i.e. `init()`'s own `rendition.display()` call — not `getToc()` — was the thing hanging, blocking the entire `OnAfterRenderAsync` continuation silently. Confirmed by patching `requestAnimationFrame` (`window.requestAnimationFrame = cb => setTimeout(cb, 0)`) via the browser console and retrying through a same-document client-side navigation (a full page reload would have dropped the patch) — the reader then loaded correctly, the TOC populated with all 60 real chapters of a real book (Cornelia Funke, *Die Feder eines Greifs*), and clicking "5. Der Einzige seiner Art" navigated the rendition to the exact right chapter, confirmed visually (illustration + chapter heading + text). The diagnostic logging was reverted once root cause was confirmed, since real users in a normally-focused tab don't hit this.

### EPUB page-turn fade transition + swipe-to-turn-page (2026-08-03, issue #155 Teil A)

Third item picked up in the same pass, already scoped and flagged as "a good next Reader step" during the Book View investigation that filed #155: a subtle fade transition on `next()`/`prev()` (§66: calm, not showy) and touch-swipe-to-turn-page for mobile (§14.1's "Mobile zusätzlich: Wischen zum Umblättern"). Teil B (a real format-independent Book View/Scroll View toggle) stays out of scope. See `Architecture.md`'s row for the technical detail.

Frontend: 93/93 bUnit tests passing (pure JS/CSS change).

**A real timing bug was found and fixed via direct instrumentation, not full page-load verification** (PR #165): a `MutationObserver` watching the frame's class list around a real `next()` call (run directly against the live, already-loaded `EpubReader` instance via `javascript_exec`) showed the `--turning` class being added and removed only ~55ms apart — well before the CSS transition's 180ms duration completes. Adding a class only *starts* a CSS transition, it doesn't block until the animation finishes, so the original code was swapping the page mid-fade rather than while the frame was actually hidden. Fixed with an explicit wait matching the transition duration before calling `next()`/`prev()`.

**Full page-load live verification (clicking Weiter/swiping and watching a real chapter transition) could not be completed this pass** — every attempt to open the reader from a fresh navigation hung indefinitely before the EPUB code even ran (no `/api/reading/{id}` request ever fired, i.e. stuck earlier than Story 4's rAF-specific hang), across a hard reload, same-document navigation, a brand-new tab, and combinations with the `requestAnimationFrame` patch. This reads as the same class of automation-tab-throttling issue already documented in memory, just presenting earlier in the load sequence than previously seen (WASM execution broadly deprioritized for a backgrounded tab, not only `requestAnimationFrame` specifically) — not treated as a code defect, per memory's explicit guidance not to chase a "fix" for this hang pattern in code that's otherwise correct. The class-toggle mechanism itself, timing included, was confirmed correct via the direct `MutationObserver` test above; the visual page-turn experience and swipe gesture are believed correct from code review and that direct test, but not confirmed end-to-end in a real page load this pass.

**Follow-up attempt (same day, later)**: a fresh tab did load the reader correctly this time (real book content and illustrations rendered, confirmed via screenshot), and a real UI click on "Weiter" — observed via a `MutationObserver` attached beforehand — showed the frame's `--turning` class added and the computed `opacity` genuinely reaching `0` (the fade-out completing correctly, confirming the PR #165 timing fix works as designed on a real click, not just the earlier synthetic test). However, `rendition.next()` itself then hung indefinitely with the frame stuck fully transparent — the exact same automation-only hang pattern, this time on `next()` rather than `init()`'s `display()`. The `runSerialized` queue means that specific tab's reader is now permanently stuck until reloaded; not retried further this pass. Net effect: every stage of the transition mechanism has now been individually confirmed correct (class toggle timing, fade-out actually reaching full transparency) except the final fade-*in* after a real `next()` resolves, which remains unconfirmed end-to-end due to the environment issue, not a known or suspected code defect.

### QoL bundle: ConfirmDialog + drag-and-drop upload (2026-08-03, issue #144 points 1 and 3)

Two of the three independent items from the QoL backlog issue, picked without design-taste ambiguity (unlike #140's banner or #143's theme system, both of which need the user's own visual direction first). See `Architecture.md`'s "ConfirmDialog component" / "Drag-and-drop file upload" rows for the technical detail.

- [x] Point 1 (PR #168) — a real `ConfirmDialog` overlay component, replacing the inline button-row-swap duplicated in `BookDetail.razor`/`ShelfDetail.razor`.
- [x] Point 3 (PR #169) — drag-and-drop on the upload form's file/cover inputs and both detail pages' cover-replace inputs, via a pure-CSS technique (native file input sized to fill the dropzone).
- [x] Point 2 (reader keyboard navigation, PR #171, refocus fix PR #172) — picked up after all — see the dedicated write-up below.

Frontend: 99/99 bUnit tests passing (6 new).

Both fully live-verified against production, unlike the EPUB-reader-dependent work earlier in this pass — neither touches epub.js, so neither hit the rAF/tab-throttling automation artifact:
- **ConfirmDialog**: clicked "Löschen" on the real book detail page, confirmed the overlay opened ("Buch wirklich löschen?"), clicked "Abbrechen", confirmed it closed with no DELETE request sent and the book (real user data) left untouched.
- **Drag-and-drop**: dispatched a real `DragEvent`/`DataTransfer` sequence matching what an actual OS-level file drop produces (a `File` added to a `DataTransfer`, assigned to the input's `.files`, then a `change` event) and confirmed the file was accepted with no validation error — proving the drop-onto-input mechanism works, not just the CSS highlight. Along the way, an *incomplete* synthetic `DragEvent` (missing a `dataTransfer` object entirely) was found to throw a framework-level parsing exception — confirmed this only affects hand-rolled test events, since a real browser-native drag always populates `dataTransfer`.

### Reader keyboard navigation (2026-08-03, issue #144 point 2)

Picked up after all, once the ConfirmDialog/drag-and-drop verification confirmed the automation environment was behaving normally again. ArrowRight/Space advances, ArrowLeft goes back, in EPUB, PDF, and the Bible reader; TXT/MD correctly excluded (continuous-scroll, no next()/prev() concept). See `Architecture.md`'s row for the technical detail — EPUB needed two listeners (outer frame + per-section iframe content hook, same split as the existing swipe gesture), PDF's is scoped to the viewport specifically so the page-number input keeps native arrow-key cursor movement, and Bible's is scoped to the chapter article so the Übersetzung/Buch/Kapitel dropdowns and search input are unaffected.

Frontend: 102/102 bUnit tests passing (3 new).

**Live verification found and fixed a real bug in the Bible reader, and reached mixed results across the three readers overall**:
- **Bible — fully verified, bug found and fixed**: the first live pass found ArrowRight worked exactly once, then did nothing on a second press. Root cause: loading a new chapter re-renders `<article>` as a fresh DOM element, dropping focus back to `<body>`. Fixed by re-focusing whenever a genuinely new chapter has rendered (PR #172). Re-verified after the fix, on the real production account: clicking into the chapter text and pressing ArrowRight twice in a row (via synthetic `KeyboardEvent` dispatch, since the `computer` tool's native key-press simulation proved unreliable against this specific focused element in this session — the JS-level dispatch is a faithful equivalent, since Blazor's event pipeline doesn't distinguish trusted from synthetic events) correctly advanced Philipper 2 → 3 → 4, confirming both the navigation and the refocus fix.
- **PDF — partially verified**: the only PDF in the account (a one-page tournament flyer) can't demonstrate an actual page *advance*, but confirmed the keydown reaches the handler cleanly with no error and correctly stays on page 1 (there is no page 2) — combined with the passing unit test (which does assert `next()`/`prev()` are called) and the fact that `NextAsync()`/`PrevAsync()` are the exact same already-proven methods the Weiter/Zurück buttons call, this is treated as sufficient confidence without a genuine multi-page test file.
- **EPUB — not verified this pass**: every attempt to reach a loaded reader hit the same rAF/tab-throttling automation artifact documented in memory and encountered repeatedly earlier in this session (for `init()`'s `display()` and later for `next()`) — the outer frame's iframe never appeared even after the same-document-navigation-plus-rAF-patch recipe that worked earlier in this session. Per memory's explicit guidance, not treated as a code defect: the keydown wiring is unit-tested, and the per-section content-hook registration mechanism (`attachKeyboardHandler`) is structurally identical to `attachSwipeHandler`, `buildContentRules`, and `stripPiracyWatermarks` — all three already proven working in production earlier in this session.

### EPUB scroll mode + PDF continuous scroll (2026-08-03, issue #174/PR #175)

Issue #155 Teil B — the real, format-independent Book View/Scroll View mode toggle flagged as the big architectural piece when #155 was split (Teil A, the fade transition + swipe, shipped earlier this session). Scoped down via `AskUserQuestion` rather than assumed: EPUB scroll mode only (TXT/MD real pagination stays a separate, later story — page breaks there depend on font size/window width, unlike EPUB's fixed spine or PDF's fixed page geometry), plus PDF gained a new continuous-scroll rendering mode alongside the existing single-canvas Book View (the user's own choice, not the recommended "leave PDF page-only" option). See `Architecture.md`'s "Reader mode toggle: EPUB scroll + PDF continuous scroll" row for the technical detail.

Frontend: 105/105 bUnit tests passing (3 new: TXT hides the toggle, EPUB scroll mode hides page-turn buttons + applies the scroll class, PDF scroll mode calls `setFlow`).

**A real `IntersectionObserver` leak was caught by an advisor review before shipping, not by live testing**: `initScrollView` (PDF) is re-entrant — called on every zoom-change while already in scroll mode, not just the book→scroll transition — but only `teardownToBookView` was disconnecting the previous pass's two observers. Every zoom click in scroll mode was leaking both observers, still holding references to the just-cleared wrapper elements. Fixed by calling `teardownScrollObservers` as the first line of `initScrollView` itself. Also confirmed before deploying (not assumed) that `"scrolled"` is a valid `flow` value in the vendored `epub.min.js` bundle, since an unrecognized value fails silently (falls back to the default manager with no error) rather than throwing.

Both modes fully live-verified against production. **EPUB** (book #8, a real 60-chapter novel): switched Buch→Scroll, confirmed the vertical scrollbar appeared and the "Zurück"/"Weiter" buttons disappeared, scrolled through several paragraphs of real content with no visual glitch, switched back to Buch and confirmed the same paragraph was still on screen (CFI position preserved across the rendition teardown/rebuild), `localStorage.lumina_reader_mode` read back `"scroll"` as expected, zero console errors throughout. **PDF** (book #7, a one-page flyer — can't demonstrate the lazy multi-page `IntersectionObserver` path specifically, same known gap as the keyboard-nav story above): switched Buch→Scroll, confirmed the frame re-laid-out into the new centered/bordered wrapper style with no crash, clicked zoom `+` twice in a row while already in scroll mode (the exact re-entrant path the observer-leak fix targets) and confirmed a clean re-render each time, switched back to Buch and confirmed the single-canvas page still rendered correctly at the new zoom level. Zero console errors on either format.

### Favicon + header logo mark (2026-08-03, issue #140 favicon+logo part/PR #177)

Picked up next per the user's own choice (asked directly whether to start with #140 or the Bible-page Dark-Academia theme, #143). Motif "Licht + Chronik" — a candle flame merging with an open book — decided via `AskUserQuestion`. Scoped to favicon+logo only this round; the hero banner (also part of #140) stays deferred, issue kept open. See `Architecture.md`'s "Favicon + header logo mark" row for the technical detail.

Five candidates were generated (1 hand-crafted SVG, 4 AI via Canva) and shown side-by-side in a published comparison artifact; the user picked the AI contour-line candidate. **The first delivery attempt was rejected on real quality grounds** — a freehand-redrawn SVG approximation of the chosen artwork, called out directly ("sieht noch ziemlich scheiße aus und nicht sehr detailiert wie das andere"). The fix was process, not effort: instead of eyeballing curves by hand, the actual generated PNG was vectorized (upscale + light blur + `potrace` trace) so the shipped mark matches the artwork the user actually approved, not an approximation of it.

Frontend: 105/105 bUnit tests passing (no new tests — no existing convention for testing header/favicon markup in this codebase).

**A real bug was caught mid-process, before any live testing**: potrace's `<path>` output carries `fill-rule="evenodd"` after the `d` attribute — an early trace script extracted only `d` via regex, silently dropping it, which made the default nonzero winding rule fill in the candle/flame's hollow interior as a solid blob instead of a hole. Also: nearest-neighbor upscaling was tried first (correctly preserved hole colors, unlike bicubic which bled background color into them) but produced a literal pixel staircase that potrace's curve optimizer couldn't smooth regardless of tolerance, since its merge logic needs runs of same-direction corners and a NN staircase alternates every pixel — bilinear upscale + a light blur solved both problems at once (smooth edges, intact holes). Live-verified against production: all 5 shipped asset URLs (`favicon.svg`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png`, `branding/logo-mark.svg`) returned `200` via a cache-bypassing `fetch`, the header mark renders crisply next to the Fraunces wordmark on the real deployed Home page, zero console errors.

### Home page hero banner (2026-08-03, issue #140 hero banner part/PR #179 — closes #140)

Picked up immediately after, continuing the same issue without being re-asked ("continue with that"). Spec §60.2's four required elements: geöffnetes Buch, dezente Weltkarte, Lichtstrahlen, alte Bibliotheksatmosphäre. See `Architecture.md`'s "Home page hero banner" row for the technical detail.

4 candidates generated via Canva, shown in a published comparison artifact alongside the existing `bible-hero.jpg` as a mood reference (the user confirmed that existing Bible hero is fine as-is, not part of this round). The user's own read matched the recommendation: candidate C, where the world map sits quietly behind the light rays rather than competing with the book — the other two map-containing candidates were rejected for a too-dominant map, one of them with illegible AI-generated pseudo-text baked into it. All 4 saved under `documentation/branding/hero-banner/`.

Frontend: 104/105 bUnit tests passing — 1 pre-existing failure (`HomePageTests.Home_ShowsOverviewCounts_FromDashboardEndpoint`) found during this pass, confirmed unrelated via `git stash` (fails identically on unmodified `main`), filed separately as issue #180 rather than fixed here (root cause not investigated — out of scope for a hero-banner change).

### Reader "Realistische Ansicht" — PDF half shipped, EPUB deferred (2026-08-03, issue #182, PRs #183-188)

User-requested third reader mode ("bei den reader ansichten fehlt... die 'buchoptik'... man wischen kann zum blättern wo es dann vom unten rechten blatteck so rüberwischt die seite in so einem bogen"), alongside the existing Buch/Scroll modes (both left unchanged) — not a spec item, a deliberate opt-in exception to §66/§64.4's "keep animation restrained" default, same category as the Bible page's Dark-Academia theme. Scoped via `AskUserQuestion`: EPUB + PDF, a real page-flip library (not CSS-only), replacing the fade only in the new mode. See `Architecture.md`'s "Reader 'Realistische Ansicht'" row for full technical detail.

Library choice (`page-flip`/StPageFlip 2.0.7) was researched and its two required interactions (drag-follow-finger, tap-a-corner) confirmed native before any code was written. The harder architectural question — how to get discrete page images out of EPUB's reflowable, iframe-rendered content vs. PDF's already-discrete canvas pages — was tested empirically before committing: a cheap SVG-`foreignObject` rasterization trick was confirmed to fail (Chromium taints the canvas unconditionally), while `html2canvas` was confirmed to work but at a real cost (~735ms/page, captures the whole multi-column strip not just one page).

**Shipped**: PDF's realistic mode, live-verified against a real 25-page illustrated PDF uploaded specifically for this (the account's only prior PDF was a 1-page flyer). Three real bugs found and fixed via live verification (container collapsing to 0×0 from a CSS/flex percentage-sizing interaction, Blazor's `style` attribute binding clobbering JS-set inline styles on re-render, an intermittent pdf.js render hang traced to this repo's own documented automation-tab-throttling gotcha rather than a real app defect) — see `Architecture.md` for the full sequence.

**Deferred**: EPUB's realistic mode. PDF's eager "render every page up front" approach doesn't scale to EPUB novels — there's no "render page N" primitive for reflowable content, only "navigate to a location, then rasterize what's showing," at ~735ms/page. A 300-page novel would mean minutes of loading before the reader even opens, not the 10-16s PDF users see. This needs a genuinely different lazy/progressive-capture architecture (placeholder images + `updateFromImages` as pages are captured on demand), not a port of PDF's approach — scoped out as its own follow-up, **issue #189**, rather than either rushed or silently dropped. User confirmed this split directly: "Ship PDF now, defer EPUB". The Ansicht toggle is gated to PDF-only in the UI until #189 ships, so EPUB readers never see a "Realistisch" option that would silently do nothing.

Frontend: 106/107 bUnit tests passing (1 pre-existing failure, issue #180, unrelated).

### EPUB Realistic View — lazy-capture attempt made and reverted (2026-08-04, issue #189, PRs #191-198, reverted)

Attempted the lazy/progressive-capture architecture scoped out above: capture only the current page into a StPageFlip overlay on entering Realistic View, prefetch one page ahead in the background, capture on demand as navigation reaches unvisited territory. Two empirical spikes confirmed the load-bearing assumptions before any code was written — `page-flip`'s `updateFromImages()` can grow the page array after `loadFromImages()` while preserving the current index, and epub.js reveals successive pages within a section by scrolling `.epub-container` horizontally by one column-width (`scrollLeft` as the position signal, since epub.js exposes no page-number primitive of its own).

Five real bugs were found and fixed via live production testing, each confirmed against the actual deployed app rather than guessed at: `html2canvas({backgroundColor: null})` flattening to solid black on JPEG export (no alpha channel — fixed by passing an explicit opaque background); `rendition.next()`'s promise resolving before the browser had actually painted (fixed with a double-`requestAnimationFrame` settle); blank captures on a freshly loaded section (added blank-pixel detection with retry); a `scrollLeft`/crop-width race against epub.js's own column relayout, caught via temporary diagnostic logging; and, at the actual root, images inside a section still loading and reflowing the column count (3→11 columns observed live) well after `html2canvas` had already started — fixed by waiting for every `<img>` in the section to finish loading before taking any capture-coordinate measurement (PR #198).

That last fix made forward single-page-turn navigation succeed reliably (`stale=false` on the first capture attempt, confirmed by comparing the rendered capture byte-for-byte against the real rendition's text with the overlay hidden). But it did not hold up: further live testing showed pages captured after a **section boundary** (not just a column change within one section) still rendered stale/blank content even with `scrollLeft` and container geometry reported as fully stable — epub.js swaps in a new iframe per section, and the capture model (read `.epub-container.scrollLeft`, crop that slice out of a whole-section `html2canvas`) doesn't reliably survive that swap. Fixing this needs a different capture strategy for section transitions, not another retry/wait tweak — a second design pass, not a bug fix.

Given 8 PRs of incremental fixes without reaching a fully working feature, and live diagnostic `console.error` calls that had ended up shipped to production between fixes, decided to revert rather than patch further: `epubReader.js`, `EpubReader.razor`/`.razor.cs`, `app.css`, `Reader.razor`'s toggle gate, and `ReaderPageTests.cs` were all restored to their pre-#189 state (commit `0c2ae46`, the last-known-good PDF-only-gated state from PR #188). Issue #189 stays open with this findings, in particular the section-boundary limitation, so a future attempt starts from a real map instead of from zero. PDF's Realistic View (shipped in #182) is untouched by this revert.

Frontend: 106/107 bUnit tests passing (same 1 pre-existing failure, issue #180, unrelated) — confirmed after the revert, not just before.

### EPUB Realistic View — section-capture architecture, gated back off after user testing (2026-08-04, issue #189 reopened, PRs #200-208)

Picked back up on user request ("can we make epub working somehow with a method to be like a realistic book?") with a genuinely different architecture from the reverted attempt above, rather than another patch on the same design: instead of live-capturing one page at a time (racing epub.js's own column relayout, the failure mode that sank #191-198), capture an entire epub.js CSS-multi-column **section** in one `html2canvas` call — epub.js lays out every column of a section in the DOM simultaneously, even ones scrolled out of view — then slice that single canvas into per-page images locally with plain canvas math. Navigating within an already-captured section becomes a pure local array lookup, no DOM measurement or live capture involved, which is exactly the race the old design couldn't avoid. Validated with a live spike against the real production page before any code was written, per this project's "measure before generalizing across formats" discipline.

Four real bugs found and fixed via live production testing, each confirmed against the actual deployed app:

- **`onclone` clone-width bug** (PR #202): `html2canvas` clones the target element into an off-screen document before rendering, and the clone inherits the *live* single-column DOM's inline `width` — the `width`/`windowWidth` options only size the output canvas, not the clone's own box. Only column 1 rendered; everything past it was empty background. Fixed via an explicit `onclone` callback forcing the clone's width to the full section width.
- **Stride miscalculation** (same PR #202): an earlier live spike had assumed `column-gap` (112px, present in `getComputedStyle`) contributes to the slice stride. Confirmed empirically across two sections that `scrollWidth` divides evenly by `columnWidth` *alone* (4074/1358=3, 5432/1358=4) — the gap doesn't contribute to the container's scrollable width at all. Fixed by dropping it from the stride.
- **The spread bug this round was actually chasing** (PRs #203-205): the user reported Realistic View rendering two-page spreads too wide for the reader viewport. First hypothesis — `showCover: true` (copied from `pdfReader.js`'s realistic mode, where it's correct for scanned book leaves) pairing independently-padded page captures into spreads — turned out to be a red herring; StPageFlip's own docs confirm `showCover` only marks the first/last page as a standalone "hard cover," not a single-vs-spread display control. The real cause, found by reading the vendored `page-flip.browser.js` source directly: `autoSize` defaults to `true`, which forces the book container's own `style.width` to `"100%"` of its parent on every construction/resize/orientation pass, silently overriding whatever explicit width this code set — on the widened "Breit" viewport (see below) or after any window resize, that 100% comfortably exceeds 2x the single-page width, so StPageFlip's own portrait-vs-landscape check picked a genuine two-up spread. Fixed with `autoSize: false`; confirmed via direct DOM inspection (`.stf__wrapper`'s `--portrait` class and a single 1358px-wide canvas, not the screenshot — CDP screenshots don't force a real compositor/rAF frame on this environment's backgrounded automation tabs, and a frozen mid-flip page-curl animation was repeatedly mistaken for a structural spread bug before this was worked out) that single-page mode now holds across a flip, not just the first render.
- **Cold-start capture failure** (PR #206): found while re-verifying the fix above — loading the reader page with "Realistisch" already persisted from a previous session (a real scenario, not a test artifact) threw `Cannot read properties of null (reading 'scrollWidth')` on every load and silently fell back to Book View. epub.js swaps in a fresh iframe while the capture function's `waitForImagesToLoad()`/`settlePaint()` awaits are pending on the very first render, before its own post-display layout has necessarily finished settling; the iframe reference grabbed before those awaits was already detached by the time its container was read afterward. Manually switching to Realistic View later in a session never hit this, since epub.js has long since finished settling by then — which is why every earlier manual test in this round had passed. Fixed by checking `iframe.isConnected` after the awaits and retrying the section (reusing the existing capture-attempt backoff) instead of throwing straight to the fallback.

Separately, in response to further user feedback in the same conversation ("the 2 pages are to wide to get displayed"... "also please add a possibility to make it bigger (also at the PDF book)... we can at least use 90% of the website width, we dont have to display everything just in the middle third"): the reader panes' width caps were mostly rem-limited (80rem/100rem) rather than viewport-driven, pinning the reading column to a fixed pixel width regardless of how wide the actual browser window was. Bumped the vw fraction and rem ceilings for Normal/Breit so they use significantly more of the window on wide screens, and gave `PdfReader` the same `PageWidth`/Seitenbreite parameter and viewport/nav width classes `EpubReader` already had — PDF previously had no width control at all, only zoom.

Frontend: 106/107 bUnit tests passing (same 1 pre-existing failure, issue #180, unrelated).

Backward navigation (`realisticPrev`/"Zurück") and crossing a real section boundary mid-flip were not re-verified end-to-end live this round — the same automation-tab backgrounding that produced the frozen-animation false positive above also means StPageFlip's flip animation genuinely cannot complete when the tab is hidden (`document.hidden: true`, confirmed directly; `requestAnimationFrame` categorically does not fire for hidden documents in Chromium), so no amount of retrying converges on a clean end-to-end confirmation in this environment. Verified by code inspection instead: `reportRealisticProgress` looks up whichever section contains the current flat page index and reports that section's CFI regardless of navigation direction, which is correct going backward too, and `flipPrev()` at the first loaded page is StPageFlip's own library-internal clamp.

**Turned out not to actually work (PR #208)**: the automation-environment limitation above wasn't just an inconvenience for verification — it meant this round's fixes shipped without ever once seeing a genuinely working, unfrozen StPageFlip instance end-to-end. The user reported Buch View and Realistisch View rendering *identically* in their real browser, with no visible error or fallback indication — StPageFlip was silently failing to initialize (a `"Realistic View: section captured blank after max attempts"` background-prefetch error surfaced in the console, a genuine production capture failure distinct from anything fixed above) and the kept-alive underlying rendition showed through in its place. Given issue #189's history at this point (8 reverted PRs, then 7 more finding a new real bug each time this round), agreed with the user to gate the "Realistisch" toggle back off for EPUB rather than keep shipping fixes this environment cannot verify end-to-end. `epubReader.js`'s section-capture implementation is **left in place, not reverted** — kept as a starting point for a future attempt, per explicit request — only `Reader.razor`'s toggle is hidden again, mirroring the pre-#189 PDF-only gate. An already-persisted `"realistic"` mode for EPUB is now coerced back to `"book"` in `OnParametersSetAsync`, since a stale persisted value would otherwise keep silently failing to init on every load even with the toggle hidden — confirmed to be exactly what was happening in the user's own account. PDF's Realistic View (shipped in #182) is unaffected. Issue #189 reopened.

Frontend: 107/108 bUnit tests passing (same 1 pre-existing failure, issue #180, unrelated) — includes two new tests covering the toggle's absence for EPUB and the persisted-mode coercion.

**Canva's export API failed the same way it did for the favicon work**: `Not allowed to access design with id ...` on a design freshly created via `create-design-from-candidate`, on both a fresh attempt and a retry. Unlike the favicon (which needed a real vector trace since it's viewed sharp at 16px), a hero banner is a full-bleed `object-fit: cover` background sitting under a gradient scrim — a bicubic upscale of the 711×400 generation thumbnail to 1600px (matching `bible-hero.jpg`'s own resolution) was an acceptable tradeoff here, confirmed by inspecting the upscaled result directly before shipping it. Live-verified against production: hero renders with visible light rays, a genuinely subtle map, and the open book, "Willkommen zurück" reads clearly over the scrim, the image URL returns 200 via a cache-bypassing `fetch`, zero console errors.

### Reader width/scrollbar polish + PDF Realistic View zoom (2026-08-04, issue #182/#189 follow-ups, PRs #210-220)

A run of small, live-testing-driven fixes on top of the Realistic View work above, before it was gated back off: `Seitenbreite` (page width) had no visible effect in some reader states, PDF Book/Scroll View showed an unwanted horizontal scrollbar at 100% zoom, a Blazor `style`-attribute re-render was clobbering Realistic View's JS-set container size, and pdf.js's render call needed an explicit `null` (not `undefined`) for its `transform` param on some code paths. PDF's Realistic View also gained zoom, and Realistic View's toggle-desync/silent-fallback/cold-start gaps (portrait pages stretching to double height, never reaching a real two-page spread, a spurious focus outline on load) were fixed one real bug at a time, each found via live production testing — this is the same run that ultimately motivated gating EPUB's Realistic View back off, documented above.

Frontend: unit-test count unchanged from the #189 write-up above (these were live-verification-only fixes to already-shipped surfaces); see `Architecture.md` for anything with lasting architectural relevance.

### Scroll View: hide-scrollbars setting (2026-08-04, PRs #221-222)

Source-requested setting to hide Scroll View's scrollbars for both EPUB and PDF, simplified same-day from an initial multi-option design down to a single checkbox after review.

### TXT/Markdown: real pagination (Book View) + TOC anchors (2026-08-04–05, issue #155 remaining scope, PRs #223-228, #234)

The last piece of issue #155 (real Book View pagination for TXT/MD, previously continuous-scroll-only): page breaks computed from chapter/marker positions, a "Seite pro Kapitel" (page-per-chapter) mode, and TOC anchor links mirroring EPUB's chapter navigation. Landed with two real bugs found via live testing and fixed same-day: pagination never actually initialized on a real page load (only worked after a client-side re-navigation), and Book View clipped the left edge of every line. A separate fix in the same run aliased pre-rename `readerSettings.js` exports so a deploy doesn't silently break on cache skew between an old cached JS file and new C# callers.

Frontend: 106/107 bUnit tests passing at this point (1 pre-existing failure, issue #180, unrelated — see below).

Also landed in this run: Upload/Edit forms' drag-and-drop dropzones now show the selected filename instead of staying visually empty after a drop.

### Dashboard test fix (2026-08-05, issue #180, PR #235)

The pre-existing `HomePageTests.Home_ShowsOverviewCounts_FromDashboardEndpoint` failure flagged (but not investigated) during the hero-banner pass above: the test asserted an unmatchable substring against the real rendered markup, not a behavioral regression. Fixed, restoring a fully green frontend suite.

### Bible Dark Academia / Baroque immersive theme (2026-08-05, issue #143, PRs #236-238)

The large opt-in theme spec deferred from the Impressum/Bible-page work: a selectable Dark Academia visual mode for the Bible reader (dedicated typography/color system, full-viewport atmosphere) plus, in same-day follow-ups, a cinematic entrance sequence. One real bug fixed same-day: chapter fade-in was stuck at `opacity: 0` on the live site. A further "Phase 2" (a fuller reinterpretation beyond the entrance sequence) is filed as issue #239, not yet started, priority-low.

### OAuth login (2026-08-05, issue #40, PRs #240-242)

Google/GitHub OAuth login alongside password auth, closing the item explicitly deferred back in Phase 2 (Authentication). Two real bugs found via live testing against production and fixed same-day: the OAuth migration was rejected by real D1 (`PRAGMA foreign_keys` isn't honored the way the local test double had assumed — the same class of local-double-vs-real-D1 gap documented earlier for book deletion), and the OAuth callback redirect dropped the GitHub Pages project path, causing a 404 on the deployed site specifically (not reproducible locally, where there's no subpath).

### PDF reader hang fixes (2026-08-05, issue #213 and a same-root-cause follow-up, PRs #243-244)

Two related indefinite-hang bugs, both traced to the same root cause (no timeout around a pdf.js call that can stall): PDF Book/Scroll View could hang forever on a pdf.js worker stall, and PDF cover extraction (used during upload metadata pre-fill) had the identical gap with no timeout at all.

Backend: 107/107 Vitest tests passing. Frontend: 125/125 bUnit tests passing (fully green, no known failures) as of this point.

## V1.0 — Release (2026-08-05)

Per the spec's §100 Definition of Done, "Lumina Chronica V1.0 ist fertig wenn" all five groups are satisfied. All five are met, verified end-to-end against production throughout the phase write-ups above:

- [x] **Benutzer** — Account erstellen, Login, Profil (Phase 2 — Authentication)
- [x] **Bibliothek** — Bücher hinzufügen, Bücher verwalten, Suchen, Sortieren (Phase 3 — Library, + Library UX polish)
- [x] **Reader** — Bücher lesen, Fortschritt speichern, Themes (Phase 4 — Reader, + Reader Settings/typography/modes)
- [x] **Organisation** — Regale, Tags (Phase 5 — Organization)
- [x] **Deployment** — GitHub Pages, Cloudflare Backend (v0.2 scaffold, live throughout)

Everything else shipped during v1.0 development — Dashboard, Offline, Statistics (re-scoped in from an initial v1.5 placement, issue #156), the visual design passes, metadata enrichment, the Bible easter egg, favicon/hero banner, OAuth, Realistic View, and the Reader/Bible polish immediately above — goes beyond this strict DoD boundary. Per §101, most of it (extended themes, a much-improved reader, OAuth) is v1.5-shaped work that landed organically through direct user requests rather than being phase-gated — a head start on v1.5, not scope creep against v1.0.

**Tagged `v1.0.0` and published as a GitHub Release** (https://github.com/WatzingerM21052/lumina-chronica/releases/tag/v1.0.0). Backend: 107/107 Vitest tests passing. Frontend: 125/125 bUnit tests passing. Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend). This doc backfill itself landed two days later (2026-08-07, PR #245) — Roadmap/CHANGELOG hadn't been updated to match the already-tagged release.

## v1.5 — Personalisierung (2026-08-07)

Per §101, scoped to what's left after the v1.0-adjacent work above already covered "erweiterte Themes" and most of "verbesserter Reader": **Lesezeichen (bookmarks)** and **erweiterte Statistik** (Jahresübersicht/Lesekalender/Ziele, plus a full visual/functional rework of the Statistics page). Both picked up directly, no separate phase-gating pass needed.

### Bookmarks (issue #248, PR #249)

Users can mark and later jump back to any number of positions within a book, distinct from `reading_progress`'s single auto-saved resume position — each bookmark carries an optional note. Supported uniformly across EPUB/PDF/TXT/MD, via a "🔖 Lesezeichen" popover on the Reader page (add-at-current-position, list, jump-to, delete), lazy-loaded on first open rather than fetched on every page load. `bookmarks` (migration `0006_bookmarks.sql`) deliberately reuses `reading_progress`'s `chapter`/`position`/`percentage` shape instead of the source spec's untyped single `location` field (§48.2, itself marked "Spätere Version" with no types given) — see `Architecture.md`'s row for the technical detail, including the new `EpubReader.GoToLocationAsync`/`PdfReader.GoToPageAsync` methods and the `BuildCurrentLocationAsync` refactor shared with `SaveProgressAsync`.

Backend: 120/120 Vitest tests passing (13 new). Frontend: 128/128 bUnit tests passing (4 new).

**A pre-existing, unrelated test failure was found while running the full suite for this pass** (`BiblePageTests.Bible_Search_ShowsResults_AndSelectingOneLoadsThatChapter`, a bUnit stale-render-tree issue) — confirmed via `git stash` to already fail on `main` before this branch, so not investigated further here; filed separately as issue #247.

### Extended statistics: Jahresübersicht, Lesekalender, Ziele (issue #250, PR #251)

Full rework of the Statistics page beyond v1.0's books/pages/genres/recent-activity shape, per the source request for "modern and high-tech but ancient books design... lots of cool statistics and functions." `reading_activity` (migration `0007_extended_statistics.sql`) logs one row per user per day with at least one reading-progress save — a lightweight activity log, not real session-time tracking (deliberately still out of scope, same reasoning as "Lesedauer" always has had). Landed: a settable yearly reading goal with a conic-gradient progress ring, a GitHub-contribution-style calendar heatmap (52 weeks, client-built from the API's sparse day list, intensity scaled to the user's own busiest day), current/longest reading streaks, and a yearly overview (books finished/pages/active days per year) — all reusing the app's existing brass/oxblood theme tokens rather than a new palette. See `Architecture.md`'s row for the full technical detail.

Backend: 128/128 Vitest tests passing (8 new). Frontend: 135/135 bUnit tests passing (7 new).

**v1.5.0 tagged and released.** Backend: 128/128 Vitest tests passing. Frontend: 135/135 bUnit tests passing (excludes the pre-existing, unrelated issue #247). Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend), including the `0006_bookmarks.sql`/`0007_extended_statistics.sql` migrations applied to production D1.

Issue #247 (the flaky `BiblePageTests` search test noted above) was fixed the same day (PR #253) — a bUnit stale-render-tree race, not a product bug. Frontend: 136/136 bUnit tests passing as of that fix.

## v2.0 — Worldbuilding (2026-08-07)

Per §102 (Version 2.0 — Worldbuilding System): Lumina Chronica becomes a creative tool, new main page `/projects` (nav link already scaffolded since v0.2). Source spec (Teil 4 §43–§58) gives a real but thin schema for `projects`/`characters`/`locations`/`timeline_events`; it has genuine gaps against the World-structure diagram it also shows (`World → Map, Characters, Locations, Timeline, Lore, Books`) — no `lore` table, no project↔book link table, no character-relationship table, and "maps" is nothing but an unused `coordinates` field. Scoped and phased 2026-08-07 (epic #9), following the same phase-gating discipline as v1.0 — each phase its own migration/PR/tests/docs, fully live-verified before the next begins. Explicitly **not** in scope for v2.0: multi-user collaboration (`project_members`, VIEW/EDIT/OWNER permissions) — filed as a v3.0 Community concern; `visibility` (PRIVATE/SHARED/PUBLIC) is stored on `projects` but unenforced, same precedent as `books.visibility`.

### Phase 1 — Projects foundation (issue #254, PR #261)

- [x] `projects` table, CRUD, cover upload
- [x] `Pages/Projects.razor` (real implementation, replacing the `EmptyState` placeholder) + `Pages/ProjectDetail.razor`

Ownership-checked CRUD for personal Worldbuilding projects (World/Novel/RPG/Custom), a direct structural mirror of `shelfService.ts`/`Shelves.razor` — the closest existing analog. `map_url` exists as a real column from this migration on but stays `NULL` until Phase 3 (Locations & Map, issue #256) sets it. No tabbed hub UI yet — `ProjectDetail.razor` is a plain view/edit/delete page for now; Phase 2 introduces the first tab once there are two sections (Overview, Characters) to switch between, rather than building speculative navigation for sections that don't exist yet. Project `type` is stored and editable but is cosmetic/label only, not a feature gate — see `Architecture.md`'s row for the reasoning.

Backend: 140/140 Vitest tests passing (12 new). Frontend: 144/144 bUnit tests passing (8 new). **Live-verified end-to-end against production** (2026-08-07): migration `0008_projects.sql` applied to real D1, backend redeployed, full create/list/get/cover-upload/update/delete cycle exercised both via direct API calls and through the real deployed UI (login → create → detail → edit → delete, throwaway test accounts, cleaned up afterward).

### Phase 2 — Characters (issue #255)

- [x] `characters` table, CRUD, character image upload
- [x] Characters tab + `CharacterDetail.razor`

Character management nested under a project — no `owner_id` of its own, access control walks up to the parent project (`characterService.ts`'s `assertOwnsProject`), same pattern as `shelf_books` inheriting the parent shelf's ownership. `ProjectDetail.razor` gained its first tab bar (Übersicht/Charaktere) now that there are two real sections to switch between, closing the speculative-navigation gap Phase 1 deliberately left open. Found and fixed a genuine bug during this phase, not a pre-existing one: `NotFoundError` extracted to a new shared `backend/src/services/errors.ts`, since `routes/projects.ts` is the first route file catching errors from two different service modules — each had its own same-named-but-distinct `NotFoundError` class, so cross-user 404 checks were silently 500ing until the new tests caught it. See `Architecture.md`'s row for the full story.

Backend: 154/154 Vitest tests passing (14 new). Frontend: 152/152 bUnit tests passing (8 new). **Live-verified against production** (2026-08-07): migration `0009_characters.sql` applied to real D1, backend redeployed, full character create-with-image/list/image-fetch/update/cross-user-404/delete cycle exercised via direct API calls, including confirming `deleteProject` cascade-deletes a project's characters (0 orphaned rows after delete). Verified purely via API this time, not through the deployed UI — a browser-based check picked up an already-active real session in the shared browser instead of the intended throwaway account (no data was read beyond a project list/profile page, nothing was created/edited/deleted; the account's actual project was confirmed unchanged, `updated_at` still equal to `created_at`). Throwaway test accounts cleaned up afterward.

### Phase 3 — Locations & map (issue #256, PR #265)

- [x] `locations` table (with `x`/`y` pin coordinates) + `projects.map_url`
- [x] Map tab: upload a map image, click-to-place location pins (percentage-based, no existing UI pattern in the codebase to copy), pin click-through to the location

`ProjectDetail.razor` gained a third tab (Karte) covering both Locations and the Map together, since the spec bundles them as one phase — an upload dropzone when the project has no map yet, otherwise the map image with pin overlays plus a plain location list/create form below it. Pin placement needed no JS interop for the click itself (`MouseEventArgs.OffsetX`/`OffsetY` is native), only a small new `ElementMetricsService`/`elementMetrics.js` to read the map image's rendered pixel size — the one genuinely new interaction pattern this phase needed, exactly as flagged when Phase 3 was scoped.

**Real bug caught by the new tests, not a pre-existing one**: pin coordinates interpolated directly into the inline CSS `style` attribute rendered with a comma decimal separator under a German locale (`left:42,5%`) — invalid CSS, silently misplacing every pin with no visible error. Same class of bug as the documented reading-progress decimal-separator issue; fixed with `CultureInfo.InvariantCulture`, the project's established pattern for anything landing in markup. See `Architecture.md`'s row for detail.

Backend: 170/170 Vitest tests passing (16 new). Frontend: 163/163 bUnit tests passing (11 new). **Live-verified against production** (2026-08-07): migration `0010_locations.sql` applied to real D1, backend redeployed, full map-upload/location-create-with-image/pin-placement/position-validation/cross-user-404/unplace/delete cycle exercised via direct API calls, including confirming `deleteProject` cascade-deletes a project's locations (0 orphaned rows). Verified via API, not the deployed UI, per the same reasoning as Phase 2 — a shared-browser tab risk isn't worth it when the API surface proves the same logic. Throwaway test accounts cleaned up afterward.

### Phase 4 — Timeline (issue #257, PR #267)

- [x] `timeline_events` table (`date` as free-text, not a real `DATE` — a fictional world's calendar isn't real dates)
- [x] Timeline tab

`ProjectDetail.razor`'s fourth tab renders a real vertical timeline — a gilt line with dot markers per event, reusing the existing brass/oxblood theme tokens — rather than a plain list, since the open question flagged when this phase was scoped ("does `timeline_events` need a manual order?") turned out to matter for more than sorting: it's also what makes reordering via move-up/move-down buttons possible. `moveTimelineEvent` swaps the adjacent event's `order_index` server-side in one atomic `db.batch()`. Editing happens inline in the timeline card itself, not a separate detail page — the lightest-weight Worldbuilding sub-resource so far (three text fields, no image).

Backend: 185/185 Vitest tests passing (15 new). Frontend: 167/167 bUnit tests passing (4 new). **Live-verified against production** (2026-08-07): migration `0011_timeline.sql` applied to real D1, backend redeployed, full flow exercised through the real deployed UI this time (not just the API) — logged into a throwaway account (verified via the profile page before touching anything, after the Phase 2 mishap), created a project, added two timeline events, confirmed reordering via the move buttons swaps them live, confirmed inline editing pre-fills correctly, then deleted the test project. The Karte/Charaktere tabs were spot-checked in the same pass. Throwaway account cleaned up afterward; the real user's own project (already live-created independently during this session) confirmed untouched throughout.

### Phase 5 — Lore & documents/images gallery (issue #258, PR #271)

- [x] `lore_entries` table (Markdown, no spec precedent) + `project_files` table (documents/images gallery, no field-level spec precedent)
- [x] Lore tab + Files/Images gallery tab

Lore rendering reuses the Reader's exact Markdig pipeline and pattern, with a dedicated `LoreEntryDetail.razor` view/edit page rather than inline-in-tab editing (unlike Timeline) — Markdown content can run long, and a cramped tab-list textarea would be a worse writing experience. The Dateien tab handles both documents and images through one upload form with a category picker, sharing `createProjectFile`'s logic but each category gets its own extension allowlist. Downloading a gallery file needed one small new capability, `BlobUrlService.TriggerDownloadAsync`, since the auth-gated file endpoint can't be a plain `<a href>` link.

A genuinely flaky-looking test failure during this phase turned out to be a known project pattern, not a new bug: two files uploaded in the same test tied on `created_at`'s second resolution and fell back to SQLite's unspecified order — the same class of issue already documented for `dashboardService.ts`, fixed the same way (`ORDER BY created_at DESC, id DESC`).

Backend: 208/208 Vitest tests passing (23 new). Frontend: 179/179 bUnit tests passing (12 new). **Live-verified against production** (2026-08-07): migration `0012_lore_and_files.sql` applied to real D1, backend redeployed. Backend layer verified via direct API calls (image + document upload, content streaming, cross-user 404s, project-delete cascade). Lore fully verified through the real deployed UI: created a Markdown entry with headings/bold/blockquote/list, confirmed it renders correctly (gold-accent blockquote border, Fraunces headings) on the detail page. The Dateien upload form itself was confirmed to render correctly in the UI, but a real file couldn't be pushed through the browser tool's file input in this pass (its file-upload capability is sandboxed to session-shared paths, not arbitrary local files) — the exact same upload code path is already proven end-to-end via the direct API test, so this isn't a functional gap, just an automation-tooling limitation worth noting. Throwaway test account cleaned up afterward; the real user's own project confirmed untouched throughout.

### Phase 6 — Linked books & character relationships (issue #259, PR #273)

- [x] `project_books` join table (no spec precedent) + a new "search and pick a book" UI pattern (doesn't exist anywhere else in the codebase yet)
- [x] `character_relationships` table (no spec precedent, directional)
- [x] Closes out epic #9

`project_books` mirrors `shelf_books` exactly (a plain join table, no surrogate id) — only books the caller owns can be linked. The Bücher tab on `ProjectDetail.razor` is the first "search and pick from a list" picker anywhere in the codebase, reusing `GET /api/books?search=` and the exact same 400ms-debounce pattern already proven in `Library.razor`'s own search box. `character_relationships` is directional by convention (`relationship_type` phrased from A to B, e.g. "Mentor von") rather than symmetric — simpler, and matches how relationships are naturally described. The Beziehungen UI lives on `CharacterDetail.razor` per the issue's DoD: the character being viewed is always `characterAId`, so the create form only needs a dropdown for the other character, no direction toggle.

A real gap was found and fixed before shipping: both new tables reference rows *outside* the `projects` subtree (`books.id`, `characters.id`), so cleanup has to run in two directions — when the project is deleted (the established pattern) *and* when the referenced book/character is deleted from its own side. The book-side half (`deleteBook` needing to also clear `project_books`) was missed on the first pass; a deliberately reversed cascade test (link a book, delete the book, assert 204) caught it immediately with a real `SQLITE_CONSTRAINT` 500, since the test DB runs with `PRAGMA foreign_keys = ON`.

Backend: 231/231 Vitest tests passing (23 new). Frontend: 187/187 bUnit tests passing (8 new). **Live-verified against production** (2026-08-07): migration `0013_project_links.sql` applied to real D1, backend redeployed. Full flow exercised both via direct API calls (link/list/unlink a book, cross-user 404s, self-relationship rejection, cross-project-character rejection, relationship update/delete, and — the exact bug the FK-cleanup fix targets — deleting a still-linked book returns 204 with `project_books` cleaned up, not a 500) and through the real deployed UI: created a project, linked a real uploaded book via the debounced search picker (confirmed the suggestion appeared and "Vom Projekt entfernen" rendered after adding), created two characters, added a "Mentor von" relationship from Aria's page, confirmed it also appears correctly phrased on Berin's page, edited it to "Rivale von", then deleted it — all via the real UI. Throwaway account and its project/book cleaned up afterward (via UI/API and a direct D1 delete for the account itself); the real user's own project confirmed untouched throughout (`updated_at` unchanged).

This closes epic **#9** — all six v2.0 Worldbuilding Stories are now complete.

**v2.0.0 tagged and released.** Backend: 231/231 Vitest tests passing. Frontend: 187/187 bUnit tests passing. Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend), including migrations `0008_projects.sql` through `0013_project_links.sql` applied to production D1. Epic #9 and the `v2.0` milestone are both closed on GitHub.

## v2.1 — Sicherheit (2026-08-07)

Triggered by GitHub flagging 11 open Dependabot alerts against `backend/` shortly after the v2.0 release, then broadened to a general security pass on request. Two Stories under milestone `v2.1`, no epic wrapper (same lighter two-Story shape as v1.5): the concrete Dependabot fixes, and everything else a security review turns up.

### Dependency vulnerabilities (issue #276, PR #278)

- [x] Remove the unused `vitest` devDependency + dead `"test": "vitest run"` script from `backend/package.json`
- [x] Bump `hono` to `^4.12.34`
- [x] Refresh `backend/package-lock.json` so `wrangler` resolves to a patched `undici`
- [x] Add `.github/dependabot.yml` covering all four ecosystems in the repo

`vitest` turned out to be entirely dead weight — the actual test suite runs from `tests/backend/`, not `backend/` itself (confirmed via this repo's own docs, the CI workflow, and the README) — so removing it deleted the whole `vitest`→`vite`→`esbuild` chain outright, closing 5 of the 11 alerts including the one critical one in a single change. `hono`'s declared range already permitted a patched version; it just needed the lockfile refreshed. `undici`'s 5 alerts all traced to `wrangler`'s bundled `miniflare`, fixed the same way. No `dependabot.yml` existed before this — only GitHub's default scanning had been catching anything, and it only covers what's tracked; the NuGet and github-actions ecosystems were invisible until now.

Backend: 235/235 Vitest tests passing (unchanged suite, the fix is dependency-only). **Live-verified against production** (2026-08-07): `npm ci` clean, `wrangler deploy --dry-run` clean, deployed, CORS preflight confirmed working post-deploy (the underlying hono CVE was in the CORS middleware), and `gh api .../dependabot/alerts` confirmed 0 open alerts remaining.

### Security hardening pass (issue #277, PR #294, fix PR #295)

- [x] Rate-limit `POST /api/auth/login` and `/register`
- [x] `X-Content-Type-Options: nosniff` on all file/image-streaming routes

A full review of CORS, auth middleware, error handling, crypto, and ownership-scoping across every route file (the last via a dedicated Explore-agent audit) came back clean — nothing there needed changing. The one real, previously undocumented gap: no brute-force/credential-stuffing protection on login or registration. New `auth_rate_limits` table (migration `0014_auth_rate_limit.sql`), a D1-backed fixed-window counter — no new Cloudflare KV namespace needed, reusing the existing `DB` binding was enough. Login throttles on `(CF-Connecting-IP, identifier)` rather than identifier alone, specifically so an attacker spamming a victim's username from many IPs can't lock the victim out of their own account; register throttles per IP only, against mass automated account creation. Also added `X-Content-Type-Options: nosniff` to all 8 file/image-streaming routes (books, shelves, project covers/maps/character/location images, project files) via one shared `fileResponse()` helper, so a browser can never be tricked into executing a mislabeled upload. SVG was checked and confirmed already excluded from `ALLOWED_COVER_EXTENSIONS`, so no stored-XSS risk there. Vendored frontend libraries (pdf.js, epub.js/JSZip, GSAP, html2canvas, page-flip — invisible to Dependabot since they're committed bundles, not package-managed) were checked against their embedded version strings: all current, no open CVEs.

**Two real bugs found only by live-testing against production, not the local test suite**: D1 serves reads from regional replicas by default, so the rate-limit check couldn't reliably see another request's very recent write — the counter was incrementing correctly on the primary the whole time, but the gate never tripped. Fixed via `db.withSession("first-primary")`. Separately, comparing an app-computed ISO timestamp against SQLite's differently-formatted `CURRENT_TIMESTAMP` as plain text made the window-expiry check always evaluate true, so a throttled window would never actually reset. Both are the same category of D1-vs-local-`node:sqlite` parity gap already documented for the OAuth migration's `PRAGMA foreign_keys` lesson — see `Architecture.md`'s row for the full detail.

Backend: 235/235 Vitest tests passing (4 new: threshold, per-identifier isolation, reset-on-success, plus a header assertion on an existing file-serving test). **Live-verified against production** (2026-08-07): migration `0014_auth_rate_limit.sql` applied to real D1, backend redeployed twice (once for the feature, once for the D1-consistency fix). Confirmed via direct API calls against throwaway accounts: 8 failed logins against the same identifier correctly return `429 RATE_LIMITED` with a `Retry-After` header on the 9th; a different identifier from the same source is unaffected; 8 registrations from the same IP correctly throttle the 9th; `X-Content-Type-Options: nosniff` confirmed present on both `/api/books/:id/file` and `/api/books/:id/cover`. All throwaway accounts, books, and rate-limit rows created during verification were removed from production afterward.

**v2.1.0 tagged and released.** Backend: 235/235 Vitest tests passing. Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend), including migration `0014_auth_rate_limit.sql` applied to production D1. Both v2.1 Stories and the `v2.1` milestone are closed on GitHub.

## v3.0 — Community (complete, 2026-08-07)

Per spec §123 (Phase 8 — Community, 7 items: Öffentliche Profile, Öffentliche Bibliothek, Folgen, Bewertungen, Kommentare, Benachrichtigungen, Aktivitäten) / §103. Scoped 2026-08-07 via `AskUserQuestion`, same discipline as v2.0's epic #9: **core pass** covers Profile/Library/Follow/Ratings (epics #10 Discovery / #11 Community); **Kommentare, Benachrichtigungen, Aktivitäten deferred** to issue #299 — Kommentare's own DB table (§50.3) is marked "Spätere Version" in the spec despite appearing in §123's list, and Benachrichtigungen/Aktivitäten weren't mentioned in epic #11's original body at all (a real gap found during scoping, same class as the Statistics v1.5-vs-v1.0 miscue). `/discover` (cross-user browse with trending/filters, epic #10) is sequenced after Community's own Profile and Ratings phases, since "highest-rated" needs Ratings to exist and browsing needs public content to exist first.

### Phase 1 — Public profile (issue #300)

- [x] `GET /api/users/:username/public` — no auth at all (not `optionalAuth` — a fully logged-out visitor), returns a user's PUBLIC books + projects
- [x] `optionalAuth` middleware; `/:id/cover` on books and projects now serves unauthenticated when the resource's `visibility = 'PUBLIC'`
- [x] `visibility` (PRIVATE/PUBLIC) is now actually settable via a selector on both Book and Project edit forms — the DB column has existed since v1.0 (`books`)/v2.0 (`projects`) and the C# model field mirrored it, but no UI ever wrote to it until now
- [x] `Pages/PublicProfile.razor` (`/u/{username}`), reachable while logged out

**Explicit scope decisions**, resolved via `AskUserQuestion` before writing code: Books + Projects only, not Shelves (`shelves.visibility` exists since migration 0004 but shelves aren't in §123's 7-item list at all — stays unenforced). Only `PUBLIC` is enforced, not `SHARED` (the spec gives no semantics for `SHARED` — who is it shared with? — stays unenforced, same as `books.visibility` always has been). Cover images + metadata are public; **the book FILE (EPUB/PDF) stays behind auth** and project `map` images stay owner-only (not part of the public "teaser") — decided directly with the user to avoid unintended free distribution of possibly-copyrighted files. No new migration — this phase enforces + exposes columns that already existed, it doesn't add any.

Backend: 244/244 Vitest tests passing (9 new). Frontend: 194/194 bUnit tests passing (7 new).

**A real bug found via live browser verification, not the test suite** (PR #302, same day): the new "Öffentliches Profil ansehen" link on `/profile` used a leading `/` (`/u/{username}`), which a real browser resolves as domain-root-relative — bypassing the `<base href>` rewrite this GitHub Pages project site needs for its `/lumina-chronica/` subpath, the same underlying issue class as #38. `BookCard`/`ProjectCard` already used the correct no-leading-slash convention; this new link didn't match it. bUnit's fake `NavigationManager` doesn't reproduce a real browser's root-relative resolution, so this specific failure mode could only be caught by the real deployed page, not rendering-only tests — a regression test was added asserting the href string itself.

Live-verified end-to-end against production (2026-08-07): backend deployed via `wrangler deploy`, then a throwaway account exercised the full flow via direct API calls against real D1/R2 — uploaded a book + created a project (both defaulting PRIVATE), set both PUBLIC and confirmed the public-profile endpoint (zero Authorization header) returned both with covers rendering unauthenticated, confirmed the book's own `/file` route stayed 401 with no token / 200 with the owner's token (file distribution unaffected), set the book back PRIVATE and confirmed both the cover (404) and the public listing correctly stopped exposing it (the enforcement actually gates, not just always-allows), confirmed an unknown username 404s. Frontend re-verified live in the real browser after the link hotfix: navigated `/profile` → clicked "Öffentliches Profil ansehen" → landed on `/u/watzingerm21052` showing the real account's avatar and correct empty-state copy for both sections (no public books/projects exist on the real account), zero console errors. Throwaway book/project/account all removed afterward (account via a direct D1 delete — no delete-account endpoint exists yet).

### Phase 2 — Follow (issue #304)

- [x] Migration `0015_followers.sql` — `followers(follower_id, following_id, created_at)`, no spec precedent beyond the bare field list (§50.1), designed fresh
- [x] `POST`/`DELETE /api/users/:username/follow` (requireAuth, idempotent — following/unfollowing twice is a no-op, not an error); no self-follow (400)
- [x] Phase 1's `GET /api/users/:username/public` switches from no-auth to `optionalAuth`, gaining `followerCount`, `followingCount`, `isFollowing`, `isOwnProfile`
- [x] Frontend: Folgen/Entfolgen button + counts on `/u/{username}`, shown only when logged in and not viewing your own profile

Following is a relationship between people, not gated by the target having any PUBLIC content — you can follow any existing user. **Out of scope this phase**: a dedicated followers/following list page — the spec's "Folgen" item is satisfied by follow/unfollow + counts; a list view is a natural but separate follow-up if wanted later.

Backend: 252/252 Vitest tests passing (8 new). Frontend: 200/200 bUnit tests passing (6 new).

Live-verified end-to-end against production (2026-08-07): migration applied to real D1, backend redeployed, then two throwaway accounts exercised via direct API calls — self-follow rejected (400), follow succeeds and is idempotent (204 on repeat), counts update correctly on both sides, `isFollowing` correctly true only for the actual follower (false for a stranger and for an anonymous visitor), `isOwnProfile` correctly true only for the profile's own user, unfollow works and is idempotent, unknown username 404s. Frontend spot-checked live on the real account: `/u/watzingerm21052` correctly shows "0 Follower · 0 Folgt" and hides the Follow button on your own profile, zero console errors. Both throwaway accounts removed afterward (direct D1 delete).

### Phase 3 — Ratings (issue #307)

- [x] Migration `0016_ratings.sql` — `ratings(id, user_id, book_id, rating, created_at)`, unique on `(user_id, book_id)`, `rating` constrained 1–5, no spec precedent beyond the bare field list (§50.2)
- [x] `PUT`/`DELETE /api/books/:id/rating` (requireAuth, upsert on PUT — re-rating updates, doesn't duplicate)
- [x] `listPublicBooksByUsername` gains `viewerId` (same pattern as Phase 2's follow state); public book listings now carry `averageRating`/`ratingCount`/`myRating`
- [x] Frontend: inline 1–5 star widget on each public-profile book card

Only PUBLIC books can be rated (a PRIVATE book is unreachable to a non-owner through any other endpoint), and only by someone other than the book's owner — self-rating is blocked for the same reason self-follow is blocked in Phase 2: an uncontroversial, near-universal platform convention that prevents inflating your own average. **No dedicated public book detail page yet** (Phase 1 explicitly deferred that) — the rating widget lives inline on the book card tile on `/u/{username}` itself; clicking a star you already gave removes your rating (toggle), clicking a different star changes it.

Backend: 265/265 Vitest tests passing (13 new). Frontend: 207/207 bUnit tests passing (7 new).

Live-verified end-to-end against production (2026-08-07): migration applied to real D1, backend redeployed, then two throwaway accounts + a real public book exercised via direct API calls — self-rating rejected (400), out-of-range rating rejected (400), rating succeeds and average/count update correctly, re-rating upserts (average changes, count stays 1, not a duplicate row), unrating removes it (average back to `null`, count back to 0), rating a book after its visibility is set back to PRIVATE is correctly rejected. Frontend spot-checked live on the real account (no public books existed to exercise the widget's interactive states without creating persistent test data, so this leaned on the already-comprehensive bUnit coverage of all 7 widget states): `/u/watzingerm21052` renders with no console errors, no visual regression from the new markup. Throwaway accounts, the test book, and rating/follower rows all removed afterward (direct D1 delete).

**v3.0's core Community pass (Profile, Follow, Ratings) is now complete.** Epic #11 closed 2026-08-07.

### Phase 4 — Discovery (issue #310)

Replaces the `/discover` placeholder (an `EmptyState`, scaffolded since v0.2). No spec precedent for this page at all — Teil 5 §64's page-by-page list has no Discover entry, only a "Discover Section" *within* the Home Dashboard (Empfehlungen/Trends). Epic #10's own body (trending/highest-rated/newest/recommended, filters) is the working definition, unblocked once public content (#300) and ratings (#307) both existed.

- [x] `GET /api/discover/books?sort=newest|rating` — no auth required (`optionalAuth` so `myRating` still reflects a logged-in caller), cross-user, `visibility = 'PUBLIC'`-only
- [x] `GET /api/discover/users?search=` — username substring search; a blank search returns empty rather than listing every user in the system
- [x] `Pages/Discover.razor` — sort dropdown + book grid (cards link to the owner's `/u/{username}`, no dedicated public book detail page exists), debounced user search with results linking to their public profile

Also covers the user's own request (2026-08-07, mid-session, folded into #310): find *users* directly by search, independent of their books.

**Explicitly deferred**: genre/tag filters (epic #10 mentions "filters" without specifying which; the concrete newest/highest-rated sort and user search shipped first) and trending/recommended (needs a real "trending" definition — e.g. recent-activity-weighted — that doesn't exist anywhere in the spec or the epic).

Backend: 276/276 Vitest tests passing (10 new). Frontend: 214/214 bUnit tests passing (7 new).

**Two real bugs found only by live verification, not the test suite** (hotfix PRs #312, #313, same day):
- **`deleteBook` FK constraint** — deleting a rated book 500'd against real production D1: `deleteBook`'s cleanup batch never touched the new `ratings` table (added in Phase 3), the same class of gap already documented for `deleteProject`/`project_books`. The local test double *does* enforce foreign keys (confirmed by adding the missing regression test, which now fails without the fix) — this was a real test-coverage gap, not a parity gap, since no test exercised deleting a rated book until this pass.
- **Missing CSS entirely** — `PublicProfile.razor` and `Discover.razor` render `book-card`/`project-card` markup directly rather than through the `<BookCard>`/`<ProjectCard>` components (those carry owner-only behavior like the favorite toggle, wrong for a stranger's view), so they never inherited those components' Blazor-scoped CSS. Every card rendered edge-to-edge unstyled, and a search-result avatar filled the whole page width. bUnit's markup/class assertions couldn't catch this — it asserts the classes exist, not that any CSS actually applies. Fixed with global (unscoped) equivalents of the shared card styles in `app.css`, confirmed visually correct afterward via a real public book with a cover.

Live-verified end-to-end against production (2026-08-07): backend deployed (no migration needed), then throwaway accounts + real public books exercised via direct API calls and the real browser — newest-sort and rating-sort both correct (a low- and a high-rated book swapping order), user search finds real accounts by substring, blank search returns empty, and after the two hotfixes, the real deployed `/discover` page showed correctly-sized circular avatars and a properly-boxed book card with working aspect-ratio and placeholder icon. All throwaway accounts/books removed afterward (direct D1 delete).

**v3.0 "Community" milestone is now fully complete** — both epics (#10 Discovery, #11 Community) closed, all 4 phases shipped and live-verified. Comments/Notifications/Activities stay deferred to backlog issue #299 (no milestone — out of v3.0's scope by design, see the Phase 1 write-up above). **Tagged `v3.0.0` and published as a GitHub Release**, same as v1.0/v1.5/v2.0/v2.1. Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend), including migrations `0015_followers.sql` and `0016_ratings.sql` applied to production D1.

## v3.1 — Borrowed Reading (2026-08-08)

Follow-up to v3.0 requested directly by the user after v3.0.0 shipped: `SHARED` visibility (issue #316, epic #11 follow-up) — a book's owner can now grant *any* logged-in user full read access to it, not just the cover+metadata teaser `PUBLIC` gives an anonymous visitor. Motivation stated by the user: save cloud storage, since multiple users no longer each need their own copy of the same book.

- [x] `SHARED` — present in the `books.visibility` schema since migration `0002_books.sql` but unenforced until now (Phase 1/#300 deliberately left it that way, with no defined semantics at the time) — gets real enforcement: `bookService.ts`'s new `findAccessibleBookRow` (owner OR `visibility = 'SHARED'`) backs `getBook`/`getBookFileObject`; every mutating function (`updateBook`/`updateBookCover`/`deleteBook`/`addFavorite`/`removeFavorite`) keeps using the original strictly-owner-only `findOwnedBookRow` — reading is the only thing that relaxes.
- [x] `readingService.ts`/`bookmarkService.ts`'s `isOwnedByUser` → `isAccessibleByUser` (same owner-OR-SHARED rule) — `reading_progress`/`bookmarks` were already `(user_id, book_id)`-keyed since v1.0/v1.5, so a borrower's progress and bookmarks are independent of the owner's (and any other borrower's) with no migration needed — "like a real borrowed library book," per the user's own framing.
- [x] `listPublicBooksByUsername`/`getBookCoverObject` treat `SHARED` the same as `PUBLIC` for the teaser (cover+metadata visible to anyone, including anonymous visitors) — only the full file and progress/bookmarks require being logged in.
- [x] `dashboardService.ts`'s Continue Reading list now also surfaces a borrowed `SHARED` book the caller has progress on, tagged with the owner's username (`ownerUsername`) for a "Geliehen von {username}" badge.
- [x] Frontend: `BookVisibilityOption` (books only — Projects/Shelves keep the plain PRIVATE/PUBLIC `VisibilityOption`, SHARED has no meaning for them) adds SHARED as a third choice with explanatory copy on the edit form. `PublicProfile.razor` shows a "Lesen" button (logged in) / "Anmelden zum Lesen" prompt (logged out) on a SHARED book instead of the rating widget. `BookCard` gained `ShowFavorite`/`OwnerUsername` parameters so a borrowed card on the Home dashboard hides the favorite star (which would 404 for a non-owner) and shows the borrowed badge instead.

**Explicit scope decisions, resolved via `AskUserQuestion` before writing code:** SHARED is its own tier, not an extension of PUBLIC (PUBLIC stays teaser-only). Reading progress/bookmarks persist per-user exactly like owned books ("wie ein echtes Bibliotheksbuch"), the user's explicitly preferred option over a one-off read with no saved state.

**Explicitly out of scope, decided unilaterally and written into issue #316 for the record:** favorites and shelves stay strictly owner-only (a borrower can't favorite or shelve someone else's shared book); ratings stay PUBLIC-only, unchanged since Phase 3/#307 (a SHARED book can't be rated by anyone); offline (IndexedDB) saving isn't available for a borrowed book — the existing offline button only exists on `BookDetail.razor`, which stays unreachable for a book you don't own, so no new UI path was added that would let a borrower copy the full file permanently to their own device; `/discover`'s general book browse stays PUBLIC-only — a SHARED book is only reachable via the owner's own public profile, not the cross-user discovery feed (which also sorts by rating, something SHARED books don't have). A known, accepted trade-off: a borrowed book drops out of Continue Reading the moment its owner flips visibility back to PRIVATE — there's no separate "borrowed books" table caching the relationship, by design, for the first version of this feature.

One correctness bug caught and fixed **before** it ever reached production, during implementation rather than live verification this time: `BOOK_ROW_COLUMNS`' `is_favorite` subquery is correlated against `books.owner_id` — correct for every prior caller (all strictly owner-scoped), but a borrower reading a SHARED book through the new relaxed path would have seen the *owner's* favorite flag mislabeled as their own. `findAccessibleBookRow` uses a dedicated query binding the actual caller's ID instead, covered by a regression test in `books.test.ts` ("never leaks the owner's favorite flag to a borrower").

Backend: 289/289 Vitest tests passing (13 new). Frontend: 219/219 bUnit tests passing (5 new). No new migration — `SHARED` only needed enforcement logic, not a schema change.

Live-verified end-to-end against production (2026-08-08): backend redeployed via `wrangler deploy`, then two throwaway accounts exercised the full flow via direct API calls against real D1/R2 — owner uploads a book (defaults PRIVATE), sets it SHARED, borrower reads the detail (200) and the actual file bytes (200, correct content), both save independent reading progress (owner's and borrower's rows stayed separate and correct on read-back), borrower creates a bookmark independent of the owner's (none), borrower's edit/favorite/delete attempts all correctly 404, borrower's rating attempt correctly 400s ("Only public books can be rated"), the Home dashboard's Continue Reading for the borrower correctly showed the book tagged `ownerUsername` with the owner's real username, the owner's public profile listing correctly included the book with `visibility: "SHARED"`, an anonymous (no-token) request for the file correctly 401'd. All throwaway rows removed afterward, including `user_settings`/`reading_activity` rows not covered by `deleteBook`'s cleanup batch (those are user-scoped, not book-scoped, so deleting the test book alone didn't remove them) before deleting the two accounts themselves via `wrangler d1 execute --remote`.

**v3.1 "Borrowed Reading" milestone complete.** Tagged `v3.1.0` and published as a GitHub Release. Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend).

## v3.2 — Sharing (2026-08-08)

Direct user feedback the same day v3.1.0 shipped: "ist bei den Sichtbarkeiten 'privat' und 'öffentlich' jetzt überhaupt ein Unterschied?" The answer was yes, but PUBLIC/SHARED's meanings (issue #321) were unintuitive — `PUBLIC` was a teaser-only tier, `SHARED` opened full reading to *any* logged-in user with no way to limit who. The user proposed swapping them and adding a real per-person share list; confirmed via `AskUserQuestion` before writing code, along with two follow-up requirements added in the same message.

- [x] `PUBLIC` now grants full read access (detail, file, reading progress, bookmarks) to any logged-in user — the cover+metadata teaser is unchanged (anyone, including anonymous visitors). This is what `SHARED` used to do in v3.1.
- [x] `SHARED` now requires being on the book's explicit share list — migration `0017_book_sharing.sql` adds `book_shares(book_id, user_id, created_at)` and `books.shared_teaser_visible` (default on, so existing SHARED books don't silently vanish from anyone's view). New `bookSharingService.ts` (mirrors `followService.ts`'s shape) plus `GET`/`POST /api/books/:id/shares` and `DELETE /api/books/:id/shares/:username`, owner-only, no self-share.
- [x] `bookService.ts`'s `findAccessibleBookRow` (backing `getBook`/`getBookFileObject`), `readingService.ts`/`bookmarkService.ts`'s `isAccessibleByUser`, and `dashboardService.ts`'s Continue Reading query all moved from "owner OR SHARED-for-anyone" to "owner OR PUBLIC OR (SHARED AND on the share list)".
- [x] `listPublicBooksByUsername` gained a server-computed `canRead` per book (owner OR PUBLIC-and-logged-in OR SHARED-and-listed) — share-list membership isn't visible to the frontend otherwise, so `PublicProfile.razor`'s "Lesen" button is keyed off `canRead`, not raw `visibility`. The same query's `WHERE` became viewer-parameterized: a SHARED book with its teaser off is completely absent from the listing for anyone not on the list, but still shows (with `canRead: true`) for someone who is — the discovery path for a person you shared a book with.
- [x] Frontend: `BookDetail.razor`'s edit form gets a "Geteilt mit" manager for SHARED books — username search (reuses `/api/discover/users`), add/remove, plus a checkbox for the teaser toggle. `PublicProfile.razor`'s PUBLIC book cards now show a "Lesen" button (logged in) alongside the existing rating widget, not just the rating widget as before.

**Explicitly considered and rejected, confirmed via a dedicated `AskUserQuestion` before any code was written:** letting a PUBLIC book's full text be readable by a fully anonymous (logged-out) visitor. Concretely, that would mean the raw file downloadable by anyone on the internet with no account, and it would need an entirely new public-facing Reader route (the existing one is `[Authorize]`-gated end to end, with no anonymous alternative) that couldn't save progress/bookmarks for a visitor with no account to key them to. It would also directly reverse Phase 1's (#300) explicit decision to keep book files behind auth for copyright reasons. The user chose to keep full reading login-gated for both PUBLIC and SHARED; only the cover+metadata teaser is ever anonymous.

**One bug caught during implementation, before it ever reached production** (not a live-only find this time): `BOOK_ROW_COLUMNS`'s `is_favorite` subquery is correlated against `books.owner_id`, correct only when the caller IS the owner. `findAccessibleBookRow`'s new caller-bound query (carried over from v3.1's identical fix) still applies here and was re-verified by the existing regression test.

Ratings, favorites, and shelving are explicitly unaffected by this swap — still PUBLIC-only and owner-only respectively, regardless of SHARED share-list membership. `/discover`'s general book browse also stays untouched (PUBLIC-only, no direct "Lesen" link there yet) — a deliberate, documented scope boundary, not an oversight.

Backend: 300/300 Vitest tests passing (16 new/updated, including the 3 assertions inverted from v3.1's "still 404 for PUBLIC" shape now that PUBLIC is openly readable). Frontend: 223/223 bUnit tests passing (7 new/updated). No migration beyond `0017_book_sharing.sql`.

**A real gap caught (not a bug, a missing render trigger) while writing frontend tests, before it ever shipped:** `StartEditing` originally kicked off `LoadSharesAsync()` as a fire-and-forget `_ = LoadSharesAsync()` call from a synchronous `@onclick` handler. Blazor only auto-re-renders after an event handler's returned `Task` completes — a detached, un-awaited task's continuation never triggers that, so the share list would have silently never appeared until some unrelated re-render happened to occur. Fixed by making `StartEditing` an awaited `async Task` (`StartEditingAsync`) and lazily fetching shares only when the visibility is actually (or becomes) SHARED, via `@bind-Value:after` on the visibility dropdown — also avoids an unnecessary request for every book regardless of visibility.

Live-verified end-to-end against production (2026-08-08): migration applied to real D1, backend redeployed, then three throwaway accounts exercised the full flow via direct API calls — a PUBLIC book is fully readable (detail 200, file 200) by any logged-in non-owner but still 401s for a fully anonymous request; the public-profile listing's `canRead` correctly flips true/false with login state for the same PUBLIC book; a SHARED book with its teaser off is completely invisible (empty `books: []`) to a non-listed logged-in viewer; sharing it makes it fully readable for the listed user (detail 200, file 200) and visible on the profile with `canRead: true`; a still-non-listed third account remains 404'd throughout; edit/rating attempts by the listed (non-owner) user correctly 404/400; unsharing immediately revokes read access (404 again); deleting the book correctly cleaned up its `book_shares` rows (verified directly against D1) before the throwaway accounts' remaining `user_settings` rows and the accounts themselves were removed.

**v3.2 "Sharing" milestone complete.** Tagged `v3.2.0` and published as a GitHub Release. Live at https://watzingerm21052.github.io/lumina-chronica/ (frontend) and https://lumina-chronica-api.svhofkirchen-api.workers.dev (backend).

## v3.3 — Comments, Notifications, Activities (complete, 2026-08-08)

Picks up backlog issue #299 (deferred from v3.0's Phase 8/§123 list — comments' own table was spec-marked "Spätere Version", notifications/activities were never in epic #11's body at all). Scoped via a 4-question `AskUserQuestion` before any code was written, then split into three sequenced GitHub issues under this milestone since the third phase depends on the second: **#324 Activities → #325 Comments → #326 Notifications**.

### Phase 1 — Profile activity log (issue #324) — complete

- [x] New `profile_activities` table (migration `0018_profile_activities.sql`) — deliberately not named `activities`, to avoid colliding with the existing `reading_activity` table (migration `0007`, a different concept: per-day reading counts for the Lesekalender heatmap, not a public event log).
- [x] Logs exactly three event types: `RATING_GIVEN` (a rating snapshot at creation time — ratings are upsert, but each `PUT` is still logged as its own event, so re-rating a book produces multiple activity rows), `BOOK_PUBLIC`, `PROJECT_PUBLIC` (only the *transition into* PUBLIC, detected by comparing the pre-update row's visibility against the new value — not logged again on a later edit while already PUBLIC).
- [x] Folded into the existing `GET /api/users/:username/public` response as a new `activities` array rather than a separate endpoint — same visibility scope as the rest of that response.
- [x] `PublicProfile.razor` renders an "Aktivitäten" section with human-readable German text per event type; no deep link to the target yet (the linked book/project may have gone non-public again since the activity was logged, and the activity payload doesn't carry a per-viewer `canRead` flag to gate a link correctly — plain text avoids offering one that could 404).
- [x] `deleteBook`/`deleteProject` cleanup batches gained a `profile_activities` line — `target_id` is polymorphic (no FK, same shape as the spec's own `comments` table design), so a missing cleanup line wouldn't throw an FK error, only leave orphaned rows. Caught proactively (not by live testing this time) since the exact same bug class hit `book_shares`/`ratings` in earlier phases — a dedicated regression test now exists in both `books.test.ts` and `projects.test.ts` asserting the row count is actually zero after delete.

**Scope confirmed via `AskUserQuestion` (2026-08-08):** first version is only a log of the *viewing profile's own* actions, shown on their own `/u/{username}` page — not an aggregated Twitter-style feed of everyone you follow. A "Home Feed" aggregation is explicitly deferred to a possible later story.

**One real bug found live, after merge — same class as v3.0's/v3.1's/v3.2's "bUnit passes, only a real browser catches it" lesson:** `ProfileActivity.CreatedAt` was typed `DateTime`, but D1's `DATETIME` columns serialize as `"yyyy-MM-dd HH:mm:ss"` (SQLite's `CURRENT_TIMESTAMP` format — no `T`, no offset), which `System.Text.Json`'s default `DateTime` converter rejects outright. Every existing model (`Book.CreatedAt`, `Project.CreatedAt`) already avoids this by being `string`; `ProfileActivity` missed that precedent, and it crashed `/u/{username}` entirely for any profile with at least one activity. The bUnit fixture had used ISO-8601 dates, which happened to parse fine and masked it — caught instead by loading the real deployed page against real production data. Fixed to `string`, parsed explicitly at render time (`FormatActivityDate`); the test fixture now uses D1's real timestamp shape, and a new assertion checks the raw D1 string never reaches the rendered markup, so a silent fallback-to-unparsed-string regression would be caught too. Shipped same-day as a hotfix (PR #328).

Backend: 305/305 Vitest tests passing (5 new). Frontend: 224/224 bUnit tests passing (2 new, one of them strengthened by the hotfix to also guard the date-parsing bug).

### Phase 2 — Comments (issue #325) — complete

- [x] New `comments` table (migration `0019_comments.sql`) — `user_id`, `target_type` (`BOOK`/`PROJECT`), `target_id` (no FK, polymorphic, same shape as `profile_activities`), `content`, `created_at`. Source spec §50.3 gives only the bare field list and marks the table "Spätere Version" with no enum for `target_type` — resolved via `AskUserQuestion` to Books + Projects only, no new public page type.
- [x] **Deliberately asymmetric access rule between the two target types** — a book is commentable by anyone who can actually *read* it (owner, any logged-in user on `PUBLIC`, or a listed user on `SHARED`'s share list) — the same rule `getBook`/`getBookFileObject` already use, not the `PUBLIC`-only rule ratings use. A comment on a book someone shared privately with you is the natural case, matching the "borrowed book" model from v3.1/v3.2. A project is commentable by its owner or, if `PUBLIC`, any logged-in user — projects have no share-list equivalent to books' `book_shares`, a real, permanent asymmetry.
- [x] Self-commenting is allowed on both (unlike rating/following) — commenting on your own book/project is normal, e.g. an author replying.
- [x] `bookService.ts` gained `isBookAccessibleTo`/`getBookOwnerId`, `projectService.ts` gained `isProjectCommentableBy`/`getProjectOwnerId`, both consumed by the new `commentService.ts` rather than commentService writing its own access-control SQL. `isBookAccessibleTo` and `findAccessibleBookRow` share one `BOOK_ACCESS_WHERE` SQL fragment now instead of two independently-maintained copies of the same rule — worth doing given this rule has already changed twice in two days (v3.1, then v3.2's swap). `readingService.ts`/`bookmarkService.ts`'s own `isAccessibleByUser` copies were left as-is (a broader dedup pass, not in scope here).
- [x] MVP scope, deliberately trimmed: create + delete only, no edit; no pagination (`LIMIT 100`, newest first, same pattern as `profile_activities`' `MAX_ACTIVITIES`); delete allowed by the comment's own author OR the commented-on book/project's owner (`deleteComment` resolves the target's owner by branching on `target_type`, fails closed — a null owner never falls through to "allow").
- [x] `GET`/`POST /api/books/:id/comments` and `GET`/`POST /api/projects/:id/comments`; `DELETE /api/comments/:id` lives on its own top-level route (not nested) since deletion only needs the comment's own id, no path context.
- [x] `deleteBook`/`deleteProject` cleanup batches gained a `comments` line, same recurring bug class as `profile_activities`/`book_shares`/`ratings` before it — regression tests in `comments.test.ts` assert the row count is zero after deleting a book/project that had comments.
- [x] Frontend: `BookDetail.razor` and `ProjectDetail.razor` both gained a "Kommentare" section (list + submit form; delete button shown only for the current user's own comments — `Book.cs`/`Project.cs` don't carry an `ownerId`/`isOwner` field this page could key an equivalent moderation button off, so the backend's owner-moderation capability isn't exposed in this MVP UI).

**A real, known gap, not a bug — worth stating plainly rather than leaving it implicit in a code comment:** `GET /api/projects/:id` (`getProject`) is strictly owner-only (`findOwnedProjectRow`), unlike books' `getBook`. That means `ProjectDetail.razor` — the only page with a project comment UI — is *never reachable by a non-owner*, even for a `PUBLIC` project. Non-owner PUBLIC-project commenting is a real, tested backend capability (`POST /api/projects/:id/comments` correctly 204s for a non-owner on a PUBLIC project), but as of this phase there is no page a non-owner could load to actually use it — there's no public-facing project detail page at all yet (`PublicProfile.razor`'s project cards don't link anywhere). This is shipped anyway since the backend rule is correct and forward-compatible; the frontend gap is deferred until a public project detail page exists (plausibly part of #315's premium design rework, queued next after this milestone).

Backend: 323/323 Vitest tests passing (18 new). Frontend: 231/231 bUnit tests passing (7 new).

Live-verified end-to-end against production (2026-08-08): migration applied to real D1, backend redeployed, then exercised via direct API calls with throwaway accounts — a book's owner comments on their own PRIVATE book (self-commenting, 204); a non-owner correctly 404s commenting on a PRIVATE book; a PUBLIC book accepts a comment from any logged-in non-owner; a SHARED book accepts a comment from a share-listed user but 404s a non-listed one for **both** `POST` and `GET` — checked explicitly since the SHARED teaser-visibility toggle (`shared_teaser_visible`) affects the public-profile listing and cover but *not* comment access, so a teaser-visible SHARED book being discoverable doesn't mean its comments are; the comment's author can delete it (204); the book's owner can delete someone else's comment on their book (204, moderation); a third party who is neither gets 403 (not 404 — confirms the route-level error mapping, not just the service-level `ForbiddenError`); deleting a book with comments correctly cleaned up its `comments` rows (verified directly against D1). All throwaway rows removed afterward.

**v3.3 Phase 2 "Comments" complete.**

### Phase 3 — In-app notifications with per-type preferences (issue #326) — complete

- [x] New `notifications` table (migration `0020_notifications.sql`) — `type` (`FOLLOW`/`COMMENT`/`RATING`/`SHARE`), `actor_user_id`, polymorphic `target_type`/`target_id` (no FK, same shape as `profile_activities`/`comments`), `read_at`. No email/push, in-app only (per issue #299's original `AskUserQuestion`, 2026-08-08).
- [x] New `user_preferences` table, row-per-type, default enabled (absence of a row = enabled) — the user's own explicit requirement ("jeder kann seine Benachrichtigungen in den Einstellungen anpassen") beyond the base trigger list. `PUT /api/notifications/preferences` upserts one row at a time; `GET` always returns all 5 types resolved against the default.
- [x] **A fifth preference type, `ACTIVITY_RATING`, was added mid-phase via a follow-up `AskUserQuestion` (2026-08-08)** — not a notification, it gates whether `recordRatingActivity` (Phase 1) writes a `RATING_GIVEN` row to `profile_activities` at all. Reasoning: a rating is the first activity entry that reveals a specific action (who rated what) rather than restating something already public (a book/project already being PUBLIC), so it gets its own opt-out. Reused the same row-per-type `user_preferences` mechanism instead of a second parallel table — structurally identical ("does this user want this kind of thing logged/sent"), just gating a different write.
- [x] **Preference check happens at insert time, not read time**, via a single self-contained SQL statement (`buildNotificationInsert`) rather than an async pre-check: `INSERT ... SELECT ... WHERE actor != recipient AND NOT EXISTS (muted row)`. Always safe to run — it naturally no-ops for a self-notification or a muted type — so it drops directly into a `db.batch()` alongside the triggering primary write (`rateBook`, `createComment`). For the two `INSERT OR IGNORE` triggers (`followUser`, `shareBookWithUser`), the notification is sent only when `result.meta.changes > 0`, so a repeat/idempotent follow or re-share doesn't spam a duplicate notification — this couldn't be a single batched statement since the decision depends on the first statement's own result.
- [x] `GET /api/notifications` (list + unread count), `POST /:id/read`, `POST /read-all`, `GET`/`PUT /preferences`. Marking another user's notification read is a silent no-op (fails closed without leaking whether the notification exists), not a 403/404.
- [x] Frontend: a `NotificationBell` component (bell icon + unread badge) in `MainLayout`'s header, next to the profile link — a dropdown popover with **a type filter (Alle/Follower/Kommentare/Bewertungen/Freigaben)** so the received list stays scannable, requested mid-session by the user directly ("bau evtl auch einen kleinen Filter ein welche Nachrichten man sehen möchte"). Clicking a notification marks it read (optimistic local update, no waiting on the round-trip) and deep-links to the relevant profile/book/project. `Settings.razor` gained a "Benachrichtigungen" section with one checkbox per preference type (the 4 notification types plus `ACTIVITY_RATING`).

**Known, deliberate scope trim:** the bell only fetches on mount and when the popover is opened — no polling/websocket for real-time badge updates. Acceptable for an in-app-only, no-push feature; revisit if the eventual "Home Feed" story (deferred from Phase 1) makes staleness more noticeable.

**One real bug found live, right after merge — same class as v3.1's PR #302:** `NotificationBell.BuildLink` built hrefs with a leading slash (`/library/books/{id}`), which resolves from the domain root and 404s under GitHub Pages' `/lumina-chronica/` subpath — Blazor's `<base href>` only rewrites *relative* links (no other component in the codebase uses a leading slash; `BookCard.razor`/`Discover.razor` were the reference for the correct pattern). Caught by clicking a real SHARE notification in the browser immediately after deploying; every other trigger (FOLLOW/RATING/COMMENT/mute-at-insert-time/mark-read/mark-all-read/idempotent-share) had already been verified correct via direct API calls before this was found. Fixed to relative hrefs same-day (PR #332), with a new regression test asserting no notification link starts with `/`. Re-verified live with a hard reload — the same SHARE notification now correctly opens the book detail page.

Backend: 339/339 Vitest tests passing (34 new). Frontend: 241/241 bUnit tests passing (17 new, one added by the hotfix).

**v3.3 "Comments, Notifications, Activities" complete — all three phases shipped.** Next up: the Community Premium Design rework (issue #315, below), then v4.0 (KI).

## v3.4 — Community Premium Design (in progress)

Picks up backlog issue #315 (a full literary-archive visual rework of `PublicProfile.razor`/`Discover.razor`, sibling to #269's Worldbuilding rework). Preceded by a static HTML prototype — real tokens pulled 1:1 from `tokens.css`/`themes/*.css`, no invented colors — reviewed live with the user (2026-08-08), approved with one round of feedback (emoji icons swapped for the app's existing hand-drawn stroke-icon style). Scoped into three sequenced phases: **#339 Shared primitives + Profile hero → #340 Discover → #341 Motion/transitions/a11y audit**.

### Phase 1 — Shared catalog primitives + Public Profile hero (issue #339) — complete

- [x] New `Components/CatalogCard` — the actual structural fix for PR #313's CSS-isolation bug. `Discover.razor` and `PublicProfile.razor` previously each hand-duplicated their own `.book-card`/`.project-card` markup against shared *global* CSS in `app.css` (because the private `<BookCard>`/`<ProjectCard>` components carry owner-only behavior, e.g. the favorite toggle, that would be wrong on a public page) — that duplication is exactly what went missing entirely in #313. `CatalogCard` is a real Blazor component with real scoped CSS and **zero owner-only logic**, consumed by both pages, so there's one copy of the markup instead of two.
- [x] Verified safe to delete the old global rules before doing it: grepped every consumer of `.book-card*`/`.project-card*` across the codebase first (`BookCard.razor`, five detail pages' own single-cover placeholder markup, four private card components). Only `.book-card-normal`/`.book-card-owner-link`/`.book-card-rating` (plus the already-dead `.book-card-rate-stars`) and the three `.public-profile-*` rules were exclusive to the two migrated pages; everything else stays, since other pages still depend on it.
- [x] `PublicProfile.razor` hero redesign: gold-ring avatar (stroke-icon placeholder, not a bare emoji), Fraunces name, "Öffentliches Archiv" eyebrow, dot-separated Follower/Folgt meta line, skeleton loading shape. Sections reframed as Roman-numeral "chapters" (`I Bibliothek`, `II Projekte`, `III Aktivität`) reusing the existing double-gold-rule signature device (previously only applied to `h1`) at chapter scale. Literary-flavored empty states (`❦` ornament + flavor text) replace the old plain "noch keine…" line, with a "Buch hinzufügen" CTA on your own empty library per the issue's spec.
- [x] **Follow button state hierarchy corrected against the prototype**: primary-filled "+ Folgen" by default, a deliberately *quieter* outline "✓ Gefolgt" once following — the prototype had both states equally prominent, but issue #315 explicitly wants the post-follow state to read as calmer, not louder.
- [x] New `Components/Icon` — inline SVGs matching the app's existing hand-drawn stroke-icon language (`viewBox 0 0 24 24`, `fill:none`, `stroke:currentColor`, `stroke-width:1.4`, see `BookCard`/`CharacterCard`), replacing 🔔/👤 emoji in `NotificationBell`, `MainLayout`'s Profil/Anmelden links, and Discover's user-search avatar placeholder. Found one real regression while doing this: the bell emoji rendered in its own native color regardless of CSS, so swapping it for a `currentColor` stroke icon made the header's implicit text-color context load-bearing for the first time — `.notification-bell-toggle` needed an explicit `color: var(--color-text-on-dark)` to stay visible against the dark header, the same rule its sibling `.app-profile` already had.

**Two deliberate deviations from the reviewed prototype, decided during phase-issue scoping, not silently:**
- **Discover stays books-only.** The prototype showed a Bücher/Projekte filter and mixed project cards on Discover for visual variety, but Discover only lists public books today (`GET /api/discover/books`), and issue #315 is explicit: *"Aktuell nur Neueste/Beste Bewertung … aber vorerst nur die tatsächlich vorhandenen Optionen zeigen."* That filter/mixing is out of scope for #340 too — it's a new feature (a public project listing), not a design pass.
- **Project cards on the profile stay non-clickable**, exactly as before this PR. `ProjectDetail.razor` is still the owner's private editing workspace (characters/locations/timeline/lore, all owner-only controls) with no public read-only view — the same gap #325's write-up already flagged. Linking a profile's project card there would leak those controls to any visitor, the same class of permission leak fixed for books earlier this session (`BookSummary.isOwner`). Public project viewing is real, plausible future scope, but belongs to its own story.

No "Mitglied seit {date}" field, despite the prototype having one: `PublicUserProfile`/`getUserByUsername` deliberately excludes `created_at` from what an anonymous visitor can see (existing privacy scoping, predates this phase). Used the issue's own suggested "Öffentliches Archiv" eyebrow label instead of adding a new public field for it.

Live-verified against real production data (2026-08-08): the real account's own public profile (hero, chapters, a real book cover, catalog rating format) across all three themes (classic-library/dark-library/modern-light, switched via `localStorage`), zero console errors; two throwaway accounts confirmed the follow interaction end-to-end (button state flip, follower count, notification-bell popover still opens) and the "own empty profile" CTA / "stranger's empty profile" text branch — all throwaway rows (`users`, `followers`, `notifications`, `user_settings`) removed from D1 afterward.

Backend: unchanged, 341/341 Vitest tests still passing. Frontend: 267/267 bUnit tests passing (22 new: `CatalogCardTests.cs`, `IconTests.cs`, plus new coverage in `PublicProfilePageTests.cs`).

**v3.4 Phase 1 complete.** Next: Phase 2 — Discover page redesign (#340).

### Phase 2 — Discover page redesign (issue #340) — complete

- [x] `Discover.razor` restyled as the "Great Library Catalog": page heading gained an italic caption ("Entdecken — Werke und Welten aus aller Welt") using the same chapter-heading device as Profile's chapters; search field restyled (paper background, gold border, focus ring, `Icon Name="search"`); user search results became small "author cards" (avatar + username + "Autor / Worldbuilder" caption, hover = background shift + gold border, same 400ms debounce, unchanged); sort control restyled with a label, same two options; book grid section retitled "Bibliotheksregal", using `.chapter-title`/`.chapter-caption`.
- [x] Empty state (no public books) gained literary flavor text + an ornament; loading state gained a skeleton grid of card-shaped placeholders instead of "Lädt…".
- [x] **Kept the page's `<h1>` German ("Entdecken" + italic caption) rather than the spec's literal `DISCOVER — Entdecke neue Werke und Welten`** — the rest of the UI is uniformly German, and a bare English word would read as inconsistent, not intentional. Same conceptual device the spec asked for ("wie eine Kapitelüberschrift"), just in the app's actual language.
- [x] **Promoted three style groups from `PublicProfile.razor.css` into shared `app.css` utilities** now that Discover is a second consumer, instead of duplicating them (the discipline #315's Definition of Done exists to enforce): `.chapter-title`/`.chapter-caption` (was `.profile-chapter-title`/`.profile-chapter-caption`), `.skeleton-shape`/`@keyframes skeleton-shimmer`, `.empty-state-literary`/`.empty-state-ornament`.

**Scope correction confirmed while writing the phase issue, not discovered mid-implementation:** the reviewed prototype showed a Bücher/Projekte filter and mixed project cards on Discover, but Discover only ever lists public books (`GET /api/discover/books` — no project-listing endpoint exists) and issue #315 explicitly says to keep only the existing sort options for now. That filter/mixing was out of scope from the start (see #340's own issue body) — public project discovery is a real, plausible future feature, but a new one, not a design pass.

**Because this phase changed CSS *scoping* (Blazor-scoped → global) in the exact file (`PublicProfile.razor.css`) and exact bug class (#313's CSS-isolation) issue #315 is designed to prevent, this got its own explicit verification pass before shipping**, not just Discover's own live-verify: fetched the deployed CSS bundles directly and confirmed each promoted rule landed in the correct file (`app.css` for the base rule, the Blazor-generated scoped bundle for the page-specific override — e.g. `.profile-hero-skeleton .skeleton-shape.profile-hero-portrait`, `.empty-state-literary .btn`); then visually re-verified the Profile page's own-empty-library CTA button (`.empty-state-literary .btn`'s margin) still rendered correctly against a fresh throwaway account, live in the browser, after the split.

Live-verified against real production data (2026-08-08): Discover's restyled search (real author-card results for two real users), hover states, sort control, and book grid (real cover, real rating) all rendered correctly; the Profile-page CSS-scoping split re-verified as above. Throwaway account (`user_settings` + `users` rows) removed from D1 afterward.

Backend: unchanged, 341/341 Vitest tests still passing. Frontend: 270/270 bUnit tests passing (3 new: skeleton-loading state, search field a11y, author-card role caption).

**v3.4 Phase 2 complete.** Next: Phase 3 — motion polish, transitions & accessibility audit (#341), including the `documentation/Architecture.md` write-up deferred from Phase 1/2 to cover all of #315 at once.
