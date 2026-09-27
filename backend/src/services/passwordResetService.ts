import type { Bindings } from "../models/env";
import { OAUTH_NO_PASSWORD_SENTINEL, hashPassword, hmacSha256Hex, randomNumericCode, randomToken, sha256Hex, signJwt } from "../utils/crypto";
import { roleName } from "./authService";
import { sendEmail } from "./emailService";
import { consumeAccountResetBudget } from "./rateLimitService";
import { renderOAuthNoPasswordEmail } from "../emails/oauthNoPassword";
import { renderPasswordChangedEmail } from "../emails/passwordChanged";
import { renderPasswordResetCodeEmail } from "../emails/passwordResetCode";
import type { EmailLanguage } from "../emails/strings";

// D2 (docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md
// §3.4). TTL applies to both credentials sharing one row -- the code and
// the emailed link expire together, not separately (D3's hybrid).
export const CODE_TTL_SECONDS = 20 * 60;
export const MAX_CODE_ATTEMPTS = 10; // D4/D5 -- a live check burns an attempt too, so this must be generous, not tight
const JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // matches authService.ts's own login session length

export class InvalidResetTokenError extends Error {}

type UserRow = { id: number; email: string; password_hash: string; role_id: number };

// Same lookup as authService.ts's loginUser -- email or username, case as
// stored, excluding soft-deleted accounts.
async function findUserByIdentifier(db: D1Database, identifier: string): Promise<UserRow | null> {
    return db
        .prepare("SELECT id, email, password_hash, role_id FROM users WHERE (email = ?1 OR username = ?1) AND deleted_at IS NULL")
        .bind(identifier)
        .first<UserRow>();
}

// D9: every user gets a user_settings row at registration (authService.ts),
// so this always finds one for a real user_id -- the ?? fallback only
// covers a defensive edge case, not the common path. Note for future
// readers: as of this writing nothing in the app ever writes a non-default
// value into user_settings.language (the frontend's language switch is
// purely local/client-side, see I18nService.SetLanguageAsync) -- so this
// resolves to "de" for every real user today. That's a pre-existing gap in
// the language-sync feature, not a bug in this lookup: the column and this
// read are both correct and will start working automatically the moment
// something writes to that column.
async function userLanguage(db: D1Database, userId: number): Promise<EmailLanguage> {
    const row = await db.prepare("SELECT language FROM user_settings WHERE user_id = ?").bind(userId).first<{ language: string }>();
    return row?.language === "en" ? "en" : "de";
}

// Never *reveals* whether a match was found -- the caller (the
// /forgot-password route) always returns the same generic response
// regardless of what happens in here. Note: the D2 60s resend-cooldown
// check does NOT live here -- it must run before findUserByIdentifier even
// executes (that ordering is what keeps it enumeration-safe), so it lives
// in the route handler alongside the existing 5-per-15-min throttle. See
// routes/auth.ts's /forgot-password handler and rateLimitService.ts's
// assertResendNotRateLimited.
export async function requestPasswordReset(db: D1Database, env: Pick<Bindings, "RESEND_API_KEY" | "FRONTEND_URL" | "PASSWORD_CODE_SECRET">, identifier: string): Promise<void> {
    const user = await findUserByIdentifier(db, identifier);
    if (!user) return;

    // Review H-1: per-account cap on reset emails (rateLimitService.ts's
    // RESET_EMAILS_PER_ACCOUNT_MAX), covering the OAuth-only branch too --
    // its informational mail is just as floodable. Over budget returns
    // exactly like the unknown-identifier path above: no mail, and the
    // route's generic 200, so hitting the cap reveals nothing about the
    // account. Deliberately BEFORE the D6 invalidation below: an over-budget
    // request must not burn the link and code the owner last received.
    if (!(await consumeAccountResetBudget(db, user.id))) return;

    const language = await userLanguage(db, user.id);

    if (user.password_hash === OAUTH_NO_PASSWORD_SENTINEL) {
        const email = renderOAuthNoPasswordEmail(language, env.FRONTEND_URL);
        await sendEmail(env.RESEND_API_KEY, user.email, email.subject, email.html, email.text);
        return;
    }

    // Everything that can throw (notably the HMAC, which refuses an empty
    // PASSWORD_CODE_SECRET) runs BEFORE any write: the caller swallows errors
    // into a generic 200, so a failure after the D6 invalidation would
    // silently burn the user's still-valid link too (review K-2).
    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const code = randomNumericCode(6);
    const codeHash = await hmacSha256Hex(env.PASSWORD_CODE_SECRET, code);
    const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();

    // D6: kill outstanding rows first, or N concurrent requests = N x
    // MAX_CODE_ATTEMPTS guesses across N live codes. One batch, so the
    // invalidation and the new row commit together or not at all.
    await db.batch([
        db.prepare("UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL").bind(user.id),
        db
            .prepare("INSERT INTO password_reset_tokens (token_hash, code_hash, user_id, expires_at) VALUES (?, ?, ?, ?)")
            .bind(tokenHash, codeHash, user.id, expiresAt),
    ]);

    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    const email = renderPasswordResetCodeEmail(language, env.FRONTEND_URL, code, resetUrl);
    await sendEmail(env.RESEND_API_KEY, user.email, email.subject, email.html, email.text);
}

