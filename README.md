# Lumina Chronica

> *Where stories become knowledge and knowledge becomes worlds.*

Lumina Chronica is a personal digital library and creative knowledge platform — combining a comfortable ebook reader, personal library organization, worldbuilding tools for writers and worldbuilders, and (later) community and AI features. It's designed to feel like entering your own personal library, not managing a database.

## Status

✅ **v4.0.0 released** (2026-10-04) — everything since v3.5.0: the "Core App Experience Rework" (issue #358) with the 3D library shelf, the statistics dashboard and the "Travelling Library" offline page; eleven themes — the two worlds Babylon and Alexandria with an immersive home page, the four classic themes and five further looks, each with its own public-domain engravings; public project pages, Discover search and sorting with view counts; account functions (avatar upload, account deletion with a 90-day restore window, linking Google/GitHub, password reset by code or link, signing out other devices); German/English UI; privacy policy, terms of use and an imprint under Austrian law; the custom domain and CI that tests every PR and gates both deploys. Earlier: library + reader (v1.x), worldbuilding (v2.0), security (v2.1), community, sharing and the "Living Library" design pass (v3.x).

See [`CHANGELOG.md`](CHANGELOG.md), [`documentation/Roadmap.md`](documentation/Roadmap.md) for the full history and [GitHub Projects](../../projects) for live progress.

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
