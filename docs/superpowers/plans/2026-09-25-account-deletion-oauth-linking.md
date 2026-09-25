# Account Deletion + OAuth Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service account deletion (with anonymize + explicit restore-by-email) and OAuth provider linking/unlinking to Lumina Chronica — the remaining two of the three "Profile functions" from `documentation/Roadmap.md` (avatar upload already shipped in PR #463).

**Architecture:** Backend is a Hono app on Cloudflare Workers + D1 (`backend/src`); frontend is Blazor WASM (`frontend/LuminaChronica.Client`). Both features extend existing services/routes rather than introducing new files — `userService.ts`/`routes/users.ts` for deletion, `authService.ts`/`oauthService.ts`/`routes/auth.ts` for restore + linking, `Profile.razor`/`Register.razor` on the frontend.

**Tech Stack:** TypeScript (Hono, D1), Vitest (`tests/backend`, fake D1/R2), Blazor WASM (C#), bUnit (`tests/frontend`).

## Global Constraints

- Never edit an already-merged migration file — every schema change is a new file in `database/migrations/`, sequential 4-digit prefix (Technical-Standards.md §3). Next two are `0023_account_deletion.sql`, `0024_oauth_linking.sql`.
- Do not rebuild/rename the `users` table (`ALTER TABLE ... ADD COLUMN` only) — `0005_oauth.sql`'s own comment documents this as broken against real D1 due to `users`' incoming foreign keys.
- API responses always use the `{ success, data }` / `{ success: false, error: { code, message } }` envelope (Technical-Standards.md §2) — this plan intentionally has `DELETE /api/users/me` and `DELETE /api/auth/oauth/:provider` return `200 { success: true, data: null }` rather than bare `204`, specifically so a failure (wrong password / unlink-blocked) can carry a real error message through the same envelope, and so the existing bUnit `FakeHttpMessageHandler` (which always returns HTTP 200 with a canned JSON body, never a bare 204) can exercise both outcomes.
- Design source of truth: `docs/superpowers/specs/2026-09-25-account-deletion-oauth-linking-design.md`.

---

## Part 1 — Account Deletion (backend)

### Task 1: Migration + `DELETE /api/users/me`

**Files:**
- Create: `database/migrations/0023_account_deletion.sql`
- Modify: `backend/src/services/userService.ts` (add `deleteUser`)
- Modify: `backend/src/routes/users.ts` (add `DELETE /me`, import `deleteUser`)
- Test: `tests/backend/users.test.ts` (add `describe("DELETE /api/users/me", ...)`)

**Interfaces:**
- Produces: `userService.deleteUser(db: D1Database, storage: R2Bucket, userId: number, currentPassword?: string): Promise<void>` — throws `InvalidPasswordError` (already exported from `userService.ts`) if the account has a real password and `currentPassword` doesn't verify.

- [ ] **Step 1: Write the migration**

```sql
-- 0023_account_deletion.sql
-- Account deletion (Roadmap "Profile functions", 2nd of 3 -- avatar upload
-- was #463). users.username/email are UNIQUE table-wide, not scoped to
-- deleted_at (0001_initial.sql), and rebuilding the users table to change
-- that is documented as broken against real D1 in 0005_oauth.sql's own
-- comment (FOREIGN KEY constraint error on DROP TABLE -- users has several
-- incoming FKs). So instead of touching the constraint: on delete, the
-- live username/email get overwritten with a generated placeholder (freeing
-- them immediately, zero constraint risk), and the ORIGINAL values move into
-- these two new columns so a later registration with the same email can
-- find and restore this exact row (see authService.ts's registerUser /
-- restoreUser). Restored accounts clear these back to NULL.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE users ADD COLUMN deleted_username TEXT;
ALTER TABLE users ADD COLUMN deleted_email TEXT;
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/backend/users.test.ts` (after the existing `describe("GET /api/users/:username/avatar", ...)` block):

```ts
describe("DELETE /api/users/me", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/me", { method: "DELETE" }, env);
        expect(res.status).toBe(401);
    });

    it("rejects a missing/wrong current password for a password-based account", async () => {
        const res = await app.request(
            "/api/users/me",
            jsonRequest("DELETE", { currentPassword: "wrong password" }, token),
            env
        );
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_PASSWORD");

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect(meRes.status).toBe(200);
    });

    it("soft-deletes the account, frees the username/email, and blocks further login", async () => {
        const res = await app.request(
            "/api/users/me",
            jsonRequest("DELETE", { currentPassword: "correct horse" }, token),
            env
        );
        expect(res.status).toBe(200);
        expect((await readJson(res)).success).toBe(true);

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect(meRes.status).toBe(404);

        const loginRes = await app.request(
            "/api/auth/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: "alice@example.com", password: "correct horse" }),
            },
            env
        );
        expect(loginRes.status).toBe(401);

        // Username/email are freed for a brand new registration.
        const reRegisterRes = await app.request(
            "/api/auth/register",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "alice", email: "someone-else@example.com", password: "another password" }),
            },
            env
        );
        expect(reRegisterRes.status).toBe(201);
    });

    it("deletes the R2 avatar object on account deletion", async () => {
        const form = new FormData();
        form.set("avatar", new File(["avatar bytes"], "avatar.jpg", { type: "image/jpeg" }));
        await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form }, env);

        await app.request("/api/users/me", jsonRequest("DELETE", { currentPassword: "correct horse" }, token), env);

        const getRes = await app.request("/api/users/alice/avatar", {}, env);
        expect(getRes.status).toBe(404);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run users.test.ts`
Expected: FAIL — `DELETE /api/users/me` doesn't exist yet (404s), and `deleted_username`/`deleted_email` columns don't exist yet.

- [ ] **Step 4: Implement `userService.deleteUser`**

In `backend/src/services/userService.ts`, change the crypto import at the top:

```ts
import { OAUTH_NO_PASSWORD_SENTINEL, hashPassword, verifyPassword } from "../utils/crypto";
```

Then append this function at the end of the file:

```ts
// Soft-delete: frees username/email immediately (see 0023_account_deletion.sql
// for why this is an anonymize-in-place rather than a real row delete or a
// UNIQUE constraint change) rather than a hard delete -- every read path in
// this codebase already filters `deleted_at IS NULL`, so this alone makes
// the account fully invisible/unusable everywhere without touching a single
// other table. currentPassword is required and verified for accounts with a
// real password; OAuth-only accounts (OAUTH_NO_PASSWORD_SENTINEL) have
// nothing to verify it against, so authentication alone is the proof there,
// same asymmetry updateUserProfile already has for password changes.
export async function deleteUser(db: D1Database, storage: R2Bucket, userId: number, currentPassword?: string): Promise<void> {
    const row = await db
        .prepare("SELECT username, email, password_hash, avatar_key FROM users WHERE id = ? AND deleted_at IS NULL")
        .bind(userId)
        .first<{ username: string; email: string; password_hash: string; avatar_key: string | null }>();
    if (!row) throw new Error("User disappeared during account deletion.");

    if (row.password_hash !== OAUTH_NO_PASSWORD_SENTINEL) {
        if (!currentPassword || !(await verifyPassword(currentPassword, row.password_hash))) {
            throw new InvalidPasswordError();
        }
    }

    await db
        .prepare(
            `UPDATE users SET deleted_username = username, deleted_email = email,
             username = 'deleted-user-' || id, email = 'deleted-' || id || '@deleted.invalid',
             avatar_key = NULL, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
        )
        .bind(userId)
        .run();

    if (row.avatar_key) {
        await storage.delete(row.avatar_key).catch((err) => {
            console.error(`Failed to delete R2 avatar ${row.avatar_key} for deleted user ${userId}:`, err);
        });
    }
}
```

- [ ] **Step 5: Add the route**

In `backend/src/routes/users.ts`, add `deleteUser` to the existing import from `../services/userService`:

```ts
import {
    EmailTakenError,
    InvalidPasswordError,
    UsernameTakenError,
    ValidationError,
    deleteUser,
    getUserAvatarObject,
    getUserProfile,
    updateUserAvatar,
    updateUserProfile,
} from "../services/userService";
```

Then add this route after the existing `usersRoute.put("/me", ...)` handler:

```ts
// 200 { data: null } rather than a bare 204 -- see the plan's Global
// Constraints for why (failure needs to carry INVALID_PASSWORD through the
// same envelope).
usersRoute.delete("/me", requireAuth, async (c) => {
    const body = await c.req.json<{ currentPassword?: string }>().catch(() => ({}) as { currentPassword?: string });
    try {
        await deleteUser(c.env.DB, c.env.STORAGE, c.get("userId"), body.currentPassword);
        return c.json(success(null));
    } catch (err) {
        if (err instanceof InvalidPasswordError) return c.json(failure("INVALID_PASSWORD", "Current password is incorrect."), 400);
        throw err;
    }
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run users.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/0023_account_deletion.sql backend/src/services/userService.ts backend/src/routes/users.ts tests/backend/users.test.ts
git commit -m "feat: add DELETE /api/users/me (account deletion)"
```

---

### Task 2: Registration gate — `DELETED_ACCOUNT_FOUND`

**Files:**
- Modify: `backend/src/services/authService.ts` (add `DeletedAccountFoundError`, gate `registerUser`)
- Modify: `backend/src/routes/auth.ts` (accept `confirmNewAccount`, map the new error)
- Test: `tests/backend/auth.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `authService.DeletedAccountFoundError` (exported class). `registerUser`'s input type gains an optional `confirmNewAccount?: boolean`. Task 3 (`restoreUser`) and Task 6 (frontend) depend on this error's existence and the `confirmNewAccount` field name.

- [ ] **Step 1: Write the failing tests**

Add to `tests/backend/auth.test.ts` (check the existing file for its `jsonRequest` helper and reuse it; add a new `describe` block):

```ts
describe("POST /api/auth/register against a deleted account's email", () => {
    async function registerAndDelete(email: string): Promise<void> {
        const registerRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "original", email, password: "correct horse" }),
            env
        );
        const token = (await readJson(registerRes)).data.token;
        await app.request(
            "/api/users/me",
            {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword: "correct horse" }),
            },
            env
        );
    }

    it("returns 409 DELETED_ACCOUNT_FOUND instead of creating or restoring", async () => {
        await registerAndDelete("deleted@example.com");

        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "newname", email: "deleted@example.com", password: "a new password" }),
            env
        );
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("DELETED_ACCOUNT_FOUND");

        const stillFree = await env.DB.prepare("SELECT id FROM users WHERE email = 'deleted@example.com' AND deleted_at IS NULL").first();
        expect(stillFree).toBeNull();
    });

    it("creates a brand new, independent account when confirmNewAccount is true", async () => {
        await registerAndDelete("deleted2@example.com");

        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "brandnew", email: "deleted2@example.com", password: "a new password", confirmNewAccount: true }),
            env
        );
        expect(res.status).toBe(201);

        const users = await env.DB.prepare("SELECT id FROM users WHERE email = 'deleted2@example.com'").all();
        expect(users.results).toHaveLength(1);
    });

    it("registers normally when there is no matching deleted account", async () => {
        const res = await app.request(
            "/api/auth/register",
            jsonRequest({ username: "freshuser", email: "never-deleted@example.com", password: "a new password" }),
            env
        );
        expect(res.status).toBe(201);
    });
});
```

If `tests/backend/auth.test.ts` has no local `jsonRequest` helper matching `(body) => RequestInit` for JSON POSTs, check its existing tests for the exact helper name/shape used there (e.g. it may inline `{ method: "POST", headers: {...}, body: JSON.stringify(...) }` per call) and match that file's existing style instead of assuming.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run auth.test.ts`
Expected: FAIL — registering against a deleted account's email currently just succeeds as a normal fresh registration (no gate exists yet).

- [ ] **Step 3: Implement the gate in `authService.ts`**

In `backend/src/services/authService.ts`, add the new error class next to the existing ones:

```ts
export class DeletedAccountFoundError extends Error {}
```

Change `registerUser`'s signature and add the gate as the very first check:

```ts
export async function registerUser(
    db: D1Database,
    jwtSecret: string,
    input: { username: string; email: string; password: string; confirmNewAccount?: boolean }
): Promise<AuthResult> {
    if (!input.confirmNewAccount) {
        const deletedMatch = await db
            .prepare("SELECT id FROM users WHERE deleted_email = ? AND deleted_at IS NOT NULL")
            .bind(input.email)
            .first();
        if (deletedMatch) throw new DeletedAccountFoundError();
    }

    const [emailTaken, usernameTaken] = await Promise.all([
        db.prepare("SELECT id FROM users WHERE email = ?").bind(input.email).first(),
        db.prepare("SELECT id FROM users WHERE username = ?").bind(input.username).first(),
    ]);
    if (emailTaken) throw new EmailTakenError();
    if (usernameTaken) throw new UsernameTakenError();

    // ... rest of the function is unchanged
```

- [ ] **Step 4: Wire it into the route**

In `backend/src/routes/auth.ts`, add `DeletedAccountFoundError` to the existing import from `../services/authService`:

```ts
import {
    DeletedAccountFoundError,
    EmailTakenError,
    InvalidCredentialsError,
    UsernameTakenError,
    loginUser,
    registerUser,
} from "../services/authService";
```

Update the `/register` handler's body type and destructuring:

```ts
const body = await c.req.json<{ username?: string; email?: string; password?: string; confirmNewAccount?: boolean }>().catch(() => null);
const { username, email, password, confirmNewAccount } = body ?? {};
```

Update the call and its `catch`:

```ts
    try {
        const result = await registerUser(c.env.DB, c.env.JWT_SECRET, { username, email, password, confirmNewAccount });
        return c.json(success(result), 201);
    } catch (err) {
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        if (err instanceof DeletedAccountFoundError) {
            return c.json(failure("DELETED_ACCOUNT_FOUND", "A deleted account exists with this email. Restore it, or confirm you want a new one."), 409);
        }
        throw err;
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/authService.ts backend/src/routes/auth.ts tests/backend/auth.test.ts
git commit -m "feat: gate registration on a matching deleted account's email"
```

---

### Task 3: `POST /api/auth/restore`

**Files:**
- Modify: `backend/src/services/authService.ts` (add `NoDeletedAccountError`, `restoreUser`)
- Modify: `backend/src/routes/auth.ts` (add the route)
- Test: `tests/backend/auth.test.ts`

**Interfaces:**
- Consumes: `DeletedAccountFoundError` pattern from Task 2 (same `deleted_email` lookup).
- Produces: `authService.restoreUser(db, jwtSecret, input: { username: string; email: string; password: string }): Promise<AuthResult>`, throws `NoDeletedAccountError | UsernameTakenError | EmailTakenError`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/backend/auth.test.ts`:

```ts
describe("POST /api/auth/restore", () => {
    async function registerAndDelete(username: string, email: string): Promise<number> {
        const registerRes = await app.request(
            "/api/auth/register",
            jsonRequest({ username, email, password: "correct horse" }),
            env
        );
        const { token, userId } = (await readJson(registerRes)).data;
        await app.request(
            "/api/users/me",
            {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ currentPassword: "correct horse" }),
            },
            env
        );
        return userId;
    }

    it("returns 404 when there is no deleted account for this email", async () => {
        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "whoever", email: "never-existed@example.com", password: "a new password" }),
            env
        );
        expect(res.status).toBe(404);
    });

    it("restores the same account id, reattaching its prior content, with a fresh password", async () => {
        const originalId = await registerAndDelete("original", "restore-me@example.com");

        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "reclaimed", email: "restore-me@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.userId).toBe(originalId);

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${json.data.token}` } }, env);
        const me = await readJson(meRes);
        expect(me.data.id).toBe(originalId);
        expect(me.data.username).toBe("reclaimed");
        expect(me.data.email).toBe("restore-me@example.com");

        const loginRes = await app.request(
            "/api/auth/login",
            jsonRequest({ identifier: "restore-me@example.com", password: "a fresh password" }),
            env
        );
        expect(loginRes.status).toBe(200);
    });

    it("rejects a restore username already taken by a different active user", async () => {
        await registerAndDelete("original2", "restore-me2@example.com");
        await app.request("/api/auth/register", jsonRequest({ username: "taken", email: "someone@example.com", password: "correct horse" }), env);

        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "taken", email: "restore-me2@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("USERNAME_TAKEN");
    });

    it("stays possible after a different, brand new account claimed the same email (confirmNewAccount path)", async () => {
        const originalId = await registerAndDelete("original3", "restore-me3@example.com");
        await app.request(
            "/api/auth/register",
            jsonRequest({ username: "interim", email: "restore-me3@example.com", password: "correct horse", confirmNewAccount: true }),
            env
        );

        // The email is now live on the interim account -- restoring the
        // original must fail with the ordinary EmailTakenError, not a crash
        // or a silent overwrite.
        const res = await app.request(
            "/api/auth/restore",
            jsonRequest({ username: "reclaimed3", email: "restore-me3@example.com", password: "a fresh password" }),
            env
        );
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("EMAIL_TAKEN");

        const original = await env.DB.prepare("SELECT deleted_at FROM users WHERE id = ?").bind(originalId).first<{ deleted_at: string | null }>();
        expect(original!.deleted_at).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run auth.test.ts`
Expected: FAIL — `/api/auth/restore` doesn't exist yet (404s on every case).

- [ ] **Step 3: Implement `restoreUser`**

In `backend/src/services/authService.ts`, add the error class and the function:

```ts
export class NoDeletedAccountError extends Error {}

export async function restoreUser(
    db: D1Database,
    jwtSecret: string,
    input: { username: string; email: string; password: string }
): Promise<AuthResult> {
    const deletedMatch = await db
        .prepare("SELECT id, role_id FROM users WHERE deleted_email = ? AND deleted_at IS NOT NULL")
        .bind(input.email)
        .first<{ id: number; role_id: number }>();
    if (!deletedMatch) throw new NoDeletedAccountError();

    const usernameTaken = await db
        .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
        .bind(input.username, deletedMatch.id)
        .first();
    if (usernameTaken) throw new UsernameTakenError();

    // The live email column is free unless some OTHER account has since
    // claimed it live (e.g. via registerUser's confirmNewAccount path) --
    // an ordinary uniqueness conflict, not special-cased.
    const emailTaken = await db
        .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
        .bind(input.email, deletedMatch.id)
        .first();
    if (emailTaken) throw new EmailTakenError();

    const passwordHash = await hashPassword(input.password);
    await db
        .prepare(
            `UPDATE users SET username = ?, email = ?, password_hash = ?,
             deleted_username = NULL, deleted_email = NULL, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
        )
        .bind(input.username, input.email, passwordHash, deletedMatch.id)
        .run();

    const role = await roleName(db, deletedMatch.role_id);
    const token = await signJwt({ sub: deletedMatch.id, role }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId: deletedMatch.id };
}
```

- [ ] **Step 4: Add the route**

In `backend/src/routes/auth.ts`, add `NoDeletedAccountError` and `restoreUser` to the existing import:

```ts
import {
    DeletedAccountFoundError,
    EmailTakenError,
    InvalidCredentialsError,
    NoDeletedAccountError,
    UsernameTakenError,
    loginUser,
    registerUser,
    restoreUser,
} from "../services/authService";
```

Add the route right after the existing `authRoute.post("/register", ...)` handler — it reuses the same `"register"` rate-limit bucket (same abuse shape: how many account creations/reactivations a source can attempt) and the same validation constants already defined at the top of the file (`EMAIL_PATTERN`, `MIN_PASSWORD_LENGTH`):

```ts
authRoute.post("/restore", async (c) => {
    let rateLimit;
    try {
        rateLimit = await assertNotRateLimited(c, "register", "");
    } catch (err) {
        if (err instanceof RateLimitedError) return rateLimitedResponse(c, err);
        throw err;
    }

    const body = await c.req.json<{ username?: string; email?: string; password?: string }>().catch(() => null);
    const { username, email, password } = body ?? {};

    await recordFailedAttempt(c.env.DB, "register", rateLimit.ip, "");

    if (!username || !email || !password) {
        return c.json(failure("VALIDATION_ERROR", "username, email, and password are required."), 400);
    }
    if (!EMAIL_PATTERN.test(email)) {
        return c.json(failure("VALIDATION_ERROR", "email is not a valid address."), 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return c.json(failure("VALIDATION_ERROR", `password must be at least ${MIN_PASSWORD_LENGTH} characters.`), 400);
    }

    try {
        const result = await restoreUser(c.env.DB, c.env.JWT_SECRET, { username, email, password });
        return c.json(success(result), 200);
    } catch (err) {
        if (err instanceof NoDeletedAccountError) return c.json(failure("NOT_FOUND", "No deleted account found for this email."), 404);
        if (err instanceof EmailTakenError) return c.json(failure("EMAIL_TAKEN", "This email is already registered."), 409);
        if (err instanceof UsernameTakenError) return c.json(failure("USERNAME_TAKEN", "This username is already taken."), 409);
        throw err;
    }
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run auth.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `cd tests/backend && npx vitest run`
Expected: PASS (nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/authService.ts backend/src/routes/auth.ts tests/backend/auth.test.ts
git commit -m "feat: add POST /api/auth/restore for deleted-account reactivation"
```

---

## Part 2 — Account Deletion (frontend)

### Task 4: Frontend plumbing — `ApiClient.DeleteAsync<TRequest,TResponse>` + models

**Files:**
- Modify: `frontend/LuminaChronica.Client/Services/ApiClient.cs`
- Modify: `frontend/LuminaChronica.Client/Models/Auth.cs`
- Test: `tests/frontend/ApiClientTests.cs` (check whether this file exists first — if not, check `tests/frontend/*.cs` for the closest existing `ApiClient` method test and match its file/pattern instead of creating a new one from scratch)

**Interfaces:**
- Produces: `ApiClient.DeleteAsync<TRequest, TResponse>(string relativeUrl, TRequest body, CancellationToken)` → `Task<ApiResponse<TResponse>?>`. `Models.DeleteAccountRequest { string? CurrentPassword }`. `Models.RestoreAccountRequest { string Username, string Email, string Password }`. `RegisterRequest` gains `bool? ConfirmNewAccount`.

- [ ] **Step 1: Find the existing ApiClient test pattern**

Run: `grep -rl "PutAsync<" tests/frontend/*.cs` and open whichever file it finds to see how an existing generic `ApiClient` method is unit-tested (if any dedicated `ApiClient` test file exists). If none exists, skip straight to Step 2 — this plumbing will be exercised indirectly through Task 5/6's page-level bUnit tests instead, matching how `PutAsync<TRequest,TResponse>` etc. have no dedicated unit test today either.

- [ ] **Step 2: Add the models**

In `frontend/LuminaChronica.Client/Models/Auth.cs`, add `ConfirmNewAccount` to the existing `RegisterRequest` class:

```csharp
public class RegisterRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;

    [JsonPropertyName("confirmNewAccount")]
    public bool? ConfirmNewAccount { get; set; }
}
```

Then append these two new classes to the same file:

```csharp
// Posted to DELETE /api/users/me. CurrentPassword is required by the
// backend for accounts with a real password, and ignored for OAuth-only
// accounts -- see backend/src/services/userService.ts's deleteUser.
public class DeleteAccountRequest
{
    [JsonPropertyName("currentPassword")]
    public string? CurrentPassword { get; set; }
}

// Posted to POST /api/auth/restore, shown after a 409 DELETED_ACCOUNT_FOUND
// from /api/auth/register.
public class RestoreAccountRequest
{
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}
```

- [ ] **Step 3: Add `ApiClient.DeleteAsync<TRequest, TResponse>`**

In `frontend/LuminaChronica.Client/Services/ApiClient.cs`, add this method right after the existing `PutAsync<TRequest, TResponse>` method:

```csharp
    // For a DELETE with a JSON body where both outcomes carry a real
    // ApiResponse envelope (e.g. account deletion's wrong-password case) --
    // mirrors PutAsync<TRequest,TResponse> exactly, just with HttpMethod.Delete
    // via SendAsync since HttpClient has no DeleteAsJsonAsync helper.
    public async Task<ApiResponse<TResponse>?> DeleteAsync<TRequest, TResponse>(
        string relativeUrl, TRequest body, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, relativeUrl) { Content = JsonContent.Create(body) };
            var response = await httpClient.SendAsync(request, cancellationToken);
            return await response.Content.ReadFromJsonAsync<ApiResponse<TResponse>>(cancellationToken: cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            return new ApiResponse<TResponse>
            {
                Success = false,
                Error = new ApiError { Code = "NETWORK_ERROR", Message = ex.Message }
            };
        }
    }
```

- [ ] **Step 4: Build to verify it compiles**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj`
Expected: Build succeeded, no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/Services/ApiClient.cs frontend/LuminaChronica.Client/Models/Auth.cs
git commit -m "feat(frontend): add ApiClient.DeleteAsync<TRequest,TResponse> and account-deletion/restore models"
```

---

### Task 5: `Profile.razor` — "Konto löschen"

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Profile.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/Profile.razor.css`
- Test: `tests/frontend/ProfilePageTests.cs`

**Interfaces:**
- Consumes: `ApiClient.DeleteAsync<DeleteAccountRequest, object>` from Task 4.

- [ ] **Step 1: Read the existing `ProfilePageTests.cs` setup**

Open `tests/frontend/ProfilePageTests.cs` and note exactly how it registers services / builds the fake handler and authenticated context for `Profile.razor` (it needs an authenticated `LuminaAuthStateProvider`, unlike `RegisterPageTests.cs`). Match that setup precisely in the new tests below rather than guessing — the fake handler in this suite always returns one fixed JSON string with HTTP 200 regardless of URL/method (see `FakeHttpMessageHandler.cs`), so a single canned response per test covers both the initial `GET /api/users/me` and the delete call.

- [ ] **Step 2: Write the failing tests**

Add to `tests/frontend/ProfilePageTests.cs`, following that file's existing setup pattern:

```csharp
[Fact]
public void Profile_RendersDeleteAccountSection()
{
    // Arrange with the same authenticated setup this file's other tests use,
    // and a fake handler returning a profile from GET /api/users/me.
    var cut = Render<Profile>();

    Assert.NotNull(cut.Find("#deleteAccountPassword"));
    Assert.Contains("Konto löschen", cut.Markup);
}

[Fact]
public void Profile_DeleteAccount_WrongPassword_ShowsErrorWithoutNavigating()
{
    // Arrange a fake handler whose response is
    // {"success":false,"error":{"code":"INVALID_PASSWORD","message":"Current password is incorrect."}}
    // for the delete call (this suite's FakeHttpMessageHandler returns the
    // same body for every request, so the GET /api/users/me profile load
    // must be satisfied by a separate initial render step, or this test
    // should follow whatever multi-response pattern, if any, this file's
    // OnAvatarSelectedAsync-equivalent tests already use for a sequence of
    // two different calls).
    var cut = Render<Profile>();
    cut.Find("#deleteAccountPassword").Change("wrong password");
    cut.Find("#confirmDeleteAccount").Click();
    cut.Find("#deleteAccountButton").Click();

    Assert.Contains("Current password is incorrect.", cut.Markup);
}
```

Before finalizing these two tests, check whether `ProfilePageTests.cs`'s `FakeHttpMessageHandler` usage anywhere already needs two *different* responses in sequence (e.g. one test that both loads profile data and then submits a change) — if the existing file has no such pattern, the second test above should be simplified to not depend on a specific profile GET response (e.g. by checking only that the error renders after clicking, without first asserting profile data loaded), since this suite's fake handler cannot distinguish requests by URL.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~ProfilePageTests"`
Expected: FAIL — no "Konto löschen" section exists yet.

- [ ] **Step 4: Implement the section**

In `frontend/LuminaChronica.Client/Pages/Profile.razor`, add this block right after the existing `<div class="form-actions"><button ... @onclick="LogoutAsync">Abmelden</button></div>` block (still inside the `else` branch, before its closing `}`):

```razor
    <div class="profile-danger-zone">
        <h2>Konto löschen</h2>
        <p class="text-muted">Diese Aktion kann nicht rückgängig gemacht werden. Dein Konto wird sofort deaktiviert.</p>

        @if (_deleteAccountErrorMessage is not null)
        {
            <p class="form-error">@_deleteAccountErrorMessage</p>
        }

        @if (_profile.Email.EndsWith("@deleted.invalid") == false && _hasRealPassword)
        {
            <div class="form-group">
                <label for="deleteAccountPassword">Aktuelles Passwort</label>
                <input id="deleteAccountPassword" type="password" @bind="_deleteAccountPassword" @bind:event="oninput" />
            </div>
        }

        @if (!_isConfirmingDelete)
        {
            <div class="form-actions">
                <button type="button" id="confirmDeleteAccount" class="btn btn-danger" @onclick="() => _isConfirmingDelete = true">Konto löschen</button>
            </div>
        }
        else
        {
            <p class="form-error">Bist du sicher? Das kann nicht rückgängig gemacht werden.</p>
            <div class="form-actions">
                <button type="button" class="btn" @onclick="() => _isConfirmingDelete = false">Abbrechen</button>
                <button type="button" id="deleteAccountButton" class="btn btn-danger" disabled="@(_hasRealPassword && string.IsNullOrEmpty(_deleteAccountPassword))" @onclick="DeleteAccountAsync">
                    Ja, endgültig löschen
                </button>
            </div>
        }
    </div>
```

Add the new state fields and method inside `@code` block, right after the existing `_avatarErrorMessage` field:

```csharp
    private bool _hasRealPassword = true;
    private bool _isConfirmingDelete;
    private string _deleteAccountPassword = string.Empty;
    private string? _deleteAccountErrorMessage;
```

Add the method after the existing `LogoutAsync` method:

```csharp
    private async Task DeleteAccountAsync()
    {
        _deleteAccountErrorMessage = null;

        var request = new DeleteAccountRequest { CurrentPassword = _hasRealPassword ? _deleteAccountPassword : null };
        var response = await ApiClient.DeleteAsync<DeleteAccountRequest, object>("/api/users/me", request);

        if (response is { Success: true })
        {
            await AuthStateProvider.MarkUserAsLoggedOutAsync();
            NavigationManager.NavigateTo("");
            return;
        }

        _deleteAccountErrorMessage = response?.Error?.Message ?? "Konto konnte nicht gelöscht werden. Bitte versuche es erneut.";
        _isConfirmingDelete = false;
    }
```

Note: `_hasRealPassword` defaults to `true` (the common case — password accounts). Wiring it to actually reflect OAuth-only accounts requires the backend to expose that fact on `UserProfile` (it currently does not — `password_hash` is intentionally never serialized). Leave `_hasRealPassword` hardcoded `true` for this task; if OAuth-only self-service deletion needs the password field hidden, that's a follow-up once `UserProfile` (or a dedicated field) exposes whether a real password exists — out of scope here per the design doc.

- [ ] **Step 5: Add the CSS**

Append to `frontend/LuminaChronica.Client/Pages/Profile.razor.css`:

```css
.profile-danger-zone {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-error);
}

.btn-danger {
    background: transparent;
    border: 1px solid var(--color-error);
    color: var(--color-error);
}

.btn-danger:hover {
    background: var(--color-error);
    color: var(--color-bg-card);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~ProfilePageTests"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Profile.razor frontend/LuminaChronica.Client/Pages/Profile.razor.css tests/frontend/ProfilePageTests.cs
git commit -m "feat(frontend): add Konto löschen section to Profile.razor"
```

---

### Task 6: `Register.razor` — `DELETED_ACCOUNT_FOUND` choice

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Register.razor`
- Test: `tests/frontend/RegisterPageTests.cs`

**Interfaces:**
- Consumes: `RegisterRequest.ConfirmNewAccount`, `RestoreAccountRequest`, `ApiClient.PostAsync<TRequest,TResponse>` (existing) from Task 4.

- [ ] **Step 1: Write the failing test**

Add to `tests/frontend/RegisterPageTests.cs`:

```csharp
[Fact]
public void Register_DeletedAccountFound_ShowsRestoreOrNewChoice()
{
    var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"DELETED_ACCOUNT_FOUND","message":"A deleted account exists with this email. Restore it, or confirm you want a new one."}}""");
    Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
    Services.AddSingleton<ApiClient>();
    RegisterAuthServices(this);

    var cut = Render<Register>();
    cut.Find("#username").Change("alice");
    cut.Find("#email").Change("alice@example.com");
    cut.Find("#password").Change("correct horse");
    cut.Find("#confirmPassword").Change("correct horse");
    cut.Find("form").Submit();

    Assert.NotNull(cut.Find("#restoreDeletedAccount"));
    Assert.NotNull(cut.Find("#createNewAccountAnyway"));
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~RegisterPageTests"`
Expected: FAIL — no such buttons exist yet; today this response just renders as a generic error message.

- [ ] **Step 3: Implement the choice UI**

In `frontend/LuminaChronica.Client/Pages/Register.razor`, replace the existing error-display block:

```razor
    @if (_errorMessage is not null)
    {
        <p class="form-error">@_errorMessage</p>
    }
```

with:

```razor
    @if (_deletedAccountFound)
    {
        <p class="form-error">Zu dieser E-Mail existiert ein gelöschter Account.</p>
        <div class="form-actions">
            <button type="button" id="restoreDeletedAccount" class="btn btn-primary" @onclick="RestoreAccountAsync">Alten Account wiederherstellen</button>
            <button type="button" id="createNewAccountAnyway" class="btn" @onclick="CreateNewAccountAnywayAsync">Neuen Account erstellen</button>
        </div>
    }
    else if (_errorMessage is not null)
    {
        <p class="form-error">@_errorMessage</p>
    }
```

Add a field next to the existing `_errorMessage` field:

```csharp
    private bool _deletedAccountFound;
```

Update `SubmitAsync`'s failure branch (currently the last two lines of the method) to detect the new error code:

```csharp
    private async Task SubmitAsync()
    {
        _errorMessage = null;
        _deletedAccountFound = false;

        if (_form.Password != _form.ConfirmPassword)
        {
            _errorMessage = "Die Passwörter stimmen nicht überein.";
            return;
        }

        _isSubmitting = true;

        var request = new RegisterRequest { Username = _form.Username, Email = _form.Email, Password = _form.Password };
        var response = await ApiClient.PostAsync<RegisterRequest, AuthResult>("/api/auth/register", request);

        if (response is { Success: true, Data: not null })
        {
            await AuthStateProvider.MarkUserAsAuthenticatedAsync(response.Data.Token);
            NavigationManager.NavigateTo("");
            return;
        }

        if (response?.Error?.Code == "DELETED_ACCOUNT_FOUND")
        {
            _deletedAccountFound = true;
            _isSubmitting = false;
            return;
        }

        _errorMessage = response?.Error?.Message ?? "Registrierung fehlgeschlagen. Bitte versuche es erneut.";
        _isSubmitting = false;
    }
```

Add the two new handlers after `SubmitAsync`:

```csharp
    private async Task RestoreAccountAsync()
    {
        _errorMessage = null;
        var request = new RestoreAccountRequest { Username = _form.Username, Email = _form.Email, Password = _form.Password };
        var response = await ApiClient.PostAsync<RestoreAccountRequest, AuthResult>("/api/auth/restore", request);

        if (response is { Success: true, Data: not null })
        {
            await AuthStateProvider.MarkUserAsAuthenticatedAsync(response.Data.Token);
            NavigationManager.NavigateTo("");
            return;
        }

        _deletedAccountFound = false;
        _errorMessage = response?.Error?.Message ?? "Wiederherstellung fehlgeschlagen. Bitte versuche es erneut.";
    }

    private async Task CreateNewAccountAnywayAsync()
    {
        _errorMessage = null;
        var request = new RegisterRequest { Username = _form.Username, Email = _form.Email, Password = _form.Password, ConfirmNewAccount = true };
        var response = await ApiClient.PostAsync<RegisterRequest, AuthResult>("/api/auth/register", request);

        if (response is { Success: true, Data: not null })
        {
            await AuthStateProvider.MarkUserAsAuthenticatedAsync(response.Data.Token);
            NavigationManager.NavigateTo("");
            return;
        }

        _deletedAccountFound = false;
        _errorMessage = response?.Error?.Message ?? "Registrierung fehlgeschlagen. Bitte versuche es erneut.";
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~RegisterPageTests"`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/Register.razor tests/frontend/RegisterPageTests.cs
git commit -m "feat(frontend): offer restore-or-new choice on DELETED_ACCOUNT_FOUND"
```

---

## Part 3 — OAuth Linking (backend)

### Task 7: Migration + link/start + callback branching

**Files:**
- Create: `database/migrations/0024_oauth_linking.sql`
- Modify: `backend/src/services/oauthService.ts` (`startOAuth`, `completeOAuthCallback`, new `linkOAuthIdentity`, `OAuthAlreadyLinkedError`)
- Modify: `backend/src/routes/auth.ts` (new `link/start` route, callback redirect branching)
- Test: `tests/backend/oauth.test.ts`

**Interfaces:**
- Produces: `oauthService.startOAuth(db, provider, clientId, redirectUri, linkingUserId?: number | null)`. `completeOAuthCallback(...)` now resolves `{ userId: number; linked: boolean }` instead of `{ userId: number }`. `OAuthAlreadyLinkedError` (exported class).

- [ ] **Step 1: Write the migration**

```sql
-- 0024_oauth_linking.sql
-- OAuth account linking (Roadmap "Profile functions", 3rd of 3). An
-- already-authenticated user can link an additional Google/GitHub identity
-- from their Profile page. oauth_states already exists (0005_oauth.sql) to
-- survive the redirect round-trip to the provider and back -- linking_user_id
-- rides along on the same row: NULL means "ordinary login flow" (today's
-- only case), set means "this callback should link onto that user, not log
-- someone in."
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE oauth_states ADD COLUMN linking_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/backend/oauth.test.ts` (it already has `jsonRequest`, `stubFetchQueue`, `fakeGoogleIdToken`, `extractQueryParam`, `getGoogleState`-style helpers inside their describe blocks — for the new tests below, register a user first to get a `token`, matching the pattern `auth.test.ts`/`users.test.ts` use):

```ts
describe("GET /api/auth/oauth/:provider/link/start", () => {
    async function registerUser(): Promise<string> {
        const res = await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }), env);
        return (await readJson(res)).data.token;
    }

    it("requires authentication", async () => {
        const res = await app.request("/api/auth/oauth/google/link/start", {}, env);
        expect(res.status).toBe(401);
    });

    it("returns a redirect URL as JSON (not a 302) and stores linking_user_id on the state row", async () => {
        const token = await registerUser();
        const res = await app.request("/api/auth/oauth/google/link/start", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(200);

        const json = await readJson(res);
        expect(json.data.redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");

        const state = new URL(json.data.redirectUrl).searchParams.get("state");
        const stored = await env.DB.prepare("SELECT linking_user_id FROM oauth_states WHERE state = ?").bind(state).first<{ linking_user_id: number }>();
        expect(stored!.linking_user_id).not.toBeNull();
    });
});

describe("GET /api/auth/oauth/:provider/callback -- linking an identity onto an existing session", () => {
    async function registerUser(email = "alice@example.com"): Promise<{ token: string; userId: number }> {
        const res = await app.request("/api/auth/register", jsonRequest({ username: "alice", email, password: "correct horse" }), env);
        return (await readJson(res)).data;
    }

    async function startLink(token: string): Promise<string> {
        const res = await app.request("/api/auth/oauth/google/link/start", { headers: { Authorization: `Bearer ${token}` } }, env);
        const json = await readJson(res);
        return new URL(json.data.redirectUrl).searchParams.get("state")!;
    }

    it("links the identity to the caller and redirects to /profile?linked=google without issuing an exchange code", async () => {
        const { token, userId } = await registerUser();
        const state = await startLink(token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-1", email: "alice@gmail.com", email_verified: true }) } },
        ]);

        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        expect(res.status).toBe(302);
        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/some-app/profile");
        expect(extractQueryParam(location, "linked")).toBe("google");
        expect(extractQueryParam(location, "code")).toBeNull();

        const identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-link-1").first<{ user_id: number }>();
        expect(identity!.user_id).toBe(userId);
    });

    it("redirects to /profile?linkError=already_linked when the identity belongs to a different user", async () => {
        // First user links google-link-2 to themselves.
        const owner = await registerUser("owner@example.com");
        const ownerState = await startLink(owner.token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-2", email: "owner@gmail.com", email_verified: true }) } },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${ownerState}`, { redirect: "manual" } as RequestInit, env);

        // A second, different user tries to link the SAME provider identity.
        const other = await registerUser("other@example.com");
        const otherState = await startLink(other.token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-2", email: "owner@gmail.com", email_verified: true }) } },
        ]);
        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${otherState}`, { redirect: "manual" } as RequestInit, env);

        const location = res.headers.get("location")!;
        expect(location).toContain("https://example.test/some-app/profile");
        expect(extractQueryParam(location, "linkError")).toBe("already_linked");

        const identity = await env.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_user_id = ?").bind("google-link-2").first<{ user_id: number }>();
        expect(identity!.user_id).toBe(owner.userId);
    });

    it("is idempotent when re-linking the same identity the caller already has", async () => {
        const { token, userId } = await registerUser();
        const firstState = await startLink(token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-3", email: "alice@gmail.com", email_verified: true }) } },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${firstState}`, { redirect: "manual" } as RequestInit, env);

        const secondState = await startLink(token);
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-link-3", email: "alice@gmail.com", email_verified: true }) } },
        ]);
        const res = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${secondState}`, { redirect: "manual" } as RequestInit, env);
        expect(extractQueryParam(res.headers.get("location")!, "linked")).toBe("google");

        const identities = await env.DB.prepare("SELECT * FROM oauth_identities WHERE provider_user_id = ?").bind("google-link-3").all();
        expect(identities.results).toHaveLength(1);
        expect((identities.results[0] as { user_id: number }).user_id).toBe(userId);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run oauth.test.ts`
Expected: FAIL — `link/start` doesn't exist (404/401 mismatch), `linking_user_id` column doesn't exist.

- [ ] **Step 4: Extend `oauthService.ts`**

Add the new error class next to the existing ones:

```ts
export class OAuthAlreadyLinkedError extends Error {}
```

Change `startOAuth`'s signature and the state insert:

```ts
export async function startOAuth(
    db: D1Database,
    provider: string,
    clientId: string,
    redirectUri: string,
    linkingUserId: number | null = null
): Promise<StartResult> {
    const adapter = providerFor(provider);
    if (!adapter) throw new InvalidProviderError(provider);

    const state = randomToken();
    const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString();
    await db
        .prepare("INSERT INTO oauth_states (state, provider, expires_at, linking_user_id) VALUES (?, ?, ?, ?)")
        .bind(state, provider, expiresAt, linkingUserId)
        .run();

    return { redirectUrl: adapter.authorizeUrl(clientId, redirectUri, state) };
}
```

Change `completeOAuthCallback`'s state lookup and return value:

```ts
export async function completeOAuthCallback(
    db: D1Database,
    provider: string,
    code: string,
    state: string,
    credentials: { clientId: string; clientSecret: string },
    redirectUri: string
): Promise<{ userId: number; linked: boolean }> {
    const adapter = providerFor(provider);
    if (!adapter) throw new InvalidProviderError(provider);

    const stateRow = await db
        .prepare("DELETE FROM oauth_states WHERE state = ? AND provider = ? AND expires_at > CURRENT_TIMESTAMP RETURNING state, linking_user_id")
        .bind(state, provider)
        .first<{ state: string; linking_user_id: number | null }>();
    if (!stateRow) throw new InvalidStateError();

    const profile = await adapter.exchangeCode(code, redirectUri, credentials);

    if (stateRow.linking_user_id !== null) {
        await linkOAuthIdentity(db, stateRow.linking_user_id, provider as OAuthProviderName, profile);
        return { userId: stateRow.linking_user_id, linked: true };
    }

    const userId = await findOrCreateUserForOAuth(db, provider as OAuthProviderName, profile);
    return { userId, linked: false };
}

// Links an already-authenticated user's account onto a provider identity.
// Idempotent when re-linking an identity the caller already has (a repeat
// link attempt after e.g. a double-click shouldn't error); rejects when the
// identity belongs to someone else.
async function linkOAuthIdentity(db: D1Database, userId: number, provider: OAuthProviderName, profile: OAuthProfile): Promise<void> {
    const existing = await db
        .prepare("SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?")
        .bind(provider, profile.providerUserId)
        .first<{ user_id: number }>();

    if (existing) {
        if (existing.user_id !== userId) throw new OAuthAlreadyLinkedError();
        return;
    }

    await db
        .prepare("INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)")
        .bind(userId, provider, profile.providerUserId, profile.email)
        .run();
}
```

- [ ] **Step 5: Update `routes/auth.ts`**

Add `OAuthAlreadyLinkedError` to the existing import from `../services/oauthService`:

```ts
import {
    InvalidProviderError,
    InvalidStateError,
    OAuthAlreadyLinkedError,
    completeOAuthCallback,
    redeemExchangeCode,
    startOAuth,
    storeExchangeCode,
} from "../services/oauthService";
```

Add the new route right after the existing `authRoute.get("/oauth/:provider/start", ...)` handler:

```ts
// Unlike /start above, this must carry the caller's Bearer token, so it
// can't be a bare 302 target for a plain browser navigation -- the frontend
// calls it via the authenticated ApiClient, gets { redirectUrl } back as
// JSON, then navigates the browser there itself (NavigationManager with
// forceLoad, leaving the SPA).
authRoute.get("/oauth/:provider/link/start", requireAuth, async (c) => {
    const provider = c.req.param("provider");
    const credentials = credentialsFor(c, provider);
    if (!credentials) return c.json(failure("INVALID_PROVIDER", `Unknown OAuth provider "${provider}".`), 400);

    try {
        const { redirectUrl } = await startOAuth(c.env.DB, provider, credentials.clientId, callbackUrl(c, provider), c.get("userId"));
        return c.json(success({ redirectUrl }));
    } catch (err) {
        if (err instanceof InvalidProviderError) return c.json(failure("INVALID_PROVIDER", `Unknown OAuth provider "${provider}".`), 400);
        throw err;
    }
});
```

Replace the entire existing `authRoute.get("/oauth/:provider/callback", ...)` handler with:

```ts
authRoute.get("/oauth/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const credentials = credentialsFor(c, provider);
    const code = c.req.query("code");
    const state = c.req.query("state");
    // See the existing comment below on plain-concatenation vs `new URL("/x",
    // base)` for why both of these are built the same deliberate way.
    const loginRedirect = new URL(`${c.env.FRONTEND_URL}/oauth-callback`);
    const profileRedirect = new URL(`${c.env.FRONTEND_URL}/profile`);

    if (!credentials || !code || !state) {
        loginRedirect.searchParams.set("error", "oauth_failed");
        return c.redirect(loginRedirect.toString(), 302);
    }

    try {
        const { userId, linked } = await completeOAuthCallback(c.env.DB, provider, code, state, credentials, callbackUrl(c, provider));
        if (linked) {
            // No new JWT is issued for a link -- the caller already has a
            // valid session; nothing to hand back through an exchange code.
            profileRedirect.searchParams.set("linked", provider);
            return c.redirect(profileRedirect.toString(), 302);
        }
        const exchangeCode = await storeExchangeCode(c.env.DB, userId);
        loginRedirect.searchParams.set("code", exchangeCode);
        return c.redirect(loginRedirect.toString(), 302);
    } catch (err) {
        if (err instanceof OAuthAlreadyLinkedError) {
            profileRedirect.searchParams.set("linkError", "already_linked");
            return c.redirect(profileRedirect.toString(), 302);
        }
        const reason =
            err instanceof InvalidProviderError ? "invalid_provider" :
            err instanceof InvalidStateError ? "invalid_state" :
            err instanceof OAuthExchangeError ? "exchange_failed" :
            "oauth_failed";
        loginRedirect.searchParams.set("error", reason);
        return c.redirect(loginRedirect.toString(), 302);
    }
});
```

Note: the original handler built `frontendCallback` via `new URL(\`${c.env.FRONTEND_URL}/oauth-callback\`)` (plain string concatenation, not `new URL("/oauth-callback", base)`) specifically to avoid a documented root-relative-path bug on the GitHub Pages *project* site — `profileRedirect` above follows the exact same concatenation style for the same reason.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run oauth.test.ts`
Expected: PASS (all tests in the file, including the pre-existing login-flow ones — `linked` is `false` for every existing test since none of their state rows set `linking_user_id`).

- [ ] **Step 7: Commit**

```bash
git add database/migrations/0024_oauth_linking.sql backend/src/services/oauthService.ts backend/src/routes/auth.ts tests/backend/oauth.test.ts
git commit -m "feat: add OAuth account linking (link/start + callback branching)"
```

---

### Task 8: Manage links — `GET /oauth/linked`, `DELETE /oauth/:provider`

**Files:**
- Modify: `backend/src/services/oauthService.ts` (`getLinkedProviders`, `unlinkProvider`, `OAuthUnlinkBlockedError`)
- Modify: `backend/src/routes/auth.ts`
- Test: `tests/backend/oauth.test.ts`

**Interfaces:**
- Consumes: `linkOAuthIdentity`/migration from Task 7 (identities already exist to list/unlink).
- Produces: `oauthService.getLinkedProviders(db, userId): Promise<{ provider: string; email: string | null; linkedAt: string }[]>`, `oauthService.unlinkProvider(db, userId, provider): Promise<void>` (throws `OAuthUnlinkBlockedError`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/backend/oauth.test.ts`:

```ts
describe("GET /api/auth/oauth/linked and DELETE /api/auth/oauth/:provider", () => {
    async function registerAndLinkGoogle(): Promise<{ token: string; userId: number }> {
        const registerRes = await app.request("/api/auth/register", jsonRequest({ username: "alice", email: "alice@example.com", password: "correct horse" }), env);
        const { token, userId } = (await readJson(registerRes)).data;

        const startRes = await app.request("/api/auth/oauth/google/link/start", { headers: { Authorization: `Bearer ${token}` } }, env);
        const state = new URL((await readJson(startRes)).data.redirectUrl).searchParams.get("state")!;
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-manage-1", email: "alice@gmail.com", email_verified: true }) } },
        ]);
        await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);

        return { token, userId };
    }

    it("requires authentication for both endpoints", async () => {
        expect((await app.request("/api/auth/oauth/linked", {}, env)).status).toBe(401);
        expect((await app.request("/api/auth/oauth/google", { method: "DELETE" }, env)).status).toBe(401);
    });

    it("lists a linked provider", async () => {
        const { token } = await registerAndLinkGoogle();
        const res = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        const json = await readJson(res);
        expect(json.data).toHaveLength(1);
        expect(json.data[0].provider).toBe("google");
        expect(json.data[0].email).toBe("alice@gmail.com");
    });

    it("unlinks a provider when the account still has a real password", async () => {
        const { token } = await registerAndLinkGoogle();
        const res = await app.request("/api/auth/oauth/google", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(200);

        const listRes = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(0);
    });

    it("blocks unlinking the only sign-in method for an OAuth-only account", async () => {
        const startRes = await app.request("/api/auth/oauth/google/start", { redirect: "manual" } as RequestInit, env);
        const state = extractQueryParam(startRes.headers.get("location")!, "state")!;
        stubFetchQueue([
            { match: "oauth2.googleapis.com/token", json: { id_token: fakeGoogleIdToken({ sub: "google-onlyauth", email: "onlyauth@example.com", email_verified: true }) } },
        ]);
        const callbackRes = await app.request(`/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: "manual" } as RequestInit, env);
        const code = extractQueryParam(callbackRes.headers.get("location")!, "code")!;
        const exchangeRes = await app.request("/api/auth/oauth/exchange", jsonRequest({ code }), env);
        const token = (await readJson(exchangeRes)).data.token;

        const res = await app.request("/api/auth/oauth/google", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }, env);
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("UNLINK_BLOCKED");

        const listRes = await app.request("/api/auth/oauth/linked", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(listRes)).data).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests/backend && npx vitest run oauth.test.ts`
Expected: FAIL — neither endpoint exists yet.

- [ ] **Step 3: Extend `oauthService.ts`**

Add the error class and the two functions at the end of the file:

```ts
export class OAuthUnlinkBlockedError extends Error {}

export type LinkedProvider = { provider: string; email: string | null; linkedAt: string };

export async function getLinkedProviders(db: D1Database, userId: number): Promise<LinkedProvider[]> {
    const rows = await db
        .prepare("SELECT provider, email, created_at FROM oauth_identities WHERE user_id = ? ORDER BY created_at ASC")
        .bind(userId)
        .all<{ provider: string; email: string | null; created_at: string }>();
    return rows.results.map((row) => ({ provider: row.provider, email: row.email, linkedAt: row.created_at }));
}

// Refuses to remove the last way a purely-OAuth account (no real password)
// could ever sign in again. Deleting a provider the caller never actually
// had linked is treated as a no-op success, same idempotent-by-design
// philosophy as routes/users.ts's follow/unfollow.
export async function unlinkProvider(db: D1Database, userId: number, provider: string): Promise<void> {
    const user = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
    if (!user) throw new Error("User disappeared during unlink.");

    const identityCount = await db.prepare("SELECT COUNT(*) AS count FROM oauth_identities WHERE user_id = ?").bind(userId).first<{ count: number }>();
    const hasRealPassword = user.password_hash !== OAUTH_NO_PASSWORD_SENTINEL;

    if (!hasRealPassword && (identityCount?.count ?? 0) <= 1) {
        throw new OAuthUnlinkBlockedError();
    }

    await db.prepare("DELETE FROM oauth_identities WHERE user_id = ? AND provider = ?").bind(userId, provider).run();
}
```

- [ ] **Step 4: Add the routes**

Add `OAuthUnlinkBlockedError`, `getLinkedProviders`, `unlinkProvider` to the existing import in `backend/src/routes/auth.ts`:

```ts
import {
    InvalidProviderError,
    InvalidStateError,
    OAuthAlreadyLinkedError,
    OAuthUnlinkBlockedError,
    completeOAuthCallback,
    getLinkedProviders,
    redeemExchangeCode,
    startOAuth,
    storeExchangeCode,
    unlinkProvider,
} from "../services/oauthService";
```

Add these two routes right after the `authRoute.post("/oauth/exchange", ...)` handler, at the end of the file:

```ts
authRoute.get("/oauth/linked", requireAuth, async (c) => {
    const providers = await getLinkedProviders(c.env.DB, c.get("userId"));
    return c.json(success(providers));
});

// 200 { data: null } rather than a bare 204 -- see the plan's Global
// Constraints for why (UNLINK_BLOCKED needs to carry a message through the
// same envelope).
authRoute.delete("/oauth/:provider", requireAuth, async (c) => {
    try {
        await unlinkProvider(c.env.DB, c.get("userId"), c.req.param("provider"));
        return c.json(success(null));
    } catch (err) {
        if (err instanceof OAuthUnlinkBlockedError) {
            return c.json(failure("UNLINK_BLOCKED", "You can't remove your last sign-in method while no password is set."), 409);
        }
        throw err;
    }
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests/backend && npx vitest run oauth.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `cd tests/backend && npx vitest run`
Expected: PASS (nothing else broke across the whole backend).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/oauthService.ts backend/src/routes/auth.ts tests/backend/oauth.test.ts
git commit -m "feat: add GET /api/auth/oauth/linked and DELETE /api/auth/oauth/:provider"
```

---

## Part 4 — OAuth Linking (frontend)

### Task 9: `Profile.razor` — "Verknüpfte Konten"

**Files:**
- Modify: `frontend/LuminaChronica.Client/Models/Auth.cs`
- Modify: `frontend/LuminaChronica.Client/Pages/Profile.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/Profile.razor.css`
- Test: `tests/frontend/ProfilePageTests.cs`

**Interfaces:**
- Consumes: `ApiClient.GetAsync<T>`, `ApiClient.DeleteAsync<TRequest,TResponse>` (Task 4) — no new `ApiClient` methods needed (linking's start call is a plain `GetAsync<OAuthLinkStartResult>`, unlink reuses `DeleteAsync` with an empty body object).

- [ ] **Step 1: Add the models**

Append to `frontend/LuminaChronica.Client/Models/Auth.cs`:

```csharp
// Mirrors backend/src/services/oauthService.ts's LinkedProvider.
public class LinkedOAuthProvider
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("linkedAt")]
    public string LinkedAt { get; set; } = string.Empty;
}

// Returned by GET /api/auth/oauth/:provider/link/start.
public class OAuthLinkStartResult
{
    [JsonPropertyName("redirectUrl")]
    public string RedirectUrl { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Write the failing test**

Add to `tests/frontend/ProfilePageTests.cs`, matching its existing authenticated-render setup:

```csharp
[Fact]
public void Profile_RendersLinkedAccountsSection()
{
    var cut = Render<Profile>();

    Assert.Contains("Verknüpfte Konten", cut.Markup);
}
```

(This test only asserts the section heading renders — the underlying `FakeHttpMessageHandler` returns one fixed response for every call in this suite, so it can't distinguish the `GET /api/users/me` response from a `GET /api/auth/oauth/linked` response within one test; keep this test to what's actually verifiable under that constraint, following the same caution as Task 5's tests.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~ProfilePageTests"`
Expected: FAIL — no such section exists yet.

- [ ] **Step 4: Implement the section**

In `frontend/LuminaChronica.Client/Pages/Profile.razor`, add this block right after the existing `<h2>Passwort ändern</h2>` `EditForm` block and before the `<div class="form-actions">` that holds the "Abmelden" button:

```razor
    <h2>Verknüpfte Konten</h2>
    @if (_linkBanner is not null)
    {
        <p class="@(_linkBannerIsError ? "form-error" : "form-success")">@_linkBanner</p>
    }
    @if (_linkedProviders is null)
    {
        <p class="text-muted">Lade …</p>
    }
    else
    {
        <div class="linked-accounts-list">
            @foreach (var (providerKey, label) in OAuthProviders)
            {
                var linked = _linkedProviders.FirstOrDefault(p => p.Provider == providerKey);
                <div class="linked-account-row">
                    <span>@label@(linked is not null ? $" — {linked.Email}" : "")</span>
                    @if (linked is not null)
                    {
                        <button type="button" class="btn" @onclick="() => UnlinkProviderAsync(providerKey)">Entfernen</button>
                    }
                    else
                    {
                        <button type="button" class="btn" @onclick="() => LinkProviderAsync(providerKey)">Verknüpfen</button>
                    }
                </div>
            }
        </div>
    }
```

Add the using directive for LINQ at the top of the file, next to the existing `@using` lines:

```razor
@using System.Linq
```

Add fields and the static providers list inside `@code`, next to the existing `_profile` field:

```csharp
    private static readonly (string Key, string Label)[] OAuthProviders =
    [
        ("google", "Google"),
        ("github", "GitHub"),
    ];

    private List<LinkedOAuthProvider>? _linkedProviders;
    private string? _linkBanner;
    private bool _linkBannerIsError;
```

Extend `OnInitializedAsync` to also load linked providers and parse the query string:

```csharp
    protected override async Task OnInitializedAsync()
    {
        var response = await ApiClient.GetAsync<UserProfile>("/api/users/me");
        if (response is { Success: true, Data: not null })
        {
            _profile = response.Data;
            _profileForm = new ProfileFormModel { Username = _profile.Username, Email = _profile.Email };
        }

        var linkedResponse = await ApiClient.GetAsync<List<LinkedOAuthProvider>>("/api/auth/oauth/linked");
        _linkedProviders = linkedResponse is { Success: true, Data: not null } ? linkedResponse.Data : [];

        var query = new Uri(NavigationManager.Uri).Query.TrimStart('?');
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length != 2) continue;
            if (parts[0] == "linked")
            {
                _linkBanner = $"{Uri.UnescapeDataString(parts[1])} wurde verknüpft.";
                _linkBannerIsError = false;
            }
            else if (parts[0] == "linkError")
            {
                _linkBanner = "Verknüpfung fehlgeschlagen. Dieses Konto ist bereits mit einem anderen Benutzer verknüpft.";
                _linkBannerIsError = true;
            }
        }
        if (_linkBanner is not null)
        {
            NavigationManager.NavigateTo("profile", replace: true);
        }
    }
```

Add the two handlers after `OnInitializedAsync`:

```csharp
    private async Task LinkProviderAsync(string provider)
    {
        var response = await ApiClient.GetAsync<OAuthLinkStartResult>($"/api/auth/oauth/{provider}/link/start");
        if (response is { Success: true, Data: not null })
        {
            NavigationManager.NavigateTo(response.Data.RedirectUrl, forceLoad: true);
        }
    }

    private async Task UnlinkProviderAsync(string provider)
    {
        var response = await ApiClient.DeleteAsync<object, object>($"/api/auth/oauth/{provider}", new { });
        if (response is { Success: true })
        {
            _linkedProviders = _linkedProviders?.Where(p => p.Provider != provider).ToList();
            _linkBanner = null;
        }
        else
        {
            _linkBanner = response?.Error?.Message ?? "Entfernen fehlgeschlagen. Bitte versuche es erneut.";
            _linkBannerIsError = true;
        }
    }
```

- [ ] **Step 5: Add the CSS**

Append to `frontend/LuminaChronica.Client/Pages/Profile.razor.css`:

```css
.linked-accounts-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
}

.linked-account-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) 0;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter "FullyQualifiedName~ProfilePageTests"`
Expected: PASS.

- [ ] **Step 7: Run the full frontend suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: PASS (nothing else broke, including `Register_*` and any `OAuthCallback`/`Login` tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Models/Auth.cs frontend/LuminaChronica.Client/Pages/Profile.razor frontend/LuminaChronica.Client/Pages/Profile.razor.css tests/frontend/ProfilePageTests.cs
git commit -m "feat(frontend): add Verknüpfte Konten section to Profile.razor"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-09-25-account-deletion-oauth-linking-design.md` maps to a task — migration+anonymize (Task 1), restore-gate (Task 2), restore endpoint (Task 3), frontend delete UI (Task 5), frontend restore/new choice (Task 6), migration+link/start+callback branch (Task 7), manage-links endpoints (Task 8), frontend linked-accounts UI (Task 9). Task 4 is shared plumbing both Task 5 and Task 6 depend on.
- **Known gap, called out explicitly in Task 5 Step 4:** `_hasRealPassword` is hardcoded `true` since `UserProfile` doesn't currently expose whether an account is OAuth-only; this only affects whether the password field is *shown* for such accounts (the backend already handles the OAuth-only case correctly regardless — `deleteUser` skips the password check itself). Not a blocker, flagged as a followup rather than silently guessed at.
- **Test-infra risk flagged, not silently assumed:** Tasks 5, 6, and 9's frontend tests depend on exactly how `ProfilePageTests.cs`/`RegisterPageTests.cs` already handle authenticated rendering and the single-fixed-response `FakeHttpMessageHandler` — each such step explicitly says to read the existing file first and adapt, rather than guessing at a setup this plan's author hasn't seen.