export type VerifyResetCodeResult = { valid: boolean; attemptsLeft: number };

// Non-consuming: matching the code here does NOT consume the row -- only
// resetPassword() below does that, atomically, when the user actually
// submits the new password. §3.3: the client identifies the account with
// the identifier it already has in memory (not an opaque requestId), so
// this -- like requestPasswordReset -- must behave identically for an
// unknown identifier as for a real one with no live code.
export async function verifyResetCode(db: D1Database, codeSecret: string, identifier: string, code: string): Promise<VerifyResetCodeResult> {
    const user = await findUserByIdentifier(db, identifier);
    if (!user) return { valid: false, attemptsLeft: 0 };

    const codeHash = await hmacSha256Hex(codeSecret, code);

    // Single atomic statement -- never read attempt_count separately and
    // then decide (see the D1 replica-lag trap rateLimitService.ts already
    // documents; the same failure mode applies here verbatim). Only a
    // MISMATCH costs an attempt: a correct check that also burned one made
    // "9 typos, then the right code" show valid-with-0-left and then fail on
    // submit (review M-1). An attacker gains nothing from free correct
    // guesses -- only wrong ones are worth anything to them.
    const row = await db
        .withSession("first-primary")
        .prepare(
            `UPDATE password_reset_tokens
                SET attempt_count = attempt_count + CASE WHEN code_hash = ?2 THEN 0 ELSE 1 END
              WHERE id = (
                  SELECT id FROM password_reset_tokens
                   WHERE user_id = ?1
                     AND consumed_at IS NULL
                     AND julianday(expires_at) > julianday('now')
                     AND attempt_count < ?3
                   ORDER BY created_at DESC, id DESC
                   LIMIT 1
              )
          RETURNING (code_hash = ?2) AS matched, attempt_count`
        )
        .bind(user.id, codeHash, MAX_CODE_ATTEMPTS)
        .first<{ matched: number; attempt_count: number }>();

    // No row: no live, unlocked code exists for this user at all (expired,
    // already consumed, or attempt_count already at the cap). Byte-identical
    // to "wrong code, no attempts left" -- see the design doc's anti-
    // enumeration rule for this endpoint. Do not add a distinct "locked"
    // shape, however tempting; that distinction is exactly the leak this
    // guards against.
    if (!row) return { valid: false, attemptsLeft: 0 };

    return { valid: row.matched === 1, attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - row.attempt_count) };
}

export type ResetPasswordCredential = { kind: "token"; rawToken: string } | { kind: "code"; identifier: string; code: string };

// Both credential kinds end in the same atomic consume of the same row --
// a link click and a code entry are two proofs of the same underlying
// reset, and either one spends it (D3's hybrid). After the password write
// succeeds, and only then, fire the confirmation email (§4.6/§5.2) -- a
// Resend outage must never fail a reset whose write already committed, so
// the send is wrapped and swallowed.
export async function resetPassword(
    db: D1Database,
    env: Pick<Bindings, "JWT_SECRET" | "RESEND_API_KEY" | "FRONTEND_URL" | "PASSWORD_CODE_SECRET">,
    credential: ResetPasswordCredential,
    newPassword: string
): Promise<{ token: string; userId: number }> {
    const row =
        credential.kind === "token" ? await consumeByToken(db, credential.rawToken) : await consumeByCode(db, env.PASSWORD_CODE_SECRET, credential.identifier, credential.code);
    if (!row) throw new InvalidResetTokenError();

    // The account may have been soft-deleted after the reset was requested
    // but before the credential was used -- consuming the row above still
    // happens (prevents replay), but a deleted account must not receive a
    // working password or a valid session.
    const user = await db.prepare("SELECT role_id FROM users WHERE id = ? AND deleted_at IS NULL").bind(row.user_id).first<{ role_id: number }>();
    if (!user) throw new InvalidResetTokenError();

    const passwordHash = await hashPassword(newPassword);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, row.user_id).run();

    await sendPasswordChangedEmail(db, env, row.user_id);

    const role = await roleName(db, user.role_id);
    const token = await signJwt({ sub: row.user_id, role }, env.JWT_SECRET, JWT_EXPIRY_SECONDS);
    return { token, userId: row.user_id };
}

