# Contributing to Lumina Chronica

Thanks for your interest in Lumina Chronica. The repository is public, but development direction is maintainer-controlled — quality and project direction take priority over accepting every change.

## Ground rules

- **No larger change without an issue.** Open or find an issue before starting non-trivial work, using the [issue templates](.github/ISSUE_TEMPLATE). This keeps the project's own roadmap/planning process meaningful.
- **Don't change core architecture decisions without discussion.** Blazor WebAssembly, the Cloudflare stack (Workers/D1/R2), the monorepo layout, and the modular structure are settled — see [`documentation/Architecture.md`](documentation/Architecture.md). Propose changes via an issue with the reasoning (why, advantages, disadvantages, impact) before implementing.
- **Follow the coding and API conventions** in [`documentation/Technical-Standards.md`](documentation/Technical-Standards.md).

## Workflow

1. Find or open an issue describing the change.
2. Branch from `main`: `feature/<short-name>` or `bugfix/<short-name>`.
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/)-style prefixes: `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `test: ...`.
4. Open a pull request against `main` using the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Link the issue it closes.
5. Every new feature should update relevant docs (`Architecture.md`, `Database.md`, `CHANGELOG.md`) as part of the same PR.

## Definition of Done

Before requesting review, a change should have:
- [ ] Code implemented and working
- [ ] Tests passing (and added, if behavior changed)
- [ ] Documentation updated
- [ ] No unresolved edge cases left silently unhandled

## Code of Conduct

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
