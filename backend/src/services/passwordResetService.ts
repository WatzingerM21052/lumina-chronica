import { OAUTH_NO_PASSWORD_SENTINEL, hashPassword, randomToken, sha256Hex, signJwt } from "../utils/crypto";
import { roleName } from "./authService";
import { sendEmail } from "./emailService";

const TOKEN_TTL_SECONDS = 60 * 60;
// Matches authService.ts's own TOKEN_EXPIRY_SECONDS -- a reset-and-login
// should land the user in the same 7-day session as any other login.
const JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export class InvalidResetTokenError extends Error {}

type UserRow = { id: number; email: string; password_hash: string; role_id: number };

async function findUserByIdentifier(db: D1Database, identifier: string): Promise<UserRow | null> {
    // Same lookup as authService.ts's loginUser -- email or username, case
    // as stored, excluding soft-deleted accounts.
    return db
        .prepare("SELECT id, email, password_hash, role_id FROM users WHERE (email = ?1 OR username = ?1) AND deleted_at IS NULL")
        .bind(identifier)
        .first<UserRow>();
}

// Never throws and never reveals whether a match was found -- the caller
// (the /forgot-password route) always returns the same generic response
// regardless of what happens in here. Token generation mirrors
// oauthService.ts's storeExchangeCode: randomToken() + sha256Hex(), only
// the hash stored.
export async function requestPasswordReset(db: D1Database, resendApiKey: string, frontendUrl: string, identifier: string): Promise<void> {
    const user = await findUserByIdentifier(db, identifier);
    if (!user) return;

    if (user.password_hash === OAUTH_NO_PASSWORD_SENTINEL) {
        await sendEmail(
            resendApiKey,
            user.email,
            "Lumina Chronica: Kein Passwort zum Zurücksetzen",
            "<p>Dieser Account meldet sich über Google oder GitHub an und hat kein eigenes Passwort. Melde dich stattdessen über den jeweiligen Button an.</p>"
        );
        return;
    }

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
    await db
        .prepare("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(tokenHash, user.id, expiresAt)
        .run();

    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    await sendEmail(
        resendApiKey,
        user.email,
        "Lumina Chronica: Passwort zurücksetzen",
        `<p>Klicke auf den folgenden Link, um dein Passwort zurückzusetzen (1 Stunde gültig):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    );
}

export async function resetPassword(db: D1Database, jwtSecret: string, rawToken: string, newPassword: string): Promise<{ token: string; userId: number }> {
    const tokenHash = await sha256Hex(rawToken);
    // Atomic consume -- same UPDATE ... RETURNING pattern as
    // oauthService.ts's redeemExchangeCode, so a token can never be
    // consumed twice even under concurrent requests.
    const row = await db
        .prepare(
            "UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP " +
                "WHERE token_hash = ? AND consumed_at IS NULL AND julianday(expires_at) > julianday('now') " +
                "RETURNING user_id"
        )
        .bind(tokenHash)
        .first<{ user_id: number }>();
    if (!row) throw new InvalidResetTokenError();

    const passwordHash = await hashPassword(newPassword);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, row.user_id).run();

    const user = await db.prepare("SELECT role_id FROM users WHERE id = ?").bind(row.user_id).first<{ role_id: number }>();
    const role = user ? await roleName(db, user.role_id) : "USER";
    const token = await signJwt({ sub: row.user_id, role }, jwtSecret, JWT_EXPIRY_SECONDS);
    return { token, userId: row.user_id };
}
