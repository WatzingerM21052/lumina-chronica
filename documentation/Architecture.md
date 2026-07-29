# Architecture

This document records the technical architecture of Lumina Chronica and — critically — the reasoning behind every decision that isn't already pinned down in the [Master Project Bible](master-project-bible/) or [Technical Standards](Technical-Standards.md). Per the AI Development Guidelines, architecture decisions must be explained, and the six protected decisions below must not be changed without justification (why / advantages / disadvantages / impact).

## Protected architectural decisions

Not to be changed without explicit justification:

- **Blazor WebAssembly** (frontend)
- **Cloudflare architecture** (Workers / D1 / R2)
- **Monorepo** (single repository for frontend + backend + docs)
- **D1 database**
- **R2 storage**
- **Modular structure** (feature-based modules: Reader, Library, Project, Community, AI)

## Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | Blazor WebAssembly, .NET 10 | GitHub Pages |
| Backend | Cloudflare Workers, TypeScript, [Hono](https://hono.dev) | Cloudflare |
| Database | Cloudflare D1 (SQLite-compatible) | Cloudflare |
| File storage | Cloudflare R2 | Cloudflare |
| API style | REST, JSON, base path `/api/` | — |

Data flow: `User → Blazor WASM (GitHub Pages) → Cloudflare Worker API (/api/*) → D1 / R2`.

## Repository structure

```
lumina-chronica/
  frontend/LuminaChronica.Client/   Blazor WASM app
    Pages/ Components/ Services/ Models/ Layouts/ Styles/ Assets/
  backend/                          Cloudflare Worker API
    src/{routes,services,middleware,models,utils}, index.ts
  database/
    migrations/                     0001_initial.sql, 0002_..., never edited after merge
  shared/                           Cross-stack shared contracts/types (created when something concrete needs it)
  documentation/                    This file, Roadmap, Database docs, Master Project Bible, Technical Standards
  tests/
    frontend/                       bUnit component tests
    backend/                        Vitest tests
  scripts/                          Dev/deploy helper scripts (created when something concrete needs it)
```

Per Technical Standards §5 (binding), this list is authoritative over the Master Project Bible's own repo-structure sketches (Teil 3 §… and the Implementation Blueprint's Phase 0), which are slightly narrower.

## Decisions made where the source docs left a gap

Every decision below follows the project's own priority order (Technical Standards §11 / AI Development Guidelines §85): **Verständlichkeit/Simplicity → Wartbarkeit/Maintainability → Benutzerfreundlichkeit/UX → Performance → Erweiterbarkeit/Extensibility.**

| Area | Decision | Reasoning |
|---|---|---|
| Backend router | [Hono](https://hono.dev) | No router is named in the Master Project Bible. Hono is the standard lightweight, Workers-native router; its built-in `hono/cors` middleware directly handles cross-origin requests between the GitHub Pages frontend and the `workers.dev` backend, including OPTIONS preflight. CORS is configured to allow only the known frontend origin(s), per Technical Standards §7 ("CORS wird restriktiv konfiguriert"). |
| D1 binding | Database `lumina-chronica-db`, Worker binding name `DB` | Not specified anywhere in the source docs; simple conventional name. |
| R2 binding | Bucket `lumina-chronica-storage`, binding name `STORAGE`. Created in Phase 3 (file uploads), not Phase 0/1 — R2 requires a one-time manual enablement in the Cloudflare dashboard that cannot be done via API/CLI. Key layout per Technical Standards §4. | Deferred because it isn't needed yet and needs a manual account step first. |
| Migrations | `database/migrations/0001_initial.sql`, `0002_...` — 4-digit, per Technical Standards §3. Existing migrations are never edited; every schema change is a new file. | Explicit, binding convention; also matches `wrangler d1 migrations`' own default numbering, so no tooling mismatch. |
| API response envelope | Every JSON response: success → `{"success": true, "data": {...}}`; error → `{"success": false, "error": {"code": "...", "message": "..."}}`. Standard HTTP status codes per Technical Standards §2. | Explicit, binding convention (Technical Standards §2) — supersedes the one bare `{"status":"online"}` example in the Implementation Blueprint, which predates this convention. |
| Password hashing | WebCrypto `PBKDF2` via `crypto.subtle`, native to the Workers runtime. | bcrypt/argon2 rely on native modules unavailable in Workers. PBKDF2 is part of the Web Crypto standard library and satisfies "passwords werden ausschließlich gehasht gespeichert" (Technical Standards §7 / Teil 4 §58). Implemented in Phase 2. |
| Auth token | Custom JWT (HS256), matching Teil 4's documented `POST /api/auth/login` response shape. | Teil 3 lists Cloudflare Access as a *preferred option in principle*, but the actually-documented API (Teil 4 §53) is a custom-auth shape returning a bearer token — the concrete, already-specified API takes precedence. Implemented in Phase 2. |
| CSS approach | Plain CSS with CSS custom properties (`--color-*`, `--space-*`) per theme; no CSS framework. | No framework is named anywhere in the source docs. Custom properties work natively with Blazor's CSS isolation and make runtime theme-switching (4 themes) a matter of toggling a root attribute. |
| Spacing scale | 8px grid: `--space-1: 8px` … `--space-8: 64px` (8/16/24/32/48/64). | Technical Standards §1, explicit and binding. |
| Color tokens (exact hex values) | **Not yet decided.** Token *names* exist (Technical Standards §1: Primary/Secondary/Gold Accent/Paper Background/etc. × 4 themes), but no hex values are specified anywhere in the 10 source documents. Placeholder values are used in the Phase 1 theme skeleton; real values will be chosen using the `frontend-design` skill when the actual page layouts are built (not invented blind during scaffolding). | Avoids guessing a brand palette without the visual-design pass it deserves. |
| Icons | Literal Unicode/emoji glyphs matching the Master Project Bible's own nav icon set (🏠 📚 🌎 🌍 📊 👤 ⚙). | No icon library is named anywhere; the source docs use emoji directly. Revisit in V1.5 if this doesn't hold up visually at scale. |
| Testing | bUnit for Blazor components (`tests/frontend/`); Vitest for the Worker (`tests/backend/`). | No framework is named in the docs; these are the standard choice for each respective stack. |
| License | MIT | Not specified; simplest permissive default for a public portfolio repository. |
| CI/CD | GitHub Actions. Frontend build+deploy to GitHub Pages is fully automated (uses the built-in `GITHUB_TOKEN`). Backend `wrangler deploy` workflow exists but requires the repository owner to add a `CLOUDFLARE_API_TOKEN` secret before it can run — that's an account-security action only the owner should perform. Until then, backend deploys are run manually via an already-authenticated local `wrangler` session. | GitHub Actions can't reuse a local OAuth `wrangler` session; CI needs a scoped API token. |
| GitHub Pages + Blazor WASM deploy correctness | `.nojekyll` in the published output (GitHub Pages runs Jekyll by default, which ignores `_`-prefixed folders like Blazor's `_framework/`); `<base href>` is `/` in source (so `dotnet run` works locally) and rewritten to `/lumina-chronica/` by a `sed` step in `frontend-deploy.yml` only in the published output (must match the repo name); `404.html` = a copy of the published `index.html` so client-side routes survive a hard refresh. | None of the source documents mention Blazor+Pages deployment mechanics at all; without these, the deployed app 404s on load or on refresh, or local dev breaks if the subpath were hardcoded into source. |

## Version roadmap conflict

The source docs disagree on the V0.x milestone numbering — see [`Roadmap.md`](Roadmap.md) for the resolution.
