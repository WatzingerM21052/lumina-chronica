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
- Authentication: registration, login, logout, session (JWT in `localStorage`, `AuthenticationStateProvider`/`<AuthorizeView>`), profile view/edit, password change (v1.0, Phase 2). Password reset, email confirmation, and avatar upload are explicitly deferred — see `documentation/Roadmap.md`.

v0.2 (Technical Foundation) is complete: https://watzingerm21052.github.io/lumina-chronica/ is live and talking to https://lumina-chronica-api.svhofkirchen-api.workers.dev.

v1.0's Authentication phase is complete and verified end-to-end against production (real JWT issued, real D1 row with a hashed password).
