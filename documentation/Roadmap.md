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

**Explicitly out of scope this phase** (same exclusion reasoning as `Architecture.md`'s decision row): `user_statistics`/a full Statistics page (epic #12, v1.5 — `Statistics.razor` keeps its existing `EmptyState` stub), "Trends" (needs cross-user data, out of scope until Discovery/Community), and Home's "Aktuelle Projekte" section (epic #9, v2.0 — left untouched).

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
