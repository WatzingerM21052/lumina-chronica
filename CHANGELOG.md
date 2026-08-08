# Changelog

All notable changes to Lumina Chronica are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Community: profile activity log (v3.3 Phase 1, issue #324) — `/u/{username}` now has an "Aktivitäten" section listing the profile owner's own public actions: a book or project's transition into `PUBLIC` visibility, and each rating given to a book (one entry per re-rate, since ratings are upsert but each rating is still a distinct event). First version only logs the viewing profile's own actions — an aggregated feed across everyone you follow is a possible later story, not in scope here. New `profile_activities` table (migration `0018_profile_activities.sql`), deliberately not named `activities` to avoid colliding with the unrelated `reading_activity` table (per-day reading counts for the Lesekalender heatmap).
- Community: comments on books and projects (v3.3 Phase 2, issue #325). A book is commentable by anyone who can actually read it — owner, any logged-in user on a `PUBLIC` book, or a listed user on a `SHARED` book's share list — the same rule reading itself uses, not the `PUBLIC`-only rule ratings use. A project is commentable by its owner or, if `PUBLIC`, any logged-in user (projects have no share-list equivalent to books). Create + delete only for this first version (no edit); delete is allowed by the comment's own author or the commented-on book/project's owner. New `comments` table (migration `0019_comments.sql`).
- Community: in-app notifications with per-type preferences (v3.3 Phase 3, issue #326). A bell icon in the header (badge shows unread count) lists notifications for `FOLLOW`/`COMMENT`/`RATING`/`SHARE` events, newest first, with a small filter to narrow the list to one type; clicking a notification marks it read and links to the relevant profile/book/project. No email or push, in-app only. Every user can enable/disable each notification type individually from `/settings` — the preference is checked at insert time, so muting a type only affects future events and never retroactively hides already-delivered notifications. A fifth preference type, `ACTIVITY_RATING`, was added to the same mechanism (not a notification) to let a user opt their own rating activity out of their public profile's "Aktivitäten" log, since `RATING_GIVEN` is the first activity entry that reveals a specific action rather than restating something already public. New `notifications` and `user_preferences` tables (migration `0020_notifications.sql`).
- The owner's name on a Discover book card, and a new "Geliehen von {username}" badge on the book overview page (shown when viewing a borrowed book), both link to the owner's public profile. The book overview page also gained a rating section — it previously had no rating capability at all, even though Discover and the public profile displayed average ratings; the public profile's interactive rate-stars widget moved there and is now display-only on the profile.
- Premium community redesign, Phase 1 (v3.4, issue #339, part of the #315 "literary archive" rework): new `Components/CatalogCard` — a real Blazor component with no owner-only behavior (no favorite/edit/delete/shelf picker) — replaces the hand-duplicated `.book-card`/`.project-card` markup `Discover.razor` and `PublicProfile.razor` each carried in global `app.css`, the actual structural fix for the CSS-isolation bug PR #313 hit. `PublicProfile.razor`'s hero is redesigned (gold-ringed avatar, Fraunces name, dot-separated Follower/Folgt meta line, a "Buch hinzufügen" CTA on your own empty library) with its sections framed as Roman-numeral "chapters" (Bibliothek/Projekte/Aktivität) using the app's existing double-gold-rule signature device. The Folgen/Gefolgt button's states were also inverted to match the intended hierarchy: primary-filled "+ Folgen" by default, a deliberately quieter outline "✓ Gefolgt" once following (previously both states looked equally prominent). New `Components/Icon` replaces emoji chrome (🔔, 👤) with the app's existing hand-drawn stroke-icon style in `NotificationBell`, `MainLayout`'s Profil/Anmelden links, and Discover's user-search avatar placeholder — found and fixed one real regression along the way: the bell emoji rendered in its own color regardless of CSS, so swapping it for a `currentColor` icon needed an explicit text color on the header's dark background, previously never necessary.
- Premium community redesign, Phase 2 (v3.4, issue #340): restyles `Discover.razor` as the "Great Library Catalog" — the search field, user-search results ("author cards": avatar + username + "Autor / Worldbuilder"), sort control, and book grid heading ("Bibliotheksregal") now match the literary-archive language Phase 1 established, using the same `Components/CatalogCard` for the book grid. Empty state gained flavor text + an ornament instead of a plain line; loading state gained a skeleton grid of card-shaped placeholders instead of "Lädt…". Visual restyle only — no new filter/sort options and no projects added to the grid, since Discover only lists public books today and issue #315 explicitly scopes this phase to what already exists. Chapter-heading, skeleton-loading, and empty-state styles that gained a second consumer (Profile + Discover) were promoted from `PublicProfile.razor.css` into shared `app.css` utility classes rather than duplicated.
- Activity-log rating privacy (issue #315 Phase 3 follow-up, raised by the user while reviewing the redesign): the `ACTIVITY_RATING` preference — whether your ratings show up in your own public profile's "Aktivitäten" log at all — now defaults to **disabled** instead of enabled. A new, independent `ACTIVITY_RATING_STARS` preference (also disabled by default) separately controls whether the specific star count is shown once a rating activity is visible; when it's off, the entry reads "hat „Titel" bewertet" with no number. The star value was judged the more sensitive part — it can read as a personal opinion about someone else's work and unfairly color another visitor's impression, more so than the bare fact that a rating happened. Migration `0021_activity_rating_stars.sql` adds the new type to `user_preferences`' `CHECK` constraint (SQLite table-recreate, no prior migration here had needed one).
- Premium community redesign, Phase 3 motion (v3.4, issue #341, part 1 of 2): a small, consistent motion system (`--motion-micro`/`--motion-standard`/`--motion-reveal` + `--ease-standard`, `tokens.css`) now drives every transition Phases 1/2 already had plus three new ones. `[data-reveal]` sections on Discover/PublicProfile fade+rise into view via a new `wwwroot/js/motion.js` (`IntersectionObserver`-based) — content already in the viewport when the script runs is left alone rather than hidden-then-revealed, since the module import itself is an awaited network fetch and hiding already-painted content would show up as a pop-out flicker on a slow load, not a reveal. The header (`MainLayout`) is now `position: sticky` (a deliberate, app-wide layout change) and compacts (smaller logo, less padding) once a scroll sentinel below it leaves the viewport, using an observer instead of a scroll-event listener. Page content fades in on every client-side navigation (`.page-enter`, replayed via a reflow trick, gated on the path actually changing so same-page navigations don't flicker). The Folgen/Gefolgt button gained a restrained radial press-fade (not a Material ripple). All of it, including the existing Phase 1/2 transitions now expressed through the same tokens, respects `prefers-reduced-motion` — checked in JS before any class is added, and mirrored in CSS as a live fallback for the OS setting changing without a reload.
- Premium community redesign, Phase 3 accessibility (v3.4, issue #341, part 2 of 2 — closes #341): a new per-theme `--color-accent-text` token fixes the global keyboard-focus ring and filled rating stars, which measured only ~2.2–2.6:1 contrast against light-theme backgrounds (`--color-gold-accent` itself, well under WCAG's 3:1 floor for a UI component) — decorative gold uses (dividers, the empty-state ornament) are untouched, since contrast requirements don't apply to pure decoration. `CatalogCard`'s owner-name link is now keyboard-operable (`tabindex`, `role="link"`, Enter to activate — a plain `@onclick`-only `<span>` was previously unreachable without a mouse). `BookDetail.razor`'s rating stars gained `aria-pressed` and a toggle-aware `aria-label` (clicking your own current rating removes it, so the label says so, rather than a generic "rate with N stars" that would misdescribe the action). Discover's user search now announces its own state (`aria-live`, `aria-busy`, a "Suche läuft…" message covering the full debounce+request gap, not just the request itself); both loading skeletons (Discover's grid, PublicProfile's hero) stay `aria-hidden` but gained a paired `aria-busy` and a screen-reader-only loading announcement via a new global `.visually-hidden` utility. `documentation/Architecture.md` — untouched by this rework since Phase 1 — gained three new decision-log entries covering the `CatalogCard`/`Icon` architecture, the motion system (including both bugs above), and this accessibility pass.

Backend: 345/345 Vitest tests passing (40 new). Frontend: 277/277 bUnit tests passing (53 new).

### Fixed

- Profile activity log crashing `/u/{username}` for any profile with an activity: `ProfileActivity.CreatedAt` was typed `DateTime`, which `System.Text.Json` rejects for D1's actual timestamp format. See the v3.3 Phase 1 Roadmap entry for the full story.
- Notification deep-links 404ing under the GitHub Pages `/lumina-chronica/` subpath: `NotificationBell.BuildLink` used leading-slash hrefs, which resolve from the domain root instead of going through Blazor's `<base href>` rewrite. See the v3.3 Phase 3 Roadmap entry for the full story.
- Discover's book cards linked to the owner's public profile instead of the book itself; a public profile's book cards linked straight into the reader via a "Lesen" button instead of the book overview. Both now link (the whole card, for the profile page) to the book's own overview page.
- `BookDetail.razor` showed Bearbeiten/Löschen/the favorite star/the shelf picker to anyone who could view a book, including a SHARED-book borrower who isn't the owner — every one of those actions is owner-only server-side (`findOwnedBookRow`) and just 404'd. The API never told the frontend who owns a book at all; added a server-computed `BookSummary.isOwner` field and gated all four behind it.

## [3.2.0] - 2026-08-08

### Changed

- Community: swapped PUBLIC/SHARED semantics after direct user feedback the day v3.1.0 shipped. `PUBLIC` now grants full read access (detail, file, reading progress, bookmarks) to any logged-in user — not just the cover+metadata teaser it gave before; the teaser itself is unchanged (visible to anyone, including anonymous visitors). `SHARED` now requires being on the book's explicit share list rather than being open to any logged-in user.

### Added

- Community: per-book sharing — a `SHARED` book's owner picks exactly who can read it (new `book_shares` table), with a toggle for whether people not on that list still see the cover+description teaser on the public profile. Manage the list from the book's edit form (search by username, add/remove).
- Public profile book cards now expose a server-computed `canRead` field (share-list membership isn't visible to the frontend otherwise) — the "Lesen" button is keyed off that instead of raw visibility.

Ratings, favorites, and shelving stay exactly as before: PUBLIC-only and owner-only respectively — a SHARED book (whether you're on its share list or not) still can't be rated, favorited by a non-owner, or shelved by a non-owner. An option to let PUBLIC books be fully read by anonymous (logged-out) visitors was explicitly considered and rejected — it would need a new public reader page with no progress-saving and would reverse the Phase 1 decision to keep book files behind auth for copyright reasons.

No new migration beyond `0017_book_sharing.sql` (`book_shares` + `books.shared_teaser_visible`) — existing columns are untouched.

Backend: 300/300 Vitest tests passing (16 new/updated). Frontend: 223/223 bUnit tests passing (7 new/updated).

## [3.1.0] - 2026-08-08

### Added

- Community: borrowed reading — a book's owner can set its visibility to `SHARED`, granting any logged-in user full read access to it (not just the cover+metadata teaser `PUBLIC` gives an anonymous visitor). Reading progress and bookmarks are saved per-user, independent of the owner's own, exactly like an owned book. Saves cloud storage: multiple users no longer each need their own copy of the same book (issue #316).
- Home dashboard: a borrowed book in "Weiterlesen" is now tagged with a "Geliehen von {username}" badge instead of the (owner-only) favorite star.
- Public profile: a `SHARED` book shows a "Lesen" button (logged in) or "Anmelden zum Lesen" prompt (logged out) instead of the rating widget.

Mutations (edit/delete/favorite/cover-replace/rate/shelve) stay strictly owner-only — only reading the book, its progress, and its bookmarks relax for `SHARED`. No new migration; `SHARED` has existed in the schema since v1.0 but was unenforced until now.

Backend: 289/289 Vitest tests passing (13 new). Frontend: 219/219 bUnit tests passing (5 new).

### Fixed

- The Home dashboard's "Geliehen von" badge literally rendered the text "Geliehen von item.OwnerUsername" for every borrowed book: `Home.razor` bound `BookCard`'s `OwnerUsername` (a `string?` parameter) without a leading `@`, so Razor treated the value as a literal string constant instead of evaluating the property — the same missing-`@`-prefix bug class already documented in this changelog's v1.0 entry. Found live by the user right after release, same day.

## [3.0.0] - 2026-08-07

### Added

- Community: public profile — `/u/{username}`, reachable while logged out, shows a user's PUBLIC books and projects (cover + metadata only, the book file itself stays auth-gated). `visibility` (PRIVATE/PUBLIC), stored since v1.0/v2.0 but never user-facing, is now settable via a selector on the Book/Project edit forms (issue #300, Phase 1, epic #11).
- Community: follow — follow/unfollow any user by username, follower/following counts and a Folgen/Entfolgen button on the public profile (issue #304, Phase 2, epic #11).
- Community: ratings — 1-5 star ratings on PUBLIC books (no self-rating), an inline rating widget with average + count on each public-profile book card (issue #307, Phase 3, epic #11).
- Discovery: `/discover` page — replaces the placeholder scaffolded since v0.2. Browse PUBLIC books sorted by newest or highest-rated, and search for users directly by username (issue #310, Phase 4, epic #10).

### Fixed

- `deleteBook` never cleaned up `ratings`, causing a real FOREIGN KEY constraint failure deleting a rated book against production D1.
- `PublicProfile`/`Discover` book and project cards, and Discover's user-search avatars, had no CSS at all (rendered edge-to-edge unstyled) since those pages render card markup directly rather than through the `<BookCard>`/`<ProjectCard>` components that own the corresponding Blazor-scoped styles.

Backend: 276/276 Vitest tests passing. Frontend: 214/214 bUnit tests passing. Migrations `0015_followers.sql` and `0016_ratings.sql` applied to production D1.

## [2.1.0] - 2026-08-07

### Security

- Removed the unused `vitest` devDependency from `backend/` and refreshed dependencies, resolving all 11 open Dependabot alerts (1 critical, 2 high, 8 moderate) — issue #276.
- Added `.github/dependabot.yml`, extending automated vulnerability scanning to all four ecosystems in the repo (previously only GitHub's default scan existed).
- Rate-limiting on `POST /api/auth/login` and `/register` against brute-force and mass account creation, D1-backed, keyed to avoid an attacker locking a victim out of their own account — issue #277.
- `X-Content-Type-Options: nosniff` on all file/image-streaming routes (books, shelves, project covers/maps/character/location images, project files).

Backend: 235/235 Vitest tests passing.

## [2.0.0] - 2026-08-07

### Added

- Projects: foundation for v2.0 Worldbuilding — create/browse/edit/delete personal projects (World/Novel/RPG/Custom) with an optional cover image (issue #254, Phase 1 of 6, epic #9).
- Projects: characters — add/browse/edit/delete characters within a project (name, age, origin, description, personality, biography, optional image), accessible via a new Übersicht/Charaktere tab on the project page (issue #255, Phase 2 of 6, epic #9).
- Projects: locations & map — upload a map image per project, add locations and place them as clickable pins on the map (or leave unplaced), via a new Karte tab on the project page (issue #256, Phase 3 of 6, epic #9).
- Projects: timeline — add chronological in-world events with a free-text date, description, and manual reordering, rendered as a visual timeline via a new Zeitleiste tab on the project page (issue #257, Phase 4 of 6, epic #9).
- Projects: lore & files — write Markdown lore entries and upload a documents/images gallery per project, via new Lore and Dateien tabs on the project page (issue #258, Phase 5 of 6, epic #9).
- Projects: linked books & character relationships — link books from your library to a project via a search/pick UI on a new Bücher tab, and record directional relationships between characters (e.g. "Mentor von") on a character's own page. Closes out v2.0 Worldbuilding (issue #259, Phase 6 of 6, epic #9).

Backend: 231/231 Vitest tests passing. Frontend: 187/187 bUnit tests passing.

## [1.5.0] - 2026-08-07

### Added

- Bookmarks: mark and jump back to any number of positions within a book (distinct from the single auto-saved resume position), each with an optional note, across EPUB/PDF/TXT/MD (issue #248).
- Statistics page rework: a settable yearly reading goal with a progress ring, a GitHub-style reading calendar heatmap, current/longest reading streaks, and a yearly overview (books finished/pages/active days per year), alongside the existing books-read/pages/genre/recent-activity stats (issue #250).

Backend: 128/128 Vitest tests passing. Frontend: 135/135 bUnit tests passing (excludes one pre-existing, unrelated `BiblePageTests` failure — issue #247).

## [1.0.0] - 2026-08-05

### Added

- Repository foundation: license, contribution guidelines, issue/PR templates, GitHub Project board (v0.1).
- Project documentation (`documentation/`): Architecture, Roadmap, Database, Technical Standards, and the full Master Project Bible.
- Blazor WebAssembly frontend scaffold: routing, MainLayout/NavMenu, 4-theme engine (Classic Library/Modern Light/Dark Library/System), reusable LoadingIndicator/ErrorPage/EmptyState components (v0.2).
- Cloudflare Worker backend scaffold: Hono app, restrictive CORS, standard response envelope, `GET /api/status`, stub routes for auth/books/users/projects/statistics (v0.2).
- D1 database (`lumina-chronica-db`) with initial migration (`roles`, `users`, `user_settings`) (v0.2).
- CI/CD: automated frontend deploy to GitHub Pages; backend deploy workflow (pending a `CLOUDFLARE_API_TOKEN` secret) (v0.2).
- Frontend and backend test suites (bUnit, Vitest) (v0.2).
- Authentication: registration, login (username or email), logout, session (JWT in `localStorage`, `AuthenticationStateProvider`/`<AuthorizeView>`), profile view/edit, password change (v1.0, Phase 2). Password reset, email confirmation, avatar upload, and OAuth login are explicitly deferred — see `documentation/Roadmap.md`.
- Library: book model (`books`/`book_files`/`book_metadata`/`tags`/`book_tags`), Cloudflare R2 file storage, upload (EPUB/PDF/TXT/Markdown + optional cover), browse/search/filter/sort, book detail view/edit/delete (v1.0, Phase 3). Shelves and in-app reading are explicitly deferred — see `documentation/Roadmap.md`.
- Reader: EPUB (vendored epub.js, CFI-based resume, chapters/pagination), PDF (vendored pdf.js, canvas rendering, page navigation + zoom), TXT/Markdown readers, reading-progress infrastructure (v1.0, Phase 4). Client-side metadata extraction from uploaded EPUB/PDF files pre-fills the upload form.
- Real old-library visual design pass: self-hosted Fraunces/Literata fonts, brass/gilt and oxblood-leather color tokens for the Classic/Dark Library themes, chapter-heading signature device, EPUB reader content now themed instead of always black-on-white.
- Organization: shelves (create/edit/delete, add/remove books), tags browsing/filtering, favorites (v1.0, Phase 5). Cover images can be replaced after creation for both books and shelves.
- Library UX polish: multi-select genre/tag filters with a facets endpoint, auto-apply-on-change, debounced search-as-you-type suggestions, a real pagination fix, and a native date picker for release date.
- Metadata enrichment: ISBN lookup and title/author search against OpenLibrary and Google Books, with a review/confirm step before any field is overwritten.
- Dashboard: continue-reading list, library overview counts, and unstarted-book recommendations on the Home page (v1.0, Phase 6).
- Offline reading: per-book IndexedDB caching, with a dedicated `/offline` page and reader fallback when the network is unavailable (v1.0, Phase 7).
- Statistics: books read/in-progress, estimated pages read, genre breakdown, and recent reading activity (v1.0) — re-scoped from an initial v1.5 placement after a full spec re-read, see issue #156.
- Impressum page (`/impressum`), reachable while logged out, doubling as the entry point for a secret Bible-reader page (Dark Academia themed, api.bible-backed) via the responsible person's name.
- EPUB reader: strips a known piracy-site watermark stamped into downloaded files' chapters.
- Reader Settings: font family, line-height, page width, and PDF zoom, consolidated into a single settings dropdown; images scale with font size on both EPUB and TXT/MD.
- EPUB reader: table of contents / chapter navigation menu.
- EPUB reader: subtle page-turn fade transition and swipe-to-turn-page on mobile.
- QoL: a real confirmation dialog for deleting books/shelves, drag-and-drop file upload for the book/cover forms, and arrow-key/spacebar page navigation in the EPUB, PDF, and Bible readers.
- Reader mode toggle: a real Book View/Scroll View switch for EPUB and PDF, persisted per the existing client-local settings pattern.
- Real favicon and header logo mark (flame + open book), replacing the Blazor template placeholder.
- Home page hero banner (open book, subtle world map, light rays, old-library atmosphere).
- Reader: a third "Realistische Ansicht" mode for PDF — a real StPageFlip page-turn animation (facing pages, page-edge stack, drag-to-turn or tap-a-corner) instead of a flat canvas swap. EPUB's realistic mode was attempted twice (lazy-capture, then a section-capture architecture) but is gated back off (issue #189, reopened) — see `documentation/Roadmap.md`.
- Reader: real pagination (Book View) for TXT/Markdown, with chapter/marker page breaks, a "Seite pro Kapitel" mode, and TOC anchor links (issue #155).
- Reader: a setting to hide Scroll View's scrollbars (EPUB + PDF).
- Reader: width/scrollbar/centering polish across EPUB and PDF, and a Realistic-View-quality PDF zoom pass.
- Upload/Edit forms: the drag-and-drop dropzones now show the selected filename.
- Authentication: OAuth login (Google/GitHub) alongside password auth (issue #40 — previously deferred at Phase 2).
- Bible page: opt-in Dark Academia / Baroque immersive theme with a cinematic entrance sequence (issue #143).

### Fixed

- Several real bugs found via live verification across the above phases: German-locale decimal separator breaking reading-progress saves, a D1 foreign-key constraint on book deletion, EPUB uploads rejected on generic browser MIME types, a missing `@` prefix silently binding a Razor parameter to a literal string, a stale-render bug in debounced search, OpenLibrary's `subjects` being plain strings, HTML markup leaking into enriched descriptions, and race conditions in both the PDF (canvas) and EPUB (rendition) readers under rapid clicking.
- Numerous Realistic View bugs found and fixed via live production testing (container sizing, Blazor clobbering JS-set inline styles, spread/orientation detection, cold-start capture failures) before ultimately gating the EPUB half back off — see `documentation/Roadmap.md`'s issue #189 write-up for the full sequence.
- PDF reader: fixed two classes of indefinite hang — Book/Scroll View on a pdf.js worker stall, and cover extraction with no timeout (issue #213 and follow-up).
- OAuth: a migration rejected by real D1 (`PRAGMA foreign_keys` not honored the way the local test double assumed), and a callback redirect that dropped the GitHub Pages project path (404).
- Bible Dark Academia theme: chapter fade-in stuck at `opacity: 0` on the live site.
- Dashboard: a test asserted an unmatchable substring, masking the real overview-count behavior (issue #180).

v0.2 (Technical Foundation) is complete: https://watzingerm21052.github.io/lumina-chronica/ is live and talking to https://lumina-chronica-api.svhofkirchen-api.workers.dev.

v1.0's Authentication phase is complete and verified end-to-end against production (real JWT issued, real D1 row with a hashed password).

v1.0's Library, Reader, Organization, Dashboard, Offline, and Statistics phases are complete and live-verified against production.

**v1.0.0 tagged and released on GitHub 2026-08-05** (https://github.com/WatzingerM21052/lumina-chronica/releases/tag/v1.0.0). All five Definition-of-Done groups from the source spec (§100) are met: Benutzer (Account/Login/Profil), Bibliothek (hinzufügen/verwalten/Suchen/Sortieren), Reader (lesen/Fortschritt speichern/Themes), Organisation (Regale/Tags), Deployment (GitHub Pages/Cloudflare Backend). Backend: 107/107 Vitest tests passing. Frontend: 125/125 bUnit tests passing. See `documentation/Roadmap.md` for the full phase-by-phase detail and everything that shipped beyond the strict DoD scope (OAuth, Bible Dark Academia theme, Realistic View, TXT/MD pagination, and other Reader polish) as an early start on v1.5.
