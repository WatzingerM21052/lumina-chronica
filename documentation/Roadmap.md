# Roadmap

## Version numbering — resolved conflict

The Master Project Bible's own parts disagree on one milestone: the Implementation Blueprint (§91) lists `V0.3 Persönliche Bibliothek`, while Teil 9's GitHub Milestones list (§131) lists `V0.5 Bibliothek MVP` in the same slot. **This project follows Teil 9's numbering**, since Teil 9 is specifically the GitHub process-management document (its whole purpose is defining milestones/labels) and its version-label taxonomy (§129: v0.1, v0.2, v1.0, v1.5, v2.0, v3.0, v4.0, v5.0) is what's actually used for GitHub Milestones and issue labels.

## Milestones

| Milestone | Focus | Scope |
|---|---|---|
| v0.1 | Projektstart | Repository foundation: license, templates, project board, docs (this phase) |
| v0.2 | Technisches Fundament | Frontend/backend/DB scaffolding, first deploy pipeline (**current phase**) |
| v1.0 | Reader Release | Auth, personal library, book upload (EPUB/PDF/TXT/Markdown), reader, reading progress, shelves, tags |
| v1.5 | Personalisierung | Extended themes, bookmarks, better reader, extended statistics |
| v2.0 | Worldbuilding | Projects, worlds, characters, locations, maps, timelines |
| v3.0 | Community | Public profiles/library, following, ratings, comments |
| v4.0 | KI (AI) | Reader AI (summaries, word explanations, Q&A), Creator AI (character ideas, lore, consistency checks) |
| v5.0 | Mobile | Native mobile apps, offline sync, push notifications |

## Phase-gating rule

Per the Execution Blueprint (§112): each phase must be fully complete, tested, and documented before the next phase begins. No sprint is "just preparation" — every sprint should add visible, working value.

## Current phase: v0.2 — Technical Foundation

Definition of Done (Implementation Blueprint §93 / Execution Blueprint §116):
- [ ] Frontend runs (Blazor WASM scaffold, routing, layout, nav, theme engine skeleton)
- [ ] Backend runs (`GET /api/status` responding)
- [ ] Database connected (D1 created, first migration applied)
- [ ] Deployment works (frontend live on GitHub Pages, backend live on Cloudflare Workers, frontend successfully calls backend across origins)

## Next phase preview: v1.0 (not yet planned in detail)

Per the Execution Blueprint's Master Development Flow (§114): Authentication → Library → Reader → Organization → Dashboard → Offline → **v1.0 Release**. Each will be planned in its own pass once v0.2 is verified working, per the phase-gating rule above.
