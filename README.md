# Lumina Chronica

> *Where stories become knowledge and knowledge becomes worlds.*

Lumina Chronica is a personal digital library and creative knowledge platform — combining a comfortable ebook reader, personal library organization, worldbuilding tools for writers and worldbuilders, and (later) community and AI features. It's designed to feel like entering your own personal library, not managing a database.

## Status

✅ **v3.5.0 released** (2026-08-09) — personal library + reader (v1.0/v1.5: auth, EPUB/PDF/TXT/Markdown reader, shelves/tags/favorites, bookmarks, statistics), worldbuilding (v2.0: projects, characters, locations/maps, timelines, lore, linked books), a security hardening pass (v2.1), Community (v3.0: public profiles, following, ratings, discovery), borrowed reading (v3.1/v3.2: `PUBLIC`/`SHARED` book visibility with per-viewer progress/bookmarks), Comments/Notifications/Activities (v3.3), a full Community "Living Library of Alexandria" design pass (v3.4: motion system, accessibility audit), and epic #349's "Living Library Feedback System" (loading/button/toast/error-state foundation, a performance pass, and the Lumina mascot illustrations rolled out across 12 real pages).

🚧 **Since then (unreleased, live on `main`)**: the "Core App Experience Rework" (issue #358) — Dashboard and Statistics heroes, the 3D library shelf, the "Travelling Library" offline page, reworked Settings and Profile; account functions (avatar upload, account deletion with restore, linking Google/GitHub, password reset by emailed code or link); German/English UI; the custom domain; CI that tests every PR and gates both deploys; and an ongoing UI/UX pass that moves forms into dialogs (issue #496, plan in `docs/superpowers/plans/2026-09-27-ui-ux-mobile-roadmap.md`). See [`CHANGELOG.md`](CHANGELOG.md), [`documentation/Roadmap.md`](documentation/Roadmap.md) for the full history and [GitHub Projects](../../projects) for live progress.

- Frontend: https://luminachronica.com (the old https://watzingerm21052.github.io/lumina-chronica/ redirects there)
- Backend: https://lumina-chronica-api.svhofkirchen-api.workers.dev/api/status

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Blazor WebAssembly (.NET 10), hosted on GitHub Pages |
| Backend | Cloudflare Workers (TypeScript, [Hono](https://hono.dev)) |
| Database | Cloudflare D1 (SQLite-compatible) |
| File storage | Cloudflare R2 |
| API | REST, JSON, base path `/api/` |

See [`documentation/Architecture.md`](documentation/Architecture.md) for the full architecture and the reasoning behind every technical decision.

## Repository structure

```
frontend/        Blazor WebAssembly client
backend/          Cloudflare Worker API
database/         D1 schema + migrations
shared/           Cross-stack shared types/contracts (as needed)
scripts/          Dev/deploy helper scripts (as needed)
documentation/    Architecture, roadmap, database docs, and the Master Project Bible
tests/            Frontend (bUnit) and backend (Vitest) tests
docs/superpowers/ Design specs and implementation plans per feature
```

## Running the tests

```
dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj
(cd backend && npm ci) && cd tests/backend && npm ci && npx vitest run
```

The backend tests import the Worker source from `backend/src`, so both folders need their dependencies installed.

GitHub Actions (`.github/workflows/ci.yml`) runs both suites plus a backend typecheck on every pull request; the frontend and backend deploys only run after the same checks pass.

## Documentation

- [`documentation/Architecture.md`](documentation/Architecture.md) — technical architecture and decisions
- [`documentation/Roadmap.md`](documentation/Roadmap.md) — version roadmap (V0.1 → V5.0)
- [`documentation/Database.md`](documentation/Database.md) — database schema
- [`documentation/Technical-Standards.md`](documentation/Technical-Standards.md) — coding, API, and design conventions
- [`documentation/master-project-bible/`](documentation/master-project-bible/) — the full 9-part project specification

## Contributing

The repository is public and open to feedback, but development direction is maintainer-controlled. See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR — every non-trivial change starts as an issue.

## License

[MIT](LICENSE)
