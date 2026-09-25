# Konto-löschen + OAuth-Verknüpfung — Design

Two of the three "Profile functions" from `documentation/Roadmap.md` (avatar upload already shipped in PR #463). Both build directly on existing, already-defensive schema/code rather than introducing new patterns.

## 1. Account deletion (soft-delete + restore)

### Why not just set `deleted_at`

`users.username` and `users.email` are `UNIQUE` at the table level (`0001_initial.sql`), and that constraint is **not** scoped to `deleted_at IS NULL`. Every read path already filters `deleted_at IS NULL` defensively (confirmed via grep across `authService`, `bookService`, `discoverService`, `oauthService`, `followService`, `bookSharingService`, `projectService`, `userService`), so a bare `deleted_at` flip already makes the account fully invisible/unusable everywhere. But it would permanently lock the username/email — nobody, including the original owner, could ever reuse them.

Changing the `UNIQUE` constraint itself would require rebuilding the `users` table (SQLite has no `ALTER TABLE ... DROP CONSTRAINT`), which `0005_oauth.sql`'s own comment documents as broken against real D1 (`FOREIGN KEY constraint error` on `DROP TABLE`, confirmed via a live `wrangler d1 migrations apply --remote` attempt). `users` has several incoming FKs (`oauth_identities`, `user_settings`, `books.owner_id`, etc.), so this repo already knows table-rebuild is unsafe for this specific table. **Avoid it entirely.**

### Design: anonymize + snapshot for restore

New migration `0023_account_deletion.sql`:

```sql
ALTER TABLE users ADD COLUMN deleted_username TEXT;
ALTER TABLE users ADD COLUMN deleted_email TEXT;
```

On delete (`DELETE /api/users/me`, `requireAuth`):

1. Look up the caller's row; 404 if already deleted.
2. If `password_hash` is a real hash (not `OAUTH_NO_PASSWORD_SENTINEL`), require `currentPassword` in the body and verify it — same pattern `updateUserProfile` already uses for password changes. OAuth-only accounts skip this (no password exists to check; being authenticated is the only available proof, consistent with how such accounts are already treated elsewhere).
3. `UPDATE users SET deleted_username = username, deleted_email = email, username = 'deleted-user-' || id, email = 'deleted-' || id || '@deleted.invalid', avatar_key = NULL, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`.
4. Best-effort delete the R2 avatar object (mirrors `updateUserAvatar`'s existing cleanup-on-replace pattern) — failure logs, doesn't block the response.
5. `204 No Content`. Frontend clears the stored JWT client-side (same as `LogoutAsync`) and navigates home.

The live `username`/`email` columns are immediately free — no UNIQUE conflict, no table rebuild.

### Restore is explicit, not silent — `DELETED_ACCOUNT_FOUND`

Registering with an email that matches a soft-deleted account's `deleted_email` must **not** silently restore (a user who deliberately wants a fresh, unrelated account with that same email needs that path to keep working — see below), and must **not** silently fail with the normal `EmailTakenError` either (the live `email` column is free — no DB conflict actually exists). Instead:

In `authService.registerUser`, before the existing `emailTaken` check, look for a match:

```sql
SELECT id FROM users WHERE deleted_email = ? AND deleted_at IS NOT NULL
```

- **Match found, and the request has no `confirmNewAccount: true` flag:** abort with a new `DeletedAccountFoundError` → route layer returns `409 { code: "DELETED_ACCOUNT_FOUND", message: "..." }`. Nothing is created or changed. The frontend catches this specific code and shows a two-button choice instead of the generic error banner.
- **Match found, and `confirmNewAccount: true` is set:** the user explicitly chose "neuen Account erstellen" despite the match — proceed with the existing fresh-insert path unchanged, using the submitted email live. The old deleted row's `deleted_email` snapshot is left completely untouched, so it stays independently restorable later (restoring it later will itself fail with the ordinary `EmailTakenError` if *this* new account still currently holds that email live at that time — an unavoidable, ordinary uniqueness conflict, not a special case).
- **No match:** existing path, unchanged.

New endpoint `POST /api/auth/restore` (`{ email, username, password }`, no auth required — same trust level as `/register`, see trade-off below): re-runs the `deleted_email` lookup; 404 if no match (already restored / never existed / raced). On match, validate the submitted `username` isn't taken by a different *active* user (existing `usernameTaken` check works as-is, since the live column no longer holds the deleted account's old value) and that the live `email` isn't currently held by a different active account (ordinary `EmailTakenError` if so). `UPDATE` the matched row: `username`, `email` set to the submitted values, new `password_hash`, `deleted_at = NULL`, `deleted_username = NULL`, `deleted_email = NULL`. Same user `id` throughout, so every FK'd row (books, projects, comments, ratings, follows, `oauth_identities`, `user_settings`) reattaches automatically. Returns the normal `AuthResult` (fresh JWT).

**Known trade-off (flagged, not solved here):** this app has no email-ownership verification at registration today — anyone can register with any unclaimed email. Restoring via `/api/auth/restore` carries the identical trust level. No expiry/grace-period on restorability in v1 (no cron infra exists yet; add later if ever needed — YAGNI for now). Row count stays exactly one per original account forever, regardless of how many delete/restore cycles happen — everything above is an `UPDATE` on the same row, never an insert of a new tracking row.

### Frontend

**`Register.razor`:** on a `409 DELETED_ACCOUNT_FOUND` response, replace the normal error banner with a two-button choice: "Alten Account wiederherstellen" (calls `POST /api/auth/restore` with the same form values) or "Neuen Account erstellen" (resubmits `POST /api/auth/register` with `confirmNewAccount: true` added).

**`Profile.razor`:** new "Konto löschen" section at the bottom, styled as a danger zone. For accounts with a real password: a password field + "Konto endgültig löschen" button, disabled until the field is filled. For OAuth-only accounts: just the button. A second confirmation step (simple inline "Bist du sicher? Ja, endgültig löschen" toggle, not a new Modal component — this codebase doesn't have one yet and it's out of scope to add one here) before the call fires. On success: clear auth state, redirect to `/`.

---

## 2. OAuth account linking

Builds on the existing `oauth_identities` table (`0005_oauth.sql`), which already supports multiple identities per user — nothing there needs to change.

### Schema

New migration `0024_oauth_linking.sql`:

```sql
ALTER TABLE oauth_states ADD COLUMN linking_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
```

Nullable: `NULL` = a normal login-flow state row (today's only case), set = a link-flow state row for that already-authenticated user.

### Starting a link (authenticated, unlike login's `/start`)

New route `GET /api/auth/oauth/:provider/link/start` (`requireAuth`). Unlike the existing `/oauth/:provider/start` (which does a bare 302 for an anonymous browser navigation), this must carry the caller's Bearer token, so it can't be a plain redirect target — the frontend calls it via the authenticated `ApiClient`, gets back `{ redirectUrl }` as JSON (200), then does `NavigationManager.NavigateTo(redirectUrl, forceLoad: true)` itself to leave the SPA. `startOAuth(...)` gains an optional `linkingUserId` param, stored on the `oauth_states` row.

### Callback branches on `linking_user_id`

`completeOAuthCallback` reads the deleted state row. If `linking_user_id` is set:

- Identity already linked to *this* user → no-op success (idempotent).
- Identity already linked to a *different* user → `OAuthAlreadyLinkedError`.
- Otherwise → `INSERT INTO oauth_identities (user_id=linking_user_id, provider, provider_user_id, email)`.

No JWT is issued for a link (the caller already has one) — the route layer redirects to `${FRONTEND_URL}/profile?linked=<provider>` on success or `${FRONTEND_URL}/profile?linkError=<reason>` on failure, instead of building an exchange code. The existing login branch (`linking_user_id IS NULL`) is untouched.

### Managing links

- `GET /api/auth/oauth/linked` (`requireAuth`) → `[{ provider, email, linkedAt }]`, for the Profile page's "Verknüpfte Konten" list.
- `DELETE /api/auth/oauth/:provider` (`requireAuth`) → unlink. Rejects with 409 if this would leave the account with no way to log in (`password_hash` is still the OAuth sentinel **and** this is the only remaining `oauth_identities` row) — otherwise deletes the row, `204`.

### Frontend (`Profile.razor`)

New "Verknüpfte Konten" section: fetches `/api/auth/oauth/linked` on load; for each of Google/GitHub, shows either "Verknüpft (email) — Entfernen" or "Mit Google/GitHub verknüpfen" (button → `link/start` → navigate). On mount, also parses `?linked=`/`?linkError=` from the URL (same manual query-parsing pattern `OAuthCallback.razor` already uses) to show a one-time success/error banner, then strips those params via `NavigateTo(..., replace: true)`.

---

## Testing

Backend: unit tests for `userService.deleteUser`, the restore branch of `authService.registerUser`, `oauthService`'s link/unlink paths, plus route-level tests for the five new/changed endpoints (`DELETE /api/users/me`, `GET/DELETE /api/auth/oauth/...`, `GET /api/auth/oauth/:provider/link/start`, callback's link branch) — mirrors existing coverage style (`tests/backend/fakeD1.ts`). Frontend: existing Blazor test patterns for the two new `Profile.razor` sections.

## Out of scope (this pass)

- Time-boxed restore window / cleanup cron.
- A general-purpose Modal component (delete confirmation stays inline).
- The three separately-tracked profile backlog items (avatar upload UX, followers/following click-through, activity-log rating-visibility bug) — unrelated, tracked separately.
