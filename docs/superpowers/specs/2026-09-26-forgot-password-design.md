# Forgot Password — Design

**Date:** 2026-09-26
**Status:** Approved

## Goal

A user who forgets their password can regain access without help, via:

1. A "Passwort vergessen?" link on the Login page.
2. A "Passwort-Reset-Link senden" button on the Profile/Settings page, for a
   logged-in user who wants to change their password but doesn't know the
   current one (required today by `PUT /api/users/me`).

This has been blocked since the app has no email-sending infrastructure at
all. That's the actual new piece of work here — the reset-token mechanics
themselves closely mirror the existing OAuth exchange-code flow
(`oauth_exchange_codes` / `storeExchangeCode` / `redeemExchangeCode` in
`oauthService.ts`).

## Prerequisite infrastructure

- **Domain:** `luminachronica.com`, purchased on IONOS (2026-09-26). DNS
  records (A + GitHub's verification TXT) still need to be added at IONOS
  — blocked on the user regaining IONOS panel access. Not required to ship
  this feature: reset links can point at the existing
  `https://watzingerm21052.github.io/lumina-chronica/` URL
  (`FRONTEND_URL` in `backend/wrangler.toml`) until the domain is live, then
  get switched over as a one-line config change.
- **Email provider:** [Resend](https://resend.com). Free tier (3,000
  emails/month) comfortably covers this app's scale. Chosen over SendGrid
  for its simpler REST API (a single `fetch()` call, no SDK needed — fits
  this Worker's existing "native APIs over dependencies" style, e.g.
  `crypto.subtle` for password hashing instead of a bcrypt package).
  Requires a `RESEND_API_KEY` Worker secret (`wrangler secret put`, same
  pattern as `JWT_SECRET`) and the domain verified in Resend's dashboard
  (separate verification from GitHub Pages' — both need the same
  `luminachronica.com`, both blocked on IONOS access).

  **Consequence for shipping:** the code, migration, and full test suite
  (email sending mocked throughout) can all be built and merged before
  DNS is sorted out. Only *live* end-to-end delivery is blocked until
  then — Resend's unverified-domain mode only delivers to the Resend
  account owner's own address, not to arbitrary users, so this feature
  can't be used for real by anyone but the developer until
  `luminachronica.com` is verified both at GitHub Pages (already covered
  by the earlier custom-domain work) and, separately, in Resend's own
  dashboard.

## Data model

New migration `database/migrations/0025_password_reset.sql`:

```sql
CREATE TABLE password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Same shape as `oauth_exchange_codes`: only a hash of the raw token is ever
stored (via the existing `sha256Hex` util), never the plaintext. TTL is 1
hour (`PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60`) — long enough that
"check your email" isn't a race, unlike the OAuth exchange code's 2-minute
TTL, which only has to survive an immediate redirect round trip. Expired,
unconsumed rows are never actively cleaned up — they're inert dead weight,
not a security concern, and this app has no existing cron/cleanup job to
hang it off of (YAGNI).

## Backend

### `backend/src/services/emailService.ts` (new)

Wraps the Resend HTTP call behind a small, test-mockable function:

```ts
export async function sendEmail(
    apiKey: string,
    to: string,
    subject: string,
    html: string
): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: "Lumina Chronica <noreply@luminachronica.com>", to, subject, html }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${response.status}`);
}
```

### `backend/src/services/passwordResetService.ts` (new)

Mirrors `oauthService.ts`'s `storeExchangeCode`/`redeemExchangeCode` pair:

