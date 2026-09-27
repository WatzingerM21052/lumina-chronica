# Password-Reset Modernization + App-Wide Dialog Convention — Design

**Date:** 2026-09-27
**Status:** Draft — needs sign-off (see §0). Revised same-day after a live,
authenticated recipemaster.at check (§7.1a) overturned the original D12
recommendation (BookDetail edit: sheet → `Dialog Size="Large"`, §6.3).
**Supersedes / reverses parts of:** `docs/superpowers/specs/2026-09-26-forgot-password-design.md` (Status: Approved)

---

## 0. Open decisions — needs the user's sign-off before implementation

These are the things I can't decide alone. Everything else in this document is a
recommendation I'm prepared to defend; these are genuine forks.

| # | Decision | My recommendation | Why it needs you |
|---|---|---|---|
| **D1** | Code format | **6 digits** (`482 913`) | 8 alphanumeric chars is more brute-force-resistant but much worse to type/read and kills `autocomplete="one-time-code"`. 6 digits + a hard per-code attempt cap is what Stripe/GitHub/Google do. |
| **D2** | TTL | **20 minutes** for code *and* link (one `expires_at`) **+ a 60-second resend cooldown, keyed on the raw identifier via `auth_rate_limits`** | **DECIDED 2026-09-27** by the user, explicitly matching recipemaster.at's own behavior ("20 min und man kann alle 60 sec die email neu senden - wie in recipemaster"). Today the link is 60 min with no resend cooldown at all — this is a real behavior change, not just a number tweak. **Corrected same day**: the first design (checking `password_reset_tokens.created_at` by `user_id`) was an account-enumeration bug — see §3.4 step 0's full writeup. Fixed by keying the cooldown check on the identifier string itself, via the existing rate-limit table, checked before any user lookup. |
| **D3** | Keep the emailed link at all? | **Yes — hybrid.** Email carries the code *and* a fallback link | Pure-code means the existing `/reset-password?token=` route, its email, and its tests all die, and links already in flight break. Hybrid costs one extra column. |
| **D4** | Attempt budget per code | **10 wrong attempts, then the code is dead** | Directly controls how forgiving the live check feels. 5 feels tight when validation fires while typing; 10 is still 1-in-100 000 odds per code. |
| **D5** | Does a *live* check burn an attempt? | **Yes — it must** | A "free" check is a brute-force oracle. Consequence: the live check must be debounced + de-duplicated (§4.3), and D4 must be generous. There is no third option here. |
| **D6** | Requesting a new code kills outstanding ones? | **Yes** | Otherwise an attacker farms N concurrent codes and multiplies the guess budget by N. Cost: an old email's link stops working. |
| **D7** | Auto-login after reset (current behavior returns a JWT) | **Keep it** | Some products force a fresh login instead. Keeping it matches "modern and smooth", and it's what ships today. |
| **D8** | "This wasn't me →" route in the confirmation email | **DECIDED 2026-09-27**: a `mailto:luminachronica@gmx.at` link/line in the email | The user already owns this mailbox — it's an existing external address, not a new `@luminachronica.com` address, so **no DNS/domain email setup needed** before shipping. Simpler than my original two options (link to Impressum, or stand up a new `support@luminachronica.com`). **Scope, confirmed by the user 2026-09-27**: this address is for *contact/support display purposes only* — the `From:` header on every transactional email (password-reset code, confirmation, OAuth-no-password) **stays `noreply@luminachronica.com`** (`emailService.ts`, unchanged). Also **already applied outside this feature**: `Impressum.razor`'s Kontakt section now lists `luminachronica@gmx.at` as "Support / Allgemeine Anfragen" alongside the pre-existing personal/legal email (TMG-required, kept as-is) — done, committed, not part of the phase plan below. **Future idea, deliberately deferred (2026-09-27)**: `contact@` / `support@` / `feedback@luminachronica.com` as free-form aliases via **Cloudflare Email Routing** (the user already runs the Workers backend on Cloudflare), all forwarding to the same real `luminachronica@gmx.at` inbox — the `To:` header on the forwarded mail tells them which alias was used, no real per-alias mailbox needed. Independent of sending (Resend's SPF/DKIM for `noreply@`) — receiving via Cloudflare MX records doesn't conflict with it. Not blocking anything here; revisit only if/when the user sets it up. |
| **D9** | Email language | **Read `user_settings.language`** (exists: `de`/`en`, default `de`) | Today both emails are hardcoded German. Fallback for a user with no settings row = `de`. |
| **D10** | Code hashing | **HMAC-SHA256 keyed with a Worker secret** | Plain `sha256Hex` over a 10⁶ keyspace is a rainbow table. Sub-question: new secret (`PASSWORD_CODE_SECRET`) or reuse `JWT_SECRET`? I'd add a new one. |
| **D11** | Dialog primitive: native `<dialog>` + `showModal()` vs. CSS overlay | **CSS overlay now** (extend today's pattern), evaluate native `<dialog>` later | Native gives focus-trap/`inert`/Escape for free, but needs JS interop, changes the overlay-click semantics `ConfirmDialog` documents, and bUnit executes no JS (so every test would need the call guarded). |
| **D12** | Book **edit** (BookDetail's inline edit mode) | **UPDATED after live reference check (see §7.1a): a `Large` (48rem) centered modal**, not a sheet | Originally recommended a right-side sheet, reasoning a 24rem dialog can't hold 14 fields + cover dropzone + enrichment panel. Live-checked recipemaster.at's own recipe-edit modal (logged in, real screenshots, not the earlier failed fetch) — it puts a comparable field count (title, description, category, time, portions, difficulty, image, video, a dynamic add/remove ingredients list, a dynamic add/remove steps list) in one **centered, wider modal** with a scrollable body and a sticky header (title + ✕) and sticky footer (Abbrechen / Änderungen speichern), not a sheet. That's a real working precedent for the exact problem D12 was solving, so I'm reversing the recommendation — see §6.3 for the updated design. |
| **D13** | Book **upload** (`/library/upload`, 685 lines, 50 MB file) | **Stays a page** | Honest opinion: a modal you must not dismiss during a 50 MB upload is a bad modal. See §6.3 for the compromise (a small "add a book" chooser dialog that routes onward). |
| **D14** | Keep `/forgot-password` and `/reset-password` as routes? | **Yes, as thin shells that open the dialog** | Bookmarks, emails already sent, and the existing bUnit page tests all depend on them. |

---

## 1. What this reverses in the approved 2026-09-26 spec

The forgot-password spec is marked **Approved**, so a future reader will otherwise
hit two contradicting approved documents. Two of its decisions are explicitly
reversed here:

1. **"Post-reset confirmation email — skip for this phase (YAGNI)."**
   Reversed. The user asked for it directly ("und du bekommst nochmal eine
   email"). It's also genuinely the security-valuable one: it's the only signal a
   victim gets that their account was taken over.

2. **"`/reset-password` stays unthrottled — its token is a 256-bit random value,
   not brute-forceable within any practical rate limit's relevance window."**
   That rationale is *correct for a 256-bit token and false for a 6-digit code.*
   Introducing the code is exactly what invalidates it. §3 replaces it with a
   per-token attempt counter.

Everything else in that spec (hashed-at-rest tokens, atomic single-use consume,
generic anti-enumeration response, the OAuth-only-account branch, the existing
`(ip, identifier)` throttle on `/forgot-password`) stands unchanged and is
load-bearing here.

---

## 2. What exists today (verified by reading, not assumed)

| Piece | File | Shape today |
|---|---|---|
| Request reset | `backend/src/services/passwordResetService.ts` → `requestPasswordReset()` | `randomToken()` + `sha256Hex()`, row in `password_reset_tokens`, 1 h TTL, emails a raw `<p><a href>` |
| Consume | same file → `resetPassword()` | Atomic `UPDATE … consumed_at … RETURNING user_id`; re-checks `deleted_at IS NULL`; returns a 7-day JWT |
| OAuth-only branch | same file | Sends a German "you have no password" mail, issues no token. **Must keep working.** |
| Email transport | `backend/src/services/emailService.ts` | One `fetch()` to Resend. `sendEmail(apiKey, to, subject, html)`. No `text` field, no templates, no localization. |
| Routes | `backend/src/routes/auth.ts:120-172` | `POST /forgot-password` (throttled `(ip, identifier)`, 5/15 min, always generic 200), `POST /reset-password` (**unthrottled**) |
| Schema | `database/migrations/0025_password_reset.sql` | `id, token_hash UNIQUE, user_id, expires_at, consumed_at, created_at` |
| Throttling | `backend/src/services/rateLimitService.ts` | D1 fixed window keyed `(route, ip, identifier)`. **Reads via `withSession("first-primary")`** — documented D1 replica-lag bug; any new counter read must do the same. |
| Frontend | `Pages/ForgotPassword.razor` (69 L), `Pages/ResetPassword.razor` (114 L) | Plain `EditForm` + `DataAnnotationsValidator`. Mismatch is checked **only in `SubmitAsync`**. No live feedback anywhere. |
| Third entry point | `Pages/Profile.razor` | "Passwort-Reset-Link senden" button (moved there 2026-09-26), calls `/forgot-password` with the known email, shows a toast |
| Dialogs | `Components/{ConfirmDialog,AvatarUploadDialog,FollowListDialog}/` | Three near-identical implementations: same overlay CSS (`position:fixed; inset:0; z-index:100; rgba(0,0,0,.5)`), same `_wasOpen` + `FocusAsync()`, same Escape handler, same `@onclick:stopPropagation`. **None sets `aria-labelledby`. None locks body scroll. None traps focus.** |
| Toasts | `Components/ToastHost/` + `Services/ToastService.cs` | `ToastService.Show(text, ToastKind)`, host mounted once in `MainLayout`, `z-index: 900` (above dialogs at 100 — correct, a toast from a dialog is visible) |
| Tokens | `wwwroot/Styles/tokens.css` | 8-px spacing scale, type scale, `--radius` 6 / `--radius-lg` 10, `--shadow-card` / `--shadow-card-hover`, `--motion-micro/standard/reveal` + `--ease-standard` |
| Themes | `wwwroot/Styles/themes/*.css` | 4 themes (`classic-library` default, `dark-library`, `modern-light`, `system`). **All colors must come from vars.** |
| CPU budget | `backend/src/utils/crypto.ts` | Workers Free plan, 10 ms CPU/request. `PBKDF2_ITERATIONS = 8000` — deliberately below OWASP. No room for an expensive KDF on the code. |
| Locale | `database/migrations/0001_initial.sql` | `user_settings.language TEXT NOT NULL DEFAULT 'de'` — **exists and is unused by the backend emails today** |

---

## 3. Code vs. link — recommendation and backend design

### 3.1 The recommendation

**A hybrid on a single row: one `password_reset_tokens` row carries both a
6-digit code and the existing 256-bit link token. Either credential consumes the
row. One TTL (20 min). The code — and only the code — carries a per-row attempt
counter.**

Reasoning, in the order the tradeoffs actually bite:

1. **A code is what the user asked for and it's the better primary path.** It
   crosses devices (mail on the phone, app on the desktop) without a
   copy-paste-a-URL dance, and it keeps the user inside the dialog, which is the
   whole point of the redesign.

2. **A code alone is a real downgrade in credential strength.** 10⁶ keyspace vs.
   2²⁵⁶. Without a hard cap, a script gets through in minutes. The *entire*
   security of this design therefore rests on the attempt cap — not on the TTL,
   not on IP rate limiting.

3. **IP-keyed rate limiting is the wrong axis for this.** `rateLimitService.ts`
   keys `(route, ip, identifier)`. An attacker rotating IPs (trivial) walks
   straight past it. The defense has to live **on the token row**, where the
   attacker can't move: `attempt_count`, incremented atomically on every check,
   row dead at N. IP throttling stays as a cheap outer backstop against
   *spraying many identifiers*, not as the brute-force defense.

4. **Dropping the link costs more than keeping it.** The link is one extra column
   and zero extra endpoints (the code path reuses the same row). Dropping it
   breaks `/reset-password?token=`, every email already in a user's inbox, and
   `ResetPasswordPageTests.cs`. Keeping it also gives us a clean answer for the
   same-device case: one tap, no typing.

5. **Why not two rows (one per credential)?** Then "consume one, invalidate the
   other" is a second statement and a race. One row = the existing atomic
   `UPDATE … RETURNING` already guarantees both credentials die together.

**Rejected: 8-char alphanumeric.** 36⁸ ≈ 2.8×10¹² is much stronger, but it kills
`autocomplete="one-time-code"` / iOS+Android OTP autofill, invites O/0 and I/1/l
confusion, and is unpleasant to read off a phone. With a hard cap of 10, 6 digits
is *already* safe; the extra entropy buys nothing the cap doesn't.

**Rejected: "verify mints a short-lived ticket, final submit uses the ticket."**
That needs a second credential type, a second table or column, and its own
expiry. The simpler shape: the client keeps the code in memory and **re-sends it
with the final submit**, which is the only moment the row is consumed. Nothing
forbids this, so we do the simple thing.

### 3.2 Schema — `database/migrations/0026_password_reset_code.sql`

```sql
-- 0026_password_reset_code.sql
-- Adds the short human-typeable code to the existing link-token row
-- (0025_password_reset.sql). One row carries BOTH credentials; consuming
-- via either kills both. See
-- docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md §3.
--
-- code_hash is an HMAC-SHA256 (keyed with a Worker secret), NOT a plain
-- sha256Hex like token_hash: token_hash covers a 256-bit random value where
-- a preimage search is hopeless, code_hash covers a 10^6 keyspace that a
-- plain SHA-256 dump reverses in milliseconds.
--
-- attempt_count is the real brute-force defense. The existing
-- auth_rate_limits table keys on (route, ip, identifier) and an attacker
-- rotating IPs walks straight past it; this counter lives on the row the
-- attacker is actually attacking and cannot be moved.
--
-- Nullable: rows created before this migration (and, if we ever want it, a
-- link-only reset) legitimately have no code.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE password_reset_tokens ADD COLUMN code_hash TEXT;
ALTER TABLE password_reset_tokens ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

-- Lookup is always scoped by user_id (a 6-digit code is NOT globally unique
-- — two concurrent resets can collide), so the useful index is on the
-- lookup key, not on code_hash alone.
CREATE INDEX idx_password_reset_tokens_user_live
    ON password_reset_tokens(user_id, consumed_at, expires_at);
```

> **Why no `UNIQUE` on `code_hash`:** SQLite can't add a unique constraint via
> `ALTER TABLE` anyway, but more importantly the code genuinely isn't unique.
> This is the reason every lookup below is `WHERE user_id = ? AND code_hash = ?`
> and never `WHERE code_hash = ?` — a global code lookup would let an attacker
> brute-force *any* account at once instead of one named account.

### 3.3 How the client identifies the account at the code step

The dialog must send *something* alongside the code. Two options:

- **(a) An opaque `requestId` returned by `/forgot-password`.** Requires the
  endpoint to return a handle even for non-existent users (a fabricated one),
  or it leaks existence. Extra column, extra plumbing.
- **(b) The identifier the user already typed.** ✅ **Recommended.**
  `findUserByIdentifier()` already exists. The dialog has the identifier in
  memory for the whole flow. Anti-enumeration is preserved because
  "no such user" and "wrong code" return the *byte-identical* response (§3.5).

Pick (b). If we ever want a "paste the code, don't retype your email" entry
point, (a) can be layered on later without touching the credential model.

### 3.4 Service surface — `passwordResetService.ts`

```ts
const CODE_TTL_SECONDS = 20 * 60;          // D2
const MAX_CODE_ATTEMPTS = 10;              // D4

// New in utils/crypto.ts:
//   randomNumericCode(6)  -> crypto.getRandomValues + rejection sampling
//                            (NOT `% 10` on a byte — that biases 0-5)
//   hmacSha256Hex(key, v) -> crypto.subtle HMAC, microseconds, fits the
//                            10ms CPU budget where PBKDF2 would not
```

**`requestPasswordReset(db, env, identifier)`** — unchanged contract (never
reveals whether a match was found), plus:

0. **60-second resend cooldown (D2, decided 2026-09-27, matches
   recipemaster.at's own behavior) — CORRECTED 2026-09-27, see below for why
   the first version of this step was a real bug.**

   Before doing anything else — before even looking up whether `identifier`
   matches a user — check the cooldown, **keyed purely on the submitted
   `identifier` string**, reusing the existing `auth_rate_limits` table
   (`0014_auth_rate_limit.sql`, already used for the 15-min/5-attempt
   `forgot-password` throttle) rather than querying `password_reset_tokens`
   by `user_id`:
   ```ts
   // New route key, ip = "" (identifier-only — see why below), 60s window, 1 attempt.
   await assertNotRateLimited(c, "forgot-password-resend", identifier); // throws RateLimitedError
   // ... only on success, i.e. once we're actually about to send:
   await recordFailedAttempt(db, "forgot-password-resend", "", identifier);
   ```
   If it throws, return the **same distinct "please wait ~N s" response for
   every identifier — existing account, non-existing account, or OAuth-only
   account alike** — before running the `findUserByIdentifier` lookup at all.

   **Why this had to change from the original draft**: the original version
   queried `password_reset_tokens` by `user_id`, which means it could only
   run *after* the user was already found — so an unknown identifier always
   fell through to the generic "if an account exists, an email was sent"
   response, while a known identifier hit twice inside 60s got the distinct
   "please wait" response instead. Submitting the same identifier twice and
   comparing the two responses would have **confirmed account existence** —
   exactly the enumeration attack §3.5/§9 claim this feature doesn't reopen.
   Keying on the raw identifier, checked first, closes that: the cooldown
   response is now identical regardless of whether an account is behind the
   identifier at all, so it carries no more signal than "you're submitting
   this form quickly," which is true of the form itself, not of any
   particular account.

   `ip = ""` (not the caller's real IP) is deliberate, matching `register`'s
   existing IP-independent bucket in the same table — this cooldown is about
   "was *this identifier* just requested," not "is this IP attacking,"
   and keying by IP as well would let an attacker bypass it by rotating
   IPs while probing, undermining the very symmetry this fix exists for.
   This is a **separate, additional** throttle from the existing 5-per-15-min
   `forgot-password` one — both apply; the 60s one is the fast, obvious "why
   is the resend button disabled" UX signal, the 5-per-15-min one is the
   actual abuse backstop.
0b. **Per-account cap (review H-1, added 2026-09-27 after the phases
   shipped).** Right after the user lookup, before step 1: record one
   attempt in `auth_rate_limits` under route `forgot-password-account`,
   `ip = ""`, identifier = the user id, and stop silently (generic 200, no
   mail) once it exceeds `RESET_EMAILS_PER_ACCOUNT_MAX = 5` per 24 h. Step 0
   alone did not bound anything per *account*: its key is the raw
   identifier, so alternating email and username (plus rotating IPs for the
   5-per-15-min throttle) yielded ~2 fresh codes a minute forever — 20
   guesses/min against one account and a matching mail flood. Running before
   step 1 means an over-cap request never invalidates the owner's
   last-received code/link. Silent rather than a 429 because this check runs
   after the lookup — a distinct response here would be the exact
   enumeration leak step 0 was redesigned to avoid.
1. Kill outstanding rows (**D6**):
   ```sql
   UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP
   WHERE user_id = ? AND consumed_at IS NULL
   ```
   Without this, N concurrent requests = N × 10 guesses.
2. Generate `rawToken` **and** `code`; store `sha256Hex(rawToken)` and
   `hmacSha256Hex(secret, code)` on one row with `attempt_count = 0`.
3. Look up `user_settings.language` (default `de`) and render the localized
   template (§5).
4. OAuth-only branch: unchanged behavior, but now rendered through the same
   template layout and localized. **Not exempt from the cooldown** — step 0
   already ran and recorded the attempt before this branch is reached, same
   as every other path; carving out an exception here would itself be a
   timing/response-shape signal that this identifier resolves to an
   OAuth-only account, which is exactly the kind of leak step 0 was just
   fixed to avoid. Re-sending this email quickly is harmless in isolation,
   but "harmless to re-send" and "safe to treat differently from the other
   branches" are not the same property.

**`verifyResetCode(db, env, identifier, code) → { valid, attemptsLeft }`** — new,
**non-consuming**. One statement, one round trip, always burns an attempt:

```sql
UPDATE password_reset_tokens
   SET attempt_count = attempt_count + 1
 WHERE id = (
     SELECT id FROM password_reset_tokens
      WHERE user_id = ?1
        AND consumed_at IS NULL
        AND julianday(expires_at) > julianday('now')
        AND attempt_count < ?3
      ORDER BY created_at DESC, id DESC
      LIMIT 1
   )
RETURNING (code_hash = ?2) AS matched, attempt_count;
```

Notes that are easy to get wrong:
- `julianday(...)`, not a text `>` comparison — the SQLite `CURRENT_TIMESTAMP`
  vs. `toISOString()` format mismatch is already documented (and already bit
  this codebase) in `0014_auth_rate_limit.sql` and `rateLimitService.ts`.
- `ORDER BY created_at DESC, id DESC` — the same tie-break shape as the recent
  `deleted_email` fix; `created_at` has second resolution and two rows can share it.
- The increment is unconditional (even on a match). A successful verify costs one
  attempt out of 10; that is fine and keeps the statement single-shot.
- **Any read-then-check of `attempt_count` outside this statement must go through
  `db.withSession("first-primary")`** — the D1 replica-lag failure documented in
  `rateLimitService.ts` (the counter incremented correctly but the check never
  saw it) applies verbatim here. The statement above avoids the problem by never
  reading separately; don't "optimize" it into two queries.

**`resetPassword(db, env, credential, newPassword)`** — `credential` is
`{ kind: "token", rawToken }` or `{ kind: "code", identifier, code }`.
Both end in the same atomic consume; the code variant additionally requires
`attempt_count < MAX_CODE_ATTEMPTS`. After the `UPDATE users SET password_hash`
**succeeds**, and only then, send the confirmation email (§4.6 / §5.2).

### 3.5 Routes

| Route | Change |
|---|---|
| `POST /api/auth/forgot-password` | Unchanged contract. Still always generic 200, still throttled `(ip, identifier)` 5/15 min. |
| `POST /api/auth/verify-reset-code` | **New.** Body `{ identifier, code }`. Always `200` with `{ valid: boolean, attemptsLeft: number }`. Throttled on a new route key `"verify-reset-code"`, `(ip, identifier)`, generous (e.g. 30/15 min) — an outer backstop against *spraying identifiers*, not the brute-force defense. |
| `POST /api/auth/reset-password` | Body becomes `{ token?, identifier?, code?, newPassword }`; exactly one credential required, else `VALIDATION_ERROR`. Now also throttled (`"reset-password"`, `(ip, identifier)`). `INVALID_RESET_TOKEN` still returned for invalid/expired/consumed/locked. |

**The anti-enumeration rule for `/verify-reset-code`:** the response for
*no such user*, *no live code*, *code locked*, and *wrong code* must be
byte-identical. Concretely: when there is no usable row we return
`{ valid: false, attemptsLeft: 0 }`, the same thing a burned-out code returns.
Do **not** add a distinct `CODE_LOCKED` error code, however tempting — an
attacker who can see `locked` vs. `wrong` learns the account exists. The UI
copes fine: `attemptsLeft: 0` renders as "Code ungültig — fordere einen neuen an",
which is true and actionable in both cases.

One field-shape note so nobody "fixes" it later: on `valid: true` the response
still carries `attemptsLeft` (the statement increments unconditionally). The
client ignores it. Keeping the shape uniform is deliberate — a response whose
*field set* varies with the outcome is exactly the side channel this endpoint is
built to avoid.

---

## 4. The dialog flow

### 4.1 Three entry points, one component

Turning this into a popup does **not** delete the routes. The component takes
`InitialStep`, `InitialIdentifier`, `LinkToken`:

| Entry | Opens at | Params |
|---|---|---|
| `Login.razor` — "Passwort vergessen?" | `Identify` | — |
| `Profile.razor` — password-reset button | `Identify`, with the field pre-filled | `InitialIdentifier = <own email>` |
| `/reset-password?token=…` (emailed link) | `PasswordEntry` | `LinkToken = <token>` — the code steps are skipped entirely, the token *is* the proof |
| `/forgot-password` (bookmark, old email) | `Identify` | — |

**CORRECTED 2026-09-27, live review after Phase 3 shipped**: the Profile row
originally skipped straight to `CodeEntry` and auto-fired the request, on the
reasoning that Profile already knows the user's email so there was nothing left
to ask for. Live-tested, this read as broken rather than as a shortcut: the user
saw the dialog jump straight to "check your email" with no visible confirmation
of *which* email, and the step rail displayed a "1 E-Mail" segment that was never
actually shown in that session. Fixed by having `InitialIdentifier` only
pre-fill the field — Identify is never skipped, the request only fires once the
user submits it themselves, same as `Login.razor`'s flow. `LinkToken` still
skips both `Identify` and `CodeEntry` (the token really is a different kind of
proof, not just a filled-in field), and the step rail is hidden entirely for
that flow rather than showing a misleading 3-segment rail for a single-step
session.

`ForgotPassword.razor` and `ResetPassword.razor` shrink to thin shells: parse the
query string, render `<PasswordResetDialog IsOpen="true" … />`, navigate home on
close. The **routes** survive — that's D14's whole point (bookmarks, and every
reset email already sitting in an inbox).

**Their tests do not survive as-is, and the plan must budget for that.**
`ForgotPasswordPageTests.cs` asserts against an `EditForm` with `id="identifier"`
that terminates in a static success paragraph; `ResetPasswordPageTests.cs` asserts
against `id="newPassword"` / `id="confirmPassword"` and against a page-level
`_invalidToken` branch that **ceases to exist** (invalid tokens now drop back into
the dialog's `CodeEntry` step, §4.5). Both files get rewritten in Phase 3, not
merely carried over. `LoginPageTests.cs` and `ProfilePageTests.cs` also change:
the link/button they assert on stops navigating and starts opening a dialog.

### 4.2 State machine

```
                     ┌──────────┐
                     │  Closed  │
                     └────┬─────┘
                          │ open
             ┌────────────▼────────────┐
             │        Identify         │  identifier field, submit
             └────────────┬────────────┘
                 POST /forgot-password
          ┌───────────────┼────────────────────┐
     429 RateLimited      │ 200 (always)       │ network error
          │               ▼                    │
          │      ┌─────────────────┐           │
          └─────►│    CodeEntry    │◄──────────┘   (inline error, stay put)
                 │  ┌───────────┐  │
                 │  │  Idle     │  │  6 digits complete + 400 ms debounce
                 │  │  Checking │  │  ──► POST /verify-reset-code
                 │  │  Invalid  │  │  ◄── valid:false  (attemptsLeft shown ≤3)
                 │  │  Valid ✓  │  │  ◄── valid:true   → 450 ms hold → advance
                 │  │  Burned   │  │  ◄── attemptsLeft:0 → "neuen Code anfordern"
                 │  └───────────┘  │
                 │  "Code erneut   │  always visible in CodeEntry; disabled with
                 │   senden" (60s  │  a live countdown for 60s after every send
                 │   cooldown, D2) │  (request AND each resend) — matches
                 │                 │  recipemaster.at's own cooldown (D2, decided
                 │                 │  2026-09-27). A resend inside the cooldown
                 │                 │  gets the same distinct "please wait ~N s"
                 │                 │  response §3.4 step 0 defines — shown inline,
                 │                 │  not as a dialog-closing error.
                 └────────┬────────┘
                          │ auto-advance
             ┌────────────▼────────────┐
             │      PasswordEntry      │  new + confirm, live rules
             └────────────┬────────────┘
                 POST /reset-password   (re-sends identifier+code, or token)
          ┌───────────────┼────────────────────┐
   INVALID_RESET_TOKEN    │ 200                │ network / 5xx
          │               ▼                    │
   back to CodeEntry  ┌────────┐          inline error,
   ("Code abgelaufen")│Success │          button re-enabled,
                      └───┬────┘          password fields KEPT
                          │ JWT stored, toast shown
                          ▼
                       Closed  → navigate "/"
```

**Step indicator.** A 3-dot / 3-segment progress rail at the top of the dialog
(`1 E-Mail · 2 Code · 3 Neues Passwort`) with the completed segments filled in
`--color-primary`. Cheap, and it's the single element that makes a multi-step
popup read as designed rather than as a form that keeps changing.

**Back navigation.** `PasswordEntry` has no "back" — going back would mean
re-verifying, and the code is already half-spent. `CodeEntry` has a tertiary
"Andere E-Mail-Adresse" link back to `Identify`. Escape / overlay click closes the
dialog from `Identify` and `CodeEntry` freely; from `PasswordEntry` and
`Submitting` **overlay-click and Escape are disabled** (the user has typed a
password they'd lose, and mid-submit dismissal is how you get a half-done reset in
the user's mental model). Only the explicit ✕ closes there, and it asks
"Vorgang abbrechen?" via the existing `ConfirmDialog`. — This per-step
`CloseOnOverlayClick` is a concrete requirement on the shared primitive (§6.1).

### 4.3 Live validation, step 2 (the code) — precise

This is the seam where "live feedback" and "brute-force resistant" fight, so it's
specified exactly:

- **Input control:** **one** text input, not six boxes.
  `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="7"`,
  `pattern="[0-9 ]*"`, styled with `letter-spacing: 0.4em` and a large font so it
  *reads* segmented. Six separate boxes need JS focus-shuttling, break paste,
  break Android/iOS OTP autofill, announce as six unlabeled fields to screen
  readers, and fight Blazor's two-way binding. The segmented look is not worth
  any of that.
- **Normalization:** strip everything that isn't a digit before counting or
  sending, so a pasted `482 913` works. Do **not** rewrite the field's own value
  on `@oninput` (cursor-jump hell with Blazor binding); reformat on blur only,
  if at all.
- **Trigger:** on `@oninput`, when `digits.Length == 6` **and** `digits !=
  _lastCheckedCode` **and** no check is in flight → start a **400 ms** debounce
  (`CancellationTokenSource`, cancelled and restarted by any further keystroke).
  On paste the same path fires once, ~400 ms after the paste.
- **De-duplication is mandatory, not polish.** `_lastCheckedCode` guarantees one
  server attempt per *distinct* 6-digit value. Without it, deleting and retyping
  the last digit re-fires the same value and burns the budget for nothing.
- **Checking:** a small inline spinner at the right edge of the field
  (`--motion-spinner`), field stays editable, "Weiter" disabled.
- **Valid:** field border → `--color-success`, check icon fades in
  (`--motion-micro`), `aria-live="polite"` announces "Code bestätigt", then a
  **450 ms** hold, then advance. The hold exists so the confirmation is perceived;
  without it the step change looks like a glitch.
- **Invalid:** border → `--color-error`, inline message under the field
  ("Der Code stimmt nicht."), field content **selected** so retyping replaces it
  in one gesture. No shake animation — it reads cheap and it's exactly the kind of
  motion the `prefers-reduced-motion` blocks in `app.css` exist to suppress.
- **Attempts remaining:** shown **only when `attemptsLeft <= 3`**
  ("Noch 2 Versuche"), in `--color-warning`. Showing "9 von 10" from the first
  mistake is anxiety-inducing and tells an attacker the budget for free.
- **`attemptsLeft == 0`:** the field is replaced by a small panel —
  "Dieser Code ist nicht mehr gültig." + primary button "Neuen Code anfordern"
  (returns to `CodeEntry` with a fresh request; identifier retained).
- **Resend:** a "Keine E-Mail erhalten? Erneut senden" link under the field, with
  a **60 s** client-side countdown after each send. The real gate is the existing
  server-side `(ip, identifier)` throttle; the countdown just stops the user from
  hammering into a 429.

### 4.4 Live validation, step 3 (the passwords) — precise

Two fields, both with `@oninput` (not `@onchange` — the default Blazor
`InputText` binding fires on *change*, i.e. blur, which is precisely the
"only on button click" behavior being replaced).

**New password** — rules evaluated on every keystroke, no debounce (pure client
work, free). Render a compact rule list, each row a dot → check:

- `Mindestens 8 Zeichen` — mirrors `MIN_PASSWORD_LENGTH` in `auth.ts`.
  **This is the only blocking rule**, because it's the only rule the backend
  actually enforces. Do not invent client-side rules the server doesn't share;
  that's how you get a form that rejects a password the API would accept.
- An **advisory** strength bar (length + character-class variety, computed
  locally, no library) in `--color-error` / `--color-warning` / `--color-success`.
  Labelled "Stärke", never blocks submission.

**Confirm password** — this is where naive implementations feel broken. The rule:

- **Never** show "stimmt nicht überein" while the user is plausibly still typing.
  Concretely, show the mismatch only when *any* of: `confirm.Length >=
  newPassword.Length`, **or** the confirm field has blurred, **or** 600 ms have
  passed since the last keystroke in it. (The first condition carries almost
  every real case and costs nothing.)
- Show "stimmt überein" ✓ in `--color-success` **immediately** when the two are
  equal and non-empty — positive feedback has no reason to wait.
- Editing the *first* field re-evaluates the match live too (the common
  "fix a typo in the top field" case), but re-applies the same
  don't-shout-too-early rule.
- Both messages live in one `aria-live="polite"` region under the confirm field,
  so the state change is announced once, not per keystroke.

**Submit button** is disabled until `length >= 8 && newPassword == confirm`.
Disabled-with-a-reason: the rule list above already says *why*, so this isn't a
dead end.

### 4.5 Error surfacing — the whole table

| Condition | Where it appears | Tone |
|---|---|---|
| Wrong code | Inline under the code field + red border | Quiet, correctable in place |
| Code burned / expired | Replaces the field with a panel + "Neuen Code anfordern" | Recovery-first, no dead end |
| `429` on request/resend | Inline above the identifier field: "Zu viele Versuche. Bitte in N Minuten erneut versuchen." (from `Retry-After`) | Dialog stays open, nothing lost |
| Password too short / mismatch | The live rule list — never a banner | Pre-emptive, not punitive |
| `INVALID_RESET_TOKEN` on final submit | Drop back to `CodeEntry` with "Der Code ist abgelaufen" | The only legitimate backwards transition |
| Network / 5xx on final submit | Inline error above the buttons, button re-enabled, **password fields preserved** | Never destroy typed input |
| Success | Success panel inside the dialog *and* a `ToastService.Show(..., Success)` that survives the close+navigate | Two signals, as the existing `ToastService` doc-comment prescribes (`await Task.Yield()` before `NavigateTo`) |

The uniform principle: **errors appear next to the thing that caused them and
never dismiss the dialog.** The one banner-shaped error (`429`) is the one that
isn't attached to a single field.

### 4.6 Success step & the second email

`Success` shows: a check mark, "Dein Passwort wurde geändert.", and one line of
supporting copy — "Wir haben dir eine Bestätigung an m•••@example.com
geschickt." (masked). A single primary button "Weiter zur Bibliothek", plus an
auto-close after 3 s. The JWT is stored before the panel renders, so the user is
already logged in while reading it.

The confirmation email is sent **server-side, after `UPDATE users SET
password_hash` returns**, wrapped in `try/catch` that logs and swallows. A Resend
outage must never fail a reset whose password write already committed. (Optional:
`c.executionCtx.waitUntil()` to move the send off the response path; only worth it
if the added latency is measurable — CPU time, which is the 10 ms budget, is
unaffected either way since it's an awaited `fetch`.)

---

## 5. Email design

### 5.1 Constraints that shape the markup

- **No external stylesheets, no `var()`.** Email clients don't resolve CSS custom
  properties, so the tokens have to be **hardcoded hex values copied from
  `classic-library.css`**, with a source comment saying so. A drift-checking unit
  test is overkill; a comment naming the source file is not.
- **`<style>` blocks are unreliable** (Gmail's app strips them for non-Gmail
  accounts). Everything structural must be **inline styles on table cells**.
  A `<style>` block is still worth adding for a `prefers-color-scheme: dark`
  enhancement — but the inline light palette has to stand completely alone.
- **Table layout.** Outlook still renders through Word's engine; `flex`/`grid`
  and `max-width` on `<div>` are unreliable. Nested `<table role="presentation">`
  with a fixed 600 px content width is still the safe shape in 2026.
- **Images are blocked by default in many clients.** ⇒ **The code must be live
  text, never an image**, and the email must read correctly with images off
  (hence real `alt` on the logo).
- **The logo asset doesn't exist yet.** `branding/logo-mark.svg` is SVG (Gmail
  strips SVG), `images/Logo.png` is **1.6 MB**. Deliverable: export a ~200 px-wide
  PNG (~15 KB) to `wwwroot/images/email-logo.png`, referenced as
  `${FRONTEND_URL}/images/email-logo.png` — **derived from `FRONTEND_URL`, never
  hardcoded**, because the `luminachronica.com` switch is still pending.
- **Send a plain-text part.** `sendEmail()` currently posts only `html`. Add an
  optional `text` parameter → Resend's `text` field. HTML-only mail scores worse
  in spam filters, and the code must be readable in a text-only client.
- **Escape everything interpolated.** The reset URL is our own token, but the
  moment a username or email goes into a template it's an injection vector. Add
  `escapeHtml()` to the email module and use it on every interpolation.

### 5.2 Module layout

```
backend/src/emails/
  layout.ts               renderEmailLayout({ lang, previewText, heading, bodyHtml, footerNote })
  strings.ts              de/en copy for all templates, flat keys (mirrors the frontend i18n convention)
  passwordResetCode.ts    → { subject, html, text }
  passwordChanged.ts      → { subject, html, text }
  oauthNoPassword.ts      → { subject, html, text }   (migrates today's inline string)
  escapeHtml.ts
```

`emailService.sendEmail(apiKey, to, subject, html, text?)`.

### 5.3 HTML sketch — password-reset code email

Colors below are the `classic-library` values verbatim:
paper `#f2e9d8`, card `#fbf6ec`, border `#dccba8`, ink `#241a12`,
secondary ink `#5c4a37`, muted `#8a7660`, brass `#8c6a24`.
Fraunces isn't available in email, so the heading falls back to Georgia — which
is already `--font-family-display`'s own fallback, so the two don't diverge.

```html
<!-- preheader: the grey preview line next to the subject in the inbox -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Dein Bestätigungscode: 482 913 — 20 Minuten gültig.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:#f2e9d8;margin:0;padding:32px 0;">
  <tr>
    <td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background-color:#fbf6ec;
                    border:1px solid #dccba8;border-radius:10px;overflow:hidden;">

        <!-- Logo band -->
        <tr>
          <td align="center" style="padding:32px 32px 8px 32px;">
            <img src="{{FRONTEND_URL}}/images/email-logo.png"
                 width="140" alt="Lumina Chronica"
                 style="display:block;border:0;width:140px;height:auto;" />
          </td>
        </tr>

        <!-- Heading -->
        <tr>
          <td align="center"
              style="padding:8px 32px 0 32px;font-family:Georgia,'Times New Roman',serif;
                     font-size:26px;line-height:1.15;color:#241a12;font-weight:600;">
            Passwort zurücksetzen
          </td>
        </tr>

        <!-- Lede -->
        <tr>
          <td align="center"
              style="padding:16px 40px 0 40px;font-family:-apple-system,'Segoe UI',
                     Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;
                     color:#5c4a37;">
            Gib diesen Code in Lumina Chronica ein, um ein neues Passwort zu setzen.
          </td>
        </tr>

        <!-- THE CODE -->
        <tr>
          <td align="center" style="padding:24px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center"
                    style="background-color:#f2e9d8;border:1px solid #dccba8;
                           border-radius:10px;padding:18px 32px;
                           font-family:'SFMono-Regular',Consolas,'Liberation Mono',
                                       Menlo,monospace;
                           font-size:34px;line-height:1.2;font-weight:700;
                           letter-spacing:10px;text-indent:10px;color:#241a12;">
                  482913
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Validity -->
        <tr>
          <td align="center"
              style="padding:4px 32px 0 32px;font-family:-apple-system,'Segoe UI',
                     Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#8a7660;">
            Der Code ist 20 Minuten gültig.
          </td>
        </tr>

        <!-- Fallback link (bulletproof-ish button) -->
        <tr>
          <td align="center" style="padding:28px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#8c6a24" style="border-radius:6px;">
                  <a href="{{RESET_URL}}"
                     style="display:inline-block;padding:12px 28px;
                            font-family:-apple-system,'Segoe UI',Roboto,Helvetica,
                                        Arial,sans-serif;
                            font-size:15px;font-weight:600;color:#fbf6ec;
                            text-decoration:none;border-radius:6px;">
                    Direkt im Browser zurücksetzen
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Not-you note -->
        <tr>
          <td align="center"
              style="padding:28px 40px 32px 40px;font-family:-apple-system,'Segoe UI',
                     Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;
                     color:#8a7660;border-top:1px solid #dccba8;">
            Du hast das nicht angefordert? Dann ignoriere diese E-Mail —
            ohne den Code bleibt dein Passwort unverändert.
          </td>
        </tr>
      </table>

      <!-- Outside-the-card footer -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;">
        <tr>
          <td align="center"
              style="padding:20px 32px;font-family:-apple-system,'Segoe UI',Roboto,
                     Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;
                     color:#8a7660;">
            Lumina Chronica · <a href="{{FRONTEND_URL}}/impressum"
               style="color:#8c6a24;text-decoration:underline;">Impressum</a>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
```

Details worth keeping when this gets implemented:

- `letter-spacing: 10px` **plus `text-indent: 10px`** — letter-spacing adds
  trailing space after the last glyph, which visually off-centers the code inside
  its box. The matching indent cancels it. (Classic, and easy to miss.)
- The code is rendered `482913` (no space) so *select-all → copy* yields exactly
  what the field wants; the letter-spacing supplies the visual grouping. The
  preheader shows `482 913` because that's for reading, not copying.
- Monospace for the code: digits stay on a fixed grid, `1` doesn't collapse.
- The fallback link is a **secondary** action, placed below the code and after a
  visual break — the code is the headline, per the user's request.
- Every `<td>` carries its own font styling; email clients don't inherit reliably.

Plain-text part:

```
Passwort zurücksetzen — Lumina Chronica

Dein Code: 482 913
Gültig für 20 Minuten.

Lieber direkt im Browser? {{RESET_URL}}

Du hast das nicht angefordert? Ignoriere diese E-Mail —
ohne den Code bleibt dein Passwort unverändert.
```

### 5.4 Confirmation email ("your password was changed")

Same layout module, different payload. Copy, with two things deliberately **not**
said:

> **Dein Passwort wurde geändert**
>
> Das Passwort für dein Lumina-Chronica-Konto wurde am 27. September 2026 um
> 14:32 Uhr (UTC) geändert.
>
> Warst du das nicht? Dann schreib uns bitte umgehend an
> [luminachronica@gmx.at](mailto:luminachronica@gmx.at) — und setze dein
> Passwort erneut zurück, solange du noch Zugriff auf dieses E-Mail-Postfach
> hast.

- **It must not say "you were signed out on all devices."** This app has no
  session table and no JWT blocklist (explicitly out of scope in the 2026-09-26
  spec); existing 7-day tokens keep working. Writing that sentence would be a lie
  with security consequences.
- **It must not link to a support address that doesn't exist** — the user
  confirmed `luminachronica@gmx.at` is a real, already-owned mailbox
  (**D8**, decided 2026-09-27), so this is a real `mailto:` contact, not a
  placeholder. Worth reusing this same address anywhere else in the app that
  wants a "contact us" line.
- No code, no reset link, no token. Nothing in this email is a credential, which
  is also why it's safe to send it even if the address was hijacked.
- Timestamp only. No IP or user-agent — neither is plumbed into the service
  today, and half-accurate "from Vienna, Austria" lines are worse than none.

Subject: `Lumina Chronica: Dein Passwort wurde geändert` /
`Lumina Chronica: Your password was changed`.

### 5.5 Localization

Read `user_settings.language` for the target user (`de` default; the column
exists and is currently unused by the backend). The dialog also knows the active
UI language — but the *email* should follow the account setting, not the browser
of whoever typed the identifier, precisely because the requester may not be the
account owner. Both locales get drafted in `emails/strings.ts` at the same time;
there is no "English later" phase, the strings are four short templates.

For completeness, the three branches of `requestPasswordReset()`:
**no match** → no email at all, so the question never arises;
**OAuth-only account** → same `user_settings.language` lookup, same default;
**normal account** → same. A user with no `user_settings` row falls back to `de`.

---

## 6. App-wide dialog convention

### 6.1 A shared primitive is warranted — build `Components/Dialog/`

The evidence is direct: `ConfirmDialog`, `AvatarUploadDialog` and
`FollowListDialog` duplicate, character for character, the overlay CSS
(`position:fixed; inset:0; z-index:100; display:flex; …; rgba(0,0,0,0.5)`), the
card CSS, the `_wasOpen` + `OnAfterRenderAsync` → `FocusAsync()` dance, and the
`HandleKeyDownAsync` Escape handler. Three copies is where a primitive stops
being speculative. And all three share the same three **defects**, which is the
better argument: none sets `aria-labelledby`, none locks body scroll (the page
behind scrolls under the overlay), none traps Tab.

```
Components/Dialog/
  Dialog.razor        overlay + card + optional header (title, ✕) + body slot + footer slot
  Dialog.razor.cs     IsOpen, Title, TitleId, Size, Role, CloseOnOverlayClick,
                      CloseOnEscape, ShowCloseButton, OnClose, ChildContent, Footer
  Dialog.razor.css
```

Design notes that matter for it to actually be reusable:

- **`Size`**: `Small` (24rem — today's default), `Medium` (32rem), `Large`
  (48rem), `Sheet` (right-anchored, full height, max 40rem, full-screen below
  the mobile breakpoint). `Sheet` is what makes §6.3 possible.
- **`CloseOnOverlayClick` / `CloseOnEscape` must be parameters**, not baked in —
  the password dialog needs them off at `PasswordEntry` (§4.2), and a destructive
  confirm arguably wants Escape-only.
- **`aria-labelledby`** wired to an auto-generated id on the rendered title.
  `Role` stays configurable (`alertdialog` for confirms, `dialog` otherwise) —
  both are already used in the codebase and the distinction is correct.
- **Body scroll lock** via a tiny JS module (`wwwroot/js/dialog.js`, matching the
  existing `theme.js` / `motion.js` / `shelf-physics.js` interop pattern) that
  toggles `overflow:hidden` on `<html>`, ref-counted for nested dialogs. Guard
  the interop call so bUnit (no JS runtime) doesn't blow up.
- **Scoped-CSS trap:** `Dialog.razor.css` cannot style markup passed in as
  `ChildContent` without `::deep`. Solve it structurally instead — **Dialog owns
  the `.dialog-header` / `.dialog-body` / `.dialog-actions` wrappers** and
  consumers only pass content *into* them. Then scoped CSS works with no `::deep`
  and consumers can't drift on padding.
- **Focus:** initial focus on the card (today's "trap-lite"), plus scroll lock.
  A real Tab trap is **D11**; if we take native `<dialog>` + `showModal()` later
  we get the trap, background `inert`, and Escape for free, at the cost of interop
  and a different overlay-click contract (`::backdrop` + click-target test).
- **Do not refactor the three existing dialogs in this change.** Ship
  `Dialog` under the password-reset flow first, let it prove itself on the
  hardest case (multi-step, conditional dismissal), then migrate the other three
  in a separate, boring PR.
- **Layering:** keep dialogs at `z-index: 100`. Toasts are at `900` and
  `#blazor-error-ui` at `1000` — that order is already correct (a toast fired
  from inside a dialog must be visible).

### 6.2 Where the line is

**Dialog** when *all* of these hold:

- single purpose, resolvable in one sitting;
- roughly ≤ 6 fields, or a single decision;
- the URL has no value to anyone — nobody bookmarks it, nobody shares it;
- no long-running upload that an accidental dismissal would kill;
- it's a *side action* from a context worth keeping on screen behind it.

**Page** when *any* of these hold:

- it's deep-linkable or shareable (`/book/123`, `/u/name`, `/project/7`);
- it's a workspace with multiple sections and its own sub-navigation;
- it carries a long upload or long-running work;
- browser back/refresh is a meaningful part of using it;
- it's the destination of a nav-menu entry.

### 6.3 Applying the line — concretely, for the flows the user named

**Book add / upload — `Pages/BookUpload.razor`, 685 lines. Keep it a page.**
I read it before forming this opinion. It carries: 11 metadata fields, an ISBN
lookup row, a free-text enrichment search with a **result list**, an
apply/discard enrichment preview panel, a 50 MB file dropzone, a cover dropzone,
plus `LoadingIndicatorMode.Fullscreen` during the upload. Wrapping that in a
modal would mean a modal that (a) must forbid overlay-click and Escape for its
entire lifetime — at which point it's a page wearing a costume, (b) contains a
scrolling result list inside a scrolling body inside an overlay, and (c) can
destroy a 50 MB in-flight upload on a misclick. A page is the right container
here, and "Buch hinzufügen" is a legitimate nav destination.

*The compromise worth building:* a small **chooser dialog** on the "Buch
hinzufügen" button — "Datei hochladen · ISBN suchen · Manuell anlegen" — which
routes onward. That's the modern pattern (the dialog is the *entry*, not the
form), it's ~40 lines, and it gives the polished first impression the user is
asking for without pretending a 685-line form is a popup.

**CORRECTED 2026-09-27, implementation of Phase 4 item 19:** "routes onward"
above assumed three distinct destinations existed for the three options to
route to. They don't — `BookUpload.razor` is a single page that already
handles file upload, ISBN lookup, and manual entry together, in one combined
form. All three chooser options navigate to the same `library/upload`; the
value is the labeled entry moment itself (the "polished first impression"),
not a router. No `?mode=` query param or auto-focus behavior was added to
manufacture a distinction the page doesn't have.

**Book edit — `BookDetail.razor` lines 202-360. UPDATED: make it a wide centered
modal, not a sheet.** Today it's the worst of both worlds: the edit form
*replaces* the book detail inline, so you lose the content you were editing
against, and you still get no URL for it. It's ~14 fields plus the cover
dropzone plus the same enrichment panel. I originally called that too much for
a 24rem centered dialog and reached for a right-side sheet instead — but a live
check of recipemaster.at's own recipe-edit dialog (§7.1a) shows that reasoning
was wrong: it fits a comparable-or-larger field set (including two *dynamic*
add/remove list sections, which BookDetail's edit form doesn't even have) into
one centered modal by simply widening it and scrolling the body, not by
switching container types. Concretely: `<Dialog Size="Large">` (48rem — already
defined in §6.1's size scale, no new size needed) with a scrollable body, a sticky header
(title + ✕), and a sticky footer holding Speichern/Abbrechen — same shape as
recipemaster's "Rezept bearbeiten" dialog. `CloseOnOverlayClick="false"` (typed
data), ✕ asks for confirmation if the form is dirty. Keep `Dialog Size="Sheet"`
in the primitive's API regardless (§6.1) — it's still the right shape for
something genuinely navigational/persistent, just not this. This is a real
improvement, not a reskin.

**Straightforwardly dialogs** (short, single-purpose, no URL value):
shelf create/rename, project create, "add to shelf", rating, comment edit,
book visibility/sharing, and every destructive confirm (which should all route
through `ConfirmDialog` — worth a grep for any remaining inline button-row swaps
or `window.confirm`).

**Straightforwardly pages:** `ProjectDetail` (1354 L — a workspace),
`Reader` (872 L), `Library` (539 L), `BookDetail`, `PublicProfile`, `Settings`,
`Profile`, `Statistics`, `Discover`. Character/location/lore *detail* stay pages;
their *create* forms are dialog candidates — but check the field count of each
before committing, I didn't read them.

---

## 7. Aesthetic direction

### 7.1 On recipemaster.at — plainly

My first pass (a plain HTTP fetch) got nothing: it's a client-rendered shell,
only the brand name and a skip link came back statically. **Corrected 2026-09-27,
same day**: a live browser session (already authenticated as the user, in their
own Chrome profile) rendered it properly and I looked at three real screens —
see §7.1a below for what that actually showed and how it changes §6.3/D12.

The overall aesthetic reads as: **dark theme by default** (near-black
`#0b0d0c`-ish background, not a pure black), a single confident green accent
(primary CTA buttons, numbered step badges, category pills), generous
whitespace, soft/near-invisible borders rather than heavy shadows, small-radius
rounded cards, and a restrained, utilitarian type scale — headings are barely
larger than body text, weight does the differentiation, not size. Nothing here
is exotic; it maps cleanly onto tokens the app already has (§7.2), it just
confirms the *proportions* (whitespace-heavy, low-contrast borders, accent used
sparingly not everywhere) rather than inventing them from an archetype.

### 7.1a What I actually saw (live-checked, not inferred)

Three screens, logged in as the user:

- **Dashboard** (`/#/`): a greeting header ("Guten Morgen, Matthias" + date),
  a large "today" card with an empty state (icon + message + one CTA button —
  structurally identical to this app's own `EmptyState` component), a
  secondary "this week" list card, and a right-hand sidebar stacking two small
  stat cards ("Einkaufsliste", "Bibliothek: 2 Rezepte / 0 Gespeichert" — reads
  exactly like this app's `StatCard`). Confirms the existing card/stat-card
  vocabulary is already the right shape; nothing new to invent there.
- **Recipe detail** (`/#/rezepte/9`): large rounded hero image, a category
  pill above the title, a compact metadata row (Zeit/Portionen/
  Schwierigkeit/Kalorien — same shape as `BookDetail`'s genre/language/
  publisher grid), three icon+label action buttons in a row (Speichern /
  Teilen / Bearbeiten), an ingredients checklist card with per-item icons, and
  numbered preparation steps with filled circular numerals (green). This is
  very close to `BookDetail`'s existing layout instinct already — validates
  the current direction more than it changes it.
- **Recipe edit** (click "Bearbeiten" on the detail page): opens a **centered
  modal dialog**, not a page and not a side-sheet. Title + ✕ in a fixed
  header; a scrollable body containing ~14 fields worth of content (title,
  description textarea, category dropdown, time/portions/difficulty inputs,
  image upload with a preview thumbnail + "Anderes Bild"/"Entfernen", a video
  upload with the same pattern, a **dynamic** ingredients list — one text row
  per ingredient with a ✕ to remove and a "+ Zutat hinzufügen" to add — and a
  **dynamic** numbered steps list with the same add/remove pattern); a fixed
  footer with Abbrechen (plain) / Änderungen speichern (filled green primary).
  This directly overturned my earlier D12 recommendation — see §6.3.

**Follow-up pass, same day**: also checked Profil (account settings), Einstellungen
(app settings), the login page, "Passwort vergessen", and "Problem melden"
(feedback) — the user asked directly whether I had, and these are more relevant
to this doc than the recipe pages above.

- **Login** (`/#/login`): a **dedicated page**, not a dialog — centered card,
  logo+wordmark above it, title+subtitle, email/password fields, a "Passwort
  vergessen?" link inline in the password field's label row (not a separate
  step), green primary button, an "oder" divider, a Google OAuth button, and a
  "Noch kein Konto? Registrieren" footer link. Consistent with this app's
  current Login.razor being a page — nothing here suggests converting login
  itself to a dialog, and the user never asked for that.
- **"Passwort vergessen" (`/#/passwort-vergessen`) — important tension to flag.**
  This is **also a dedicated page**, not a popup, and it shows a **"Schritt 1
  von 3" step counter** in the card. I did not go further (typing a real email
  and clicking "Code senden" would have sent an actual email through the
  user's real account — stopped there deliberately), but the shape is clear:
  recipemaster's own real answer to "password reset with a code" is a
  page-based multi-step flow with a visible step indicator, **not** a modal.
  This sits in real tension with the user's explicit request for a popup-based
  flow. I'm not silently overriding their explicit instruction — they asked
  for a popup, D14 above already keeps `/forgot-password` and `/reset-password`
  as thin shell routes that open the dialog, which is compatible with either —
  but if a step-counter-driven **page** (matching this concrete reference)
  is preferred over a popup after seeing this, that's a cheap pivot at this
  stage, not a rebuild: §4.2's state machine and §4.3/§4.4's live-validation
  logic transfer directly to a page shell instead of a dialog shell.
- **Profil** (`/#/profil`, account settings — analogous to this app's
  Profile.razor): a **plain scrolling page**, not a dialog, organized as
  clearly-separated bordered sections — Konto (name + read-only email),
  Anmeldung (email change + **password change, both inline on the page, not a
  popup** — current/new/confirm password fields with a "Mindestens 6 Zeichen"
  hint), Gruppe (shared-household member list), Eigene Tags, and — bottom of
  page — **Konto löschen**: a distinctly red-bordered "danger zone" card,
  separated from everything else, with an explanation line on the left and a
  single red "Konto löschen …" button on the right (the `…` implies it opens a
  confirm step, consistent with routing account deletion through a
  `ConfirmDialog`-style component rather than deleting on first click). Worth
  noting: recipemaster keeps password-change as an **inline page section**,
  not a dialog, even though it's a security-sensitive form similar to what
  we're popup-ifying here — another data point that "popup vs. page" in their
  app depends on the specific flow, not a blanket rule.
- **Einstellungen** (`/#/einstellungen`, app preferences — analogous to
  Settings.razor): same plain-page pattern, sections as
  label+description-on-the-left / control-in-a-bordered-card-on-the-right
  (toggle switches, chip/pill multi-select groups for category
  preferences, a light/dark/system theme switcher as a 3-way segmented
  control, more toggles). A clean, directly reusable layout primitive for our
  own Settings.razor beyond what's already there.
- **"Problem melden"** (feedback, reached from the account dropdown): **this
  one is a real, small dialog** — good size reference for our own smaller
  dialogs. Title + one-line subtitle, a short single-line "Worum geht es?"
  input, a "Was ist passiert?" textarea, a toggle ("Technische Angaben
  mitsenden") that — nice transparency touch — expands to show a live preview
  of exactly what would be sent (current URL, user agent, viewport size,
  active theme), and a footer with Abbrechen (plain) / Meldung senden (green,
  mail icon). Closed via Abbrechen, sent nothing.

I did not open a "create new recipe" flow or a delete-confirm, and did not
submit the forgot-password form or the feedback form (would have sent a real
email / a real support ticket from the user's real account) — didn't want to
overstay in the user's authenticated session or trigger real side effects for
a reference check. What's above is everything I looked at.

### 7.2 Three token additions (the only new ones)

```css
/* tokens.css */
--shadow-overlay: 0 24px 48px rgba(30, 20, 10, 0.28),
                  0 4px 12px rgba(30, 20, 10, 0.14);
```
The app has exactly two elevation levels (`--shadow-card`, `--shadow-card-hover`).
A modal floating over a dimmed page is a third, higher level; today's dialogs
borrow `--shadow-card-hover`, which is why they read as "a card that happens to be
centered" rather than as something above the page. Same warm-brown tint as the
existing two, so it's consistent rather than new.

```css
/* per theme */
--color-overlay-scrim: rgba(36, 26, 18, 0.45);   /* classic-library — warm, = --color-bg-dark */
--color-overlay-scrim: rgba(0, 0, 0, 0.60);      /* dark-library */
```
Today all three dialogs hardcode `rgba(0, 0, 0, 0.5)`. A neutral black scrim over
an aged-paper palette reads cold and generic; a scrim tinted toward the theme's
own `--color-bg-dark` reads like the app dimming itself. Pair it with
`backdrop-filter: blur(2px)` behind a `@supports` guard — that single line is the
biggest "modern" payoff per byte in this whole document.

`--space-*`, `--radius*`, `--motion-*`, `--ease-standard` and the type scale all
stay as they are. Nothing else needs inventing.

### 7.3 Concrete rules

**Shape.** Containers (cards, dialogs, sheets, the code block) → `--radius-lg`
(10 px). Controls (buttons, inputs) → `--radius` (6 px). Pills/badges → `999px`.
One rule, no per-component judgement calls.

**Space.** Dialog padding `--space-4` (32 px) — one step more generous than
today's `--space-3`; that *is* "generous whitespace" in this app's own scale.
`--space-3` between sections, `--space-2` between form rows (already
`.form-group`'s gap), `--space-2` between footer buttons.

**Type.** Dialog titles currently use a bare `<h2>` → 1.75 rem inside a 24 rem
card, which is why they shout. Introduce `.dialog-title`:
`--font-family-display` at `--font-size-h3` (1.25 rem), weight 600. Supporting
copy at `--font-size-small` in `--color-text-secondary`. Honestly, this one
change does more for "feels designed" than any shadow.

**Motion.** Scrim fades in over `--motion-standard` (200 ms). Card additionally
`translateY(8px) → 0` + `scale(0.98) → 1` over `--motion-reveal` (320 ms) with
`--ease-standard`. Step transitions inside a multi-step dialog: 200 ms crossfade
+ 12 px horizontal slide (forward from the right, back from the left). Under
`prefers-reduced-motion: reduce`: **keep the opacity fade, drop every translate
and scale** — per-effect, matching how `app.css` already handles reduced motion
rather than flattening durations globally.

**Color discipline.** Exactly one `--color-primary` (brass) action per dialog;
everything else is a plain `.btn`. Destructive actions use `--color-error`,
never `--color-secondary` (oxblood is structural, not a warning). Success is a
`--color-success` *icon*, never a green fill — matching the existing
`.error-message` comment's "calm, not an alarming banner" stance.

**Density / touch.** Inputs stay at `--font-size-body` (16 px — below that, iOS
zooms on focus). `.btn` currently computes to ~36 px tall; dialog footer buttons
get `min-height: 2.5rem` (40 px) and mobile-width buttons go full-width below the
breakpoint.

**One caution.** The "modern SaaS" look trends cool-neutral and minimal. Lumina
Chronica's identity is warm paper, brass and oxblood. Take the *structure* —
spacing, elevation, motion, dialog-first interaction, rounded surfaces — and
leave the palette alone. A warm palette with modern structure is distinctive; a
warm palette drifting toward grey-blue is just a diluted version of both.

---

## 8. Implementation plan

Ordered so that each phase is independently reviewable and nothing waits on
something later.

**Phase 0 — decisions & assets** *(blocks everything)*
1. Sign off §0.
2. Export `wwwroot/images/email-logo.png` (~200 px wide, ~15 KB) from
   `branding/logo-mark.svg`.
3. **D10 confirmed: new secret.** Add `PASSWORD_CODE_SECRET` to
   `models/env.ts`'s `Bindings` type, and to `backend/.dev.vars` with a
   clearly-local placeholder value (exact same pattern as the existing
   `JWT_SECRET` line there — see `.dev.vars`'s current
   `"local-dev-secret-not-for-production-use"`). Production value via
   `wrangler secret put PASSWORD_CODE_SECRET` — **the user runs this
   themselves**, same as `RESEND_API_KEY` earlier this session; never enter a
   secret value on their behalf. `hmacSha256Hex()` (item 5) must throw loudly
   if the secret it's given is empty/undefined rather than silently hashing
   against `""` — an unset `.dev.vars` line (blank, like `RESEND_API_KEY=`
   currently is) must fail fast and obviously, not produce stable-looking,
   worthless hashes that pass tests which never actually check the secret
   was real.

**Phase 1 — backend** *(blocks the frontend; ship and merge on its own)*
4. `database/migrations/0026_password_reset_code.sql` (§3.2). **Apply it
   locally immediately** (`npx wrangler d1 migrations apply lumina-chronica-db --local`)
   before writing or running any test against it — this exact codebase hit
   "no such table" / "no such column" earlier this session (0025 was in the
   repo but never applied locally) purely from forgetting this step, and
   0026 is an `ALTER TABLE` on the same table, same failure mode. Production
   deploy later is still the usual **two manual steps** — code deploy *and*
   D1 migration, separately.
5. `utils/crypto.ts`: `randomNumericCode(6)` (rejection sampling, not `% 10`),
   `hmacSha256Hex()`.
6. `services/emailService.ts`: optional `text` parameter.
7. `backend/src/emails/` — `layout.ts`, `strings.ts` (de+en), `escapeHtml.ts`,
   `passwordResetCode.ts`, `passwordChanged.ts`, `oauthNoPassword.ts`.
8. `services/passwordResetService.ts`: **60s resend-cooldown check keyed on
   the raw identifier via `auth_rate_limits` (§3.4 step 0) — must run before
   the user lookup, not after**, invalidate-previous, issue code+token,
   locale lookup, `verifyResetCode()`, `resetPassword()` accepting either
   credential, confirmation email after the write.
8b. `services/rateLimitService.ts`: add a `"forgot-password-resend"` route
   key (60s window, 1 attempt, `ip = ""`) alongside the existing
   `forgot-password`/`login`/`register` ones — same table, no schema change.
9. `routes/auth.ts`: `POST /verify-reset-code`, extended `/reset-password` body,
   new throttle keys.
10. `tests/backend/passwordReset.test.ts`: code issuance, correct/wrong code,
    attempt exhaustion at N, expiry, single-use, **link and code both consume the
    same row**, previous-code invalidation, identical response for
    existing/non-existing identifier, OAuth-only path, confirmation email fires
    *after* the password write, reset still succeeds when the confirmation send
    throws, **resend cooldown fires identically for an existing identifier, a
    non-existing identifier, and an OAuth-only identifier (the enumeration
    regression test for D2's fix)**, cooldown does not block a *different*
    identifier, cooldown expires after 60s. Email sending mocked throughout.

**Phase 2 — the Dialog primitive** *(frontend, no backend dependency — can run in
parallel with Phase 1)*
11. `Components/Dialog/` (§6.1), `wwwroot/js/dialog.js` scroll lock,
    `--shadow-overlay` + `--color-overlay-scrim` in `tokens.css` / each theme,
    `.dialog-*` conventions.
12. `tests/frontend/DialogTests.cs`: renders only when open, `aria-modal` +
    `aria-labelledby`, Escape honours `CloseOnEscape`, overlay click honours
    `CloseOnOverlayClick`, inner click doesn't close, footer slot renders.
13. **Do not** migrate the three existing dialogs yet.

**Phase 3 — the password-reset dialog** *(needs 1 + 2)*
14. `Components/PasswordResetDialog/` — the state machine (§4.2), live code check
    (§4.3), live password rules (§4.4), step rail, resend cooldown.
15. Wire the three entry points; shrink `ForgotPassword.razor` /
    `ResetPassword.razor` to shells (**D14**).
16. i18n keys in `de.json` + `en.json` + `FakeI18nService.cs` — flat keys,
    `passwordReset.*`.
17. bUnit tests: step advance on valid code, no advance on invalid, **one server
    call per distinct 6-digit value** (the de-duplication is a behavioural
    requirement, not an optimization), mismatch message doesn't appear while the
    confirm field is still shorter than the first, submit disabled until both
    rules pass, expired-code fallback path, `LinkToken` opens at `PasswordEntry`.
17b. **Rewrite `ForgotPasswordPageTests.cs` and `ResetPasswordPageTests.cs`**
    (their asserted markup and the page-level `_invalidToken` branch are gone —
    §4.1), and update `LoginPageTests.cs` / `ProfilePageTests.cs` from
    "navigates to route" to "opens dialog".

**Phase 4 — dialog rollout** *(needs 2; independent of 1 and 3)*
18. BookDetail edit mode → `<Dialog Size="Large">` (**D12**, updated), dirty-state guard.
19. "Buch hinzufügen" chooser dialog (**D13**).
20. Shelf create/rename, project create → dialogs.
21. Migrate `ConfirmDialog` / `AvatarUploadDialog` / `FollowListDialog` onto the
    primitive; delete the duplicated CSS.

**Phase 5 — aesthetic pass** *(needs 2 and 4)*
22. Apply §7.3 across dialogs and cards: radius rule, `--shadow-overlay`,
    tinted scrim + blur, `.dialog-title`, motion bands, touch targets.
23. Re-check all four themes, including `dark-library` and `system`, and
    `prefers-reduced-motion`.

---

## 9. Things I deliberately did not change

- **No session invalidation on reset.** No session table, no JWT blocklist; still
  out of scope, and §5.4's copy is written so it doesn't imply otherwise.
- **No cleanup job for expired rows.** Still inert dead weight, still no cron to
  hang it off — unchanged from the 2026-09-26 spec's reasoning.
- **No new password-strength rules on the server.** `MIN_PASSWORD_LENGTH = 8`
  stays authoritative; the client mirrors it and never invents extra blocking
  rules.
- **No PBKDF2 on the code.** 8000 iterations already costs ~33 ms on the Workers
  Free plan's 10 ms CPU budget; HMAC-SHA256 is the right tool and is microseconds.
- **The anti-enumeration contract of `/forgot-password`.** Preserved, but not
  "untouched" — the D2 resend cooldown's *first draft* (§3.4 step 0) actually
  broke it (querying by `user_id` meant the cooldown could only ever fire for
  identifiers that resolve to a real account, which is itself a signal).
  Fixed by keying the cooldown on the raw submitted identifier via
  `auth_rate_limits` instead, checked before any user lookup — see §3.4 step
  0's full writeup for why. `/verify-reset-code` was designed correctly from
  the start (§3.5) and needed no such fix.
