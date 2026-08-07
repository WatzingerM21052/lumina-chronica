# Lumina Chronica

> *Where stories become knowledge and knowledge becomes worlds.*

Lumina Chronica is a personal digital library and creative knowledge platform — combining a comfortable ebook reader, personal library organization, worldbuilding tools for writers and worldbuilders, and (later) community and AI features. It's designed to feel like entering your own personal library, not managing a database.

## Status

✅ **v3.1.0 released** (2026-08-08) — personal library + reader (v1.0/v1.5: auth, EPUB/PDF/TXT/Markdown reader, shelves/tags/favorites, bookmarks, statistics), worldbuilding (v2.0: projects, characters, locations/maps, timelines, lore, linked books), a security hardening pass (v2.1), and Community (v3.0: public profiles, following, ratings, discovery) plus v3.1's borrowed reading — a book's owner can share it so any logged-in user can fully read it (own progress/bookmarks, no separate upload needed). Next up: v4.0 (KI). See [`documentation/Roadmap.md`](documentation/Roadmap.md) for the full version plan and [GitHub Projects](../../projects) for live progress.

- Frontend: https://watzingerm21052.github.io/lumina-chronica/
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
```

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