- `requestPasswordReset(db, env, identifier)`: looks up the user by
  email-or-username (same lookup `loginUser` already does). Always
  resolves successfully, regardless of outcome — the route never learns
  whether a match was found, closing the enumeration channel at the type
  level, not just by convention:
  - No match → do nothing.
  - Match, real password (`password_hash !== OAUTH_NO_PASSWORD_SENTINEL`)
    → generate token (`randomToken()` + `sha256Hex()`, insert row), send
    reset-link email via `sendEmail()`.
  - Match, OAuth-only account → send an informational email instead
    ("this account signs in via Google/GitHub, there's no password to
    reset") — no token generated. Helps the actual account owner without
    leaking anything to an attacker who doesn't have mailbox access.
- `resetPassword(db, rawToken, newPassword)`: atomic consume, same
  `UPDATE ... WHERE token_hash = ? AND consumed_at IS NULL AND
  julianday(expires_at) > julianday('now') RETURNING user_id` pattern as
  `redeemExchangeCode` — `julianday(...)` rather than a plain `expires_at >
  CURRENT_TIMESTAMP` text comparison, the same SQLite text-vs-ISO-timestamp
  pitfall already documented (and worked around) elsewhere in this
  codebase. No matching row → throws `InvalidResetTokenError`.
  On success: hash the new password (`hashPassword`), update
  `users.password_hash`, sign and return a fresh JWT (`signJwt`) so the
  user is immediately logged in — same as the OAuth exchange flow's own
  UX, no separate login step required.

### Routes (`auth.ts`)

- `POST /api/auth/forgot-password { identifier }` → always `200`, generic
  body (`{"success":true,"data":{"message":"..."}}`). Calls
  `requestPasswordReset`; any `sendEmail` failure is caught and logged,
  never surfaced to the caller (an email provider outage shouldn't leak
  through as a distinguishable response, and shouldn't 500 the request —
  the token row already exists by that point regardless).
  Rate-limited via the existing `rateLimitService.ts` (already used by
  `/login` and `/register` — this codebase does have D1-backed
  IP+identifier throttling, corrected from an earlier draft of this spec
  that claimed otherwise). Mirrors `/login`'s `(ip, identifier)` keying —
  an attacker must not be able to email-bomb one victim's inbox from many
  IPs while the victim can still request their own reset — but records
  every attempt unconditionally like `/register` does, since this route
  has no distinguishable success/failure outcome to condition on (that's
  the whole point of the generic response). New
  `FORGOT_PASSWORD_MAX_ATTEMPTS = 5` constant; `/reset-password` itself
  stays unthrottled, same as OAuth's `redeemExchangeCode` — its token is
  a 256-bit random value, not brute-forceable within any practical rate
  limit's relevance window.
- `POST /api/auth/reset-password { token, newPassword }` → `200` with a
  fresh `{ token, userId }` on success (same shape as login/register), or
  `400 INVALID_RESET_TOKEN` on `InvalidResetTokenError`.

## Frontend

- **`Login.razor`:** "Passwort vergessen?" link under the password field,
  routes to `/forgot-password`.
- **`ForgotPassword.razor` (new page):** identifier field (mirrors Login's
  own), submits to `forgot-password`, then replaces the form with the
  static success message — never shows an error state tied to whether the
  account exists.
- **`ResetPassword.razor` (new page):** reads `?token=` from the query
  string, two password fields (new + confirm, same mismatch check as
  Register), submits to `reset-password`. Success → store the returned
  JWT (same `LuminaAuthStateProvider` path as Login/Register use today),
  redirect to `/` with a success toast. Failure (expired/invalid/already-
  used token) → error message with a link back to `/forgot-password`.
- **`Settings.razor`:** new button near the existing preferences,
  "Passwort-Reset-Link senden" — calls `forgot-password` directly with the
  logged-in user's own email, no form, just a confirmation toast on click.
  The page had no existing profile fetch to reuse for this; a new
  `GET /api/users/me` call was added to `OnInitializedAsync` specifically
  to obtain the email. Reuses the identical backend endpoint and email
  flow as the Login-page path; the only difference is the app already
  knows who's asking.

All four new/changed UI surfaces get `II18nService` keys following the
existing `de.json`/`en.json` + `FakeI18nService` pattern from i18n Phase 1.

## Testing

- **Backend (Vitest, `tests/backend/`):** new `passwordReset.test.ts`
  mirroring `oauth.test.ts`'s structure — token issuance/consumption,
  expiry, single-use, identical response for existing vs. non-existing
  identifier, OAuth-only-account path, and rate-limiting (429 after
  `FORGOT_PASSWORD_MAX_ATTEMPTS`, same style as the existing rate-limit
  tests for `/login`/`/register`). `emailService.ts`'s `sendEmail` is
  mocked (no real network calls in tests, same principle as every other
  external boundary in this test suite).
- **Frontend (bUnit, `tests/frontend/`):** `ForgotPasswordPageTests.cs`,
  `ResetPasswordPageTests.cs`, plus additions to the existing
  `LoginPageTests.cs` (link renders, navigates) and `SettingsPageTests.cs`
  (button renders, triggers the request with the known email).

## Explicitly out of scope (YAGNI)

- Post-reset confirmation email ("your password was changed") — a second
  email template for marginal benefit; skip for this phase.
- Invalidating other active sessions/JWTs on reset — this app has no
  session table or JWT blocklist (stateless 7-day tokens, see
  `authService.ts`); building one just for this would be substantial scope
  creep unrelated to the actual ask.
- True origin-independent fallback between `luminachronica.com` and the
  `*.github.io` URL — GitHub Pages force-redirects the old URL once a
  custom domain is configured on the repo (confirmed empirically
  2026-09-26; briefly shipped and immediately reverted, see PR #473's
  history). A real independent fallback would need a second, separately-
  hosted deployment (e.g. Cloudflare Pages) — out of scope here; revisit
  only if/when actually needed.
