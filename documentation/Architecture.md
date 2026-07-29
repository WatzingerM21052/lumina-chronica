# Architecture

This document records the technical architecture of Lumina Chronica and — critically — the reasoning behind every decision that isn't already pinned down in the [Master Project Bible](master-project-bible/) or [Technical Standards](Technical-Standards.md). Per the AI Development Guidelines, architecture decisions must be explained, and the six protected decisions below must not be changed without justification (why / advantages / disadvantages / impact).

## Protected architectural decisions

Not to be changed without explicit justification:

- **Blazor WebAssembly** (frontend)
- **Cloudflare architecture** (Workers / D1)
- **Monorepo** (single repository for frontend + backend + docs)
- **D1 database**
- **Modular structure** (feature-based modules: Reader, Library, Project, Community, AI)

**R2 storage is explicitly *not* in this protected list right now** — unlike the Master Project Bible's original assumption, the file-storage backend is an open decision pending Phase 3 (see the table below). Whatever gets chosen there becomes protected once decided.

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
| File storage (books/covers/maps/etc.) | **Open decision, not yet made** — deferred to Phase 3 (Library/file uploads), when it's actually needed. R2 (as originally specified — 10GB free, no egress fees, but requires adding a card to the Cloudflare account and has a documented small verification hold) is one option; Google Drive and Supabase Storage (both card-free, but Drive doesn't scale to multi-user later and Supabase's free tier auto-pauses after 7 days idle) were also evaluated on 2026-07-29. See Roadmap.md's Phase 3 notes. | The user explicitly doesn't want to add a payment method for a hobby project without being sure it's needed — this is exactly the kind of protected-architecture change the AI Dev Guidelines require justifying before deciding, not baking in silently. Revisit when Phase 3 is actually planned. |
| Migrations | `database/migrations/0001_initial.sql`, `0002_...` — 4-digit, per Technical Standards §3. Existing migrations are never edited; every schema change is a new file. | Explicit, binding convention; also matches `wrangler d1 migrations`' own default numbering, so no tooling mismatch. |
| API response envelope | Every JSON response: success → `{"success": true, "data": {...}}`; error → `{"success": false, "error": {"code": "...", "message": "..."}}`. Standard HTTP status codes per Technical Standards §2. | Explicit, binding convention (Technical Standards §2) — supersedes the one bare `{"status":"online"}` example in the Implementation Blueprint, which predates this convention. |
| Password hashing | WebCrypto `PBKDF2-HMAC-SHA256` via `crypto.subtle`, **8,000 iterations**. Stored in the existing `users.password_hash` column as `pbkdf2$<iterations>$<base64url-salt>$<base64url-hash>` (`backend/src/utils/crypto.ts`). | bcrypt/argon2 rely on native modules unavailable in Workers; PBKDF2 is native to `crypto.subtle`. The iteration count was **benchmarked against the real Workers runtime** (`wrangler dev --local`, same workerd engine as production): 50,000 iterations already takes ~33ms, over 3x the Workers Free plan's 10ms CPU-time-per-request budget (exceeding it fails the request outright, error 1102). 8,000 iterations leaves solid headroom. This is below current OWASP guidance (600,000) for PBKDF2-HMAC-SHA256 — a deliberate, documented tradeoff for staying on the free Workers plan, confirmed with the user (2026-07-29): stay free with weaker hashing rather than move to Workers Paid ($5/mo) for stronger hashing. Revisit only if the project ever moves to a paid plan. Encoding the algorithm/iterations/salt into the existing TEXT column avoided a migration and makes future per-row iteration bumps possible without a global rehash. |
| Auth token | Custom JWT (HS256), implemented directly with `crypto.subtle.sign`/`.verify` (no `jsonwebtoken`/`jose` dependency — the payload is 3 fields). Claims: `{ sub, role, iat, exp }`. Expiry: **7 days**, no refresh-token flow. Secret: `JWT_SECRET`, set via `wrangler secret put` (never committed, not in `wrangler.toml`) — must be re-set if the Worker is ever recreated. | Teil 3 lists Cloudflare Access as a *preferred option in principle*, but the actually-documented API (Teil 4 §53) is a custom-auth shape returning a bearer token — the concrete, already-specified API takes precedence. Implemented in Phase 2 (PR #33). |
| Token storage (frontend) | `localStorage`, key `lumina_auth_token`, via a `TokenStore`/JS-module wrapper (`wwwroot/js/auth.js`) mirroring `ThemeService`'s pattern. Attached to requests via a `DelegatingHandler` (`AuthHeaderHandler`); a custom `AuthenticationStateProvider` (`LuminaAuthStateProvider`) decodes the JWT payload client-side (signature already verified server-side) to drive `<AuthorizeView>`/`[Authorize]`. | Simplest option, matches the existing plain-`HttpClient` `ApiClient`. Cross-origin HttpOnly cookies would need `SameSite=None; Secure` + `credentials:"include"` on every request for no clear benefit here. **Tradeoff**: localStorage is readable by any script on the page, so an XSS bug would leak the token — mitigated for now by the app rendering no untrusted user-generated HTML anywhere. Revisit if/when rich-text content (comments, community features) is added in v3.0. Implemented in Phase 2 (PR #35). |
| Auth middleware / endpoint auth rules | `backend/src/middleware/auth.ts`'s `requireAuth`, applied per-route (not globally). Public: `POST /api/auth/register`, `POST /api/auth/login`. Auth required: `POST /api/auth/logout`, `GET/PUT /api/users/me`. No role-gated endpoints yet — `USER`/`ADMIN` is carried in the token for future use, but nothing in the app currently has an admin-only surface. | Resolves Open Question #19 (no endpoint-level auth table in the source docs) for Phase 2's routes specifically. Each future phase should document its own routes' auth requirement here rather than relying on one blanket rule, since e.g. Library's `GET /api/books` will likely need public/private distinctions per resource, not a blanket rule. |
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