async function consumeByToken(db: D1Database, rawToken: string): Promise<{ user_id: number } | null> {
    const tokenHash = await sha256Hex(rawToken);
    // Atomic consume -- same UPDATE ... RETURNING pattern as
    // oauthService.ts's redeemExchangeCode, so a credential can never be
    // consumed twice even under concurrent requests.
    return db
        .prepare(
            "UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP " +
                "WHERE token_hash = ? AND consumed_at IS NULL AND julianday(expires_at) > julianday('now') " +
                "RETURNING user_id"
        )
        .bind(tokenHash)
        .first<{ user_id: number }>();
}

async function consumeByCode(db: D1Database, codeSecret: string, identifier: string, code: string): Promise<{ user_id: number } | null> {
    const user = await findUserByIdentifier(db, identifier);
    if (!user) return null;

    const codeHash = await hmacSha256Hex(codeSecret, code);
    // MUST burn an attempt on every MISMATCH -- this endpoint
    // changes the password directly, so it is itself a code-guessing oracle
    // if a wrong guess here is free. (The original version filtered by
    // code_hash in the WHERE clause: that correctly rejected wrong codes
    // but never touched attempt_count, letting an attacker skip
    // /verify-reset-code entirely and spray this endpoint at zero cost per
    // guess -- the row-level cap this comment used to point to as the
    // one IP-rotation-immune defense was silently bypassable through the
    // one route that actually matters. Caught by outside review, not by
    // the original test, which only exhausted attempts via
    // /verify-reset-code.) Same single-atomic-statement shape as
    // verifyResetCode's live check, but ALSO consumes the row on a match,
    // in the same round trip -- consumed_at only changes when code_hash
    // matches (the CASE), attempt_count increments on every mismatch (a
    // match consumes the row anyway, so counting it would gain nothing).
    const row = await db
        .withSession("first-primary")
        .prepare(
            `UPDATE password_reset_tokens
                SET attempt_count = attempt_count + CASE WHEN code_hash = ?2 THEN 0 ELSE 1 END,
                    consumed_at = CASE WHEN code_hash = ?2 THEN CURRENT_TIMESTAMP ELSE consumed_at END
              WHERE id = (
                  SELECT id FROM password_reset_tokens
                   WHERE user_id = ?1
                     AND consumed_at IS NULL
                     AND julianday(expires_at) > julianday('now')
                     AND attempt_count < ?3
                   ORDER BY created_at DESC, id DESC
                   LIMIT 1
              )
          RETURNING (code_hash = ?2) AS matched, user_id`
        )
        .bind(user.id, codeHash, MAX_CODE_ATTEMPTS)
        .first<{ matched: number; user_id: number }>();

    if (!row || row.matched !== 1) return null;
    return { user_id: row.user_id };
}

async function sendPasswordChangedEmail(db: D1Database, env: Pick<Bindings, "RESEND_API_KEY" | "FRONTEND_URL">, userId: number): Promise<void> {
    try {
        const user = await db.prepare("SELECT email FROM users WHERE id = ?").bind(userId).first<{ email: string }>();
        if (!user) return;

        const language = await userLanguage(db, userId);
        const changedAt = new Date().toLocaleString(language === "en" ? "en-GB" : "de-AT", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });
        const email = renderPasswordChangedEmail(language, env.FRONTEND_URL, changedAt);
        await sendEmail(env.RESEND_API_KEY, user.email, email.subject, email.html, email.text);
    } catch (err) {
        // A failed confirmation send must never undo or fail an already-
        // successful password change -- same reasoning as
        // requestPasswordReset's own email failures never surfacing to the
        // caller.
        console.error("resetPassword: confirmation email failed", err);
    }
}
