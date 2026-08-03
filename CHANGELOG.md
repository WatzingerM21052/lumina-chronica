# Changelog

All notable changes to Lumina Chronica are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
- QoL: a real confirmation dialog for deleting books/shelves, and drag-and-drop file upload for the book/cover forms.

### Fixed

- Several real bugs found via live verification across the above phases: German-locale decimal separator breaking reading-progress saves, a D1 foreign-key constraint on book deletion, EPUB uploads rejected on generic browser MIME types, a missing `@` prefix silently binding a Razor parameter to a literal string, a stale-render bug in debounced search, OpenLibrary's `subjects` being plain strings, HTML markup leaking into enriched descriptions, and race conditions in both the PDF (canvas) and EPUB (rendition) readers under rapid clicking.

v0.2 (Technical Foundation) is complete: https://watzingerm21052.github.io/lumina-chronica/ is live and talking to https://lumina-chronica-api.svhofkirchen-api.workers.dev.

v1.0's Authentication phase is complete and verified end-to-end against production (real JWT issued, real D1 row with a hashed password).

v1.0's Library, Reader, Organization, Dashboard, Offline, and Statistics phases are complete and live-verified against production. Remaining before the v1.0 release milestone: none of the Master Development Flow's phases — see `documentation/Roadmap.md` for the full phase-by-phase detail.
