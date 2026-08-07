# Changelog

All notable changes to Lumina Chronica are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Projects: foundation for v2.0 Worldbuilding — create/browse/edit/delete personal projects (World/Novel/RPG/Custom) with an optional cover image (issue #254, Phase 1 of 6, epic #9).
- Projects: characters — add/browse/edit/delete characters within a project (name, age, origin, description, personality, biography, optional image), accessible via a new Übersicht/Charaktere tab on the project page (issue #255, Phase 2 of 6, epic #9).
- Projects: locations & map — upload a map image per project, add locations and place them as clickable pins on the map (or leave unplaced), via a new Karte tab on the project page (issue #256, Phase 3 of 6, epic #9).
- Projects: timeline — add chronological in-world events with a free-text date, description, and manual reordering, rendered as a visual timeline via a new Zeitleiste tab on the project page (issue #257, Phase 4 of 6, epic #9).
- Projects: lore & files — write Markdown lore entries and upload a documents/images gallery per project, via new Lore and Dateien tabs on the project page (issue #258, Phase 5 of 6, epic #9).

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
