import { WITHIN_RESTORE_WINDOW } from "./accountPurgeService";
import { hashPassword, signJwt, verifyPassword } from "../utils/crypto";
import { InvalidUsernameError, USERNAME_PATTERN, normalizeEmail, normalizeIdentifier } from "../utils/identity";

// 7 days, no refresh-token flow this phase — see documentation/Architecture.md.
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export type AuthResult = { token: string; userId: number };

export class EmailTakenError extends Error {}
export class UsernameTakenError extends Error {}
export class InvalidCredentialsError extends Error {}
export class DeletedAccountFoundError extends Error {}
export class NoDeletedAccountError extends Error {}
export { InvalidUsernameError };

export type IdentifiedUserRow = {
    id: number;
    email: string;
    password_hash: string;
    role_id: number;
};

// The one email-or-username lookup, shared by login and the reset flow
// (passwordResetService.ts). Emails compare case-insensitively (review N-6);
// usernames stay case-sensitive as stored. Deterministic when several rows
// match (review N-5): an email match beats a username match (a legacy
// username that looks like someone's email never shadows that account), an
// exact-case email beats a case-variant one (legacy rows that differ only
// in case keep their old owner), then the oldest account.
export async function findLiveUserByIdentifier(db: D1Database, identifier: string): Promise<IdentifiedUserRow | null> {
    const raw = identifier.trim();
    return db
        .prepare(
            `SELECT id, email, password_hash, role_id FROM users
              WHERE (lower(email) = ?1 OR username = ?2) AND deleted_at IS NULL
              ORDER BY (lower(email) = ?1) DESC, (email = ?2) DESC, id ASC
              LIMIT 1`
        )
        .bind(normalizeEmail(normalizeIdentifier(raw)), raw)
        .first<IdentifiedUserRow>();
}

// Exported for oauthService.ts, which needs the same lookup when issuing a
// token at exchange time.
export async function roleName(db: D1Database, roleId: number): Promise<string> {
    const role = await db.prepare("SELECT name FROM roles WHERE id = ?").bind(roleId).first<{ name: string }>();
    return role?.name ?? "USER";
}

export async function registerUser(
    db: D1Database,
    jwtSecret: string,
    input: { username: string; email: string; password: string; confirmNewAccount?: boolean }
): Promise<AuthResult> {
    if (!USERNAME_PATTERN.test(input.username)) throw new InvalidUsernameError();
    const email = normalizeEmail(input.email);

    const [emailTaken, usernameTaken] = await Promise.all([
        db.prepare("SELECT id FROM users WHERE lower(email) = ?").bind(email).first(),
        db.prepare("SELECT id FROM users WHERE username = ?").bind(input.username).first(),
    ]);
    if (emailTaken) throw new EmailTakenError();
    if (usernameTaken) throw new UsernameTakenError();

    if (!input.confirmNewAccount) {
        // ORDER BY deleted_at DESC, id DESC: an email can end up on more
        // than one soft-deleted row (deleted, re-registered, deleted
        // again) -- most-recently-deleted wins the tie-break, since that's
        // the account a user re-registering right now is almost certainly
        // asking about. `id DESC` is a second-resolution-timestamp
        // tiebreak (CURRENT_TIMESTAMP; same recurring class as
        // dashboardService.ts's `<timestamp> DESC, id DESC` ordering) --
        // two deletions in the same second would otherwise tie and fall
        // back to SQLite's unspecified order.
        const deletedMatch = await db
            .prepare(`SELECT id FROM users WHERE lower(deleted_email) = ? AND deleted_at IS NOT NULL AND ${WITHIN_RESTORE_WINDOW} ORDER BY deleted_at DESC, id DESC`)
            .bind(email)
            .first();
        if (deletedMatch) throw new DeletedAccountFoundError();
    }

    const userRole = await db.prepare("SELECT id FROM roles WHERE name = 'USER'").first<{ id: number }>();
    if (!userRole) throw new Error("USER role is not seeded (see database/migrations/0001_initial.sql).");

    const passwordHash = await hashPassword(input.password);
    const insertUser = await db
        .prepare("INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)")
        .bind(input.username, email, passwordHash, userRole.id)
        .run();
    const userId = insertUser.meta.last_row_id;

    try {
        // user_settings.user_id is NOT NULL UNIQUE -- a user without a matching
        // settings row is an inconsistent state. D1's batch() can't express this
        // as one atomic call (the second insert needs the first insert's id), so
        // this is two sequential statements with a compensating delete instead.
        await db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").bind(userId).run();
    } catch (err) {
        await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
        throw err;
    }

    const token = await signJwt({ sub: userId, role: "USER", tv: 0 }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId };
}

// Review N-7: the session generation every new JWT is signed with. A token
// whose "tv" claim is behind this is rejected by requireAuth.
export async function tokenVersion(db: D1Database, userId: number): Promise<number> {
    const row = await db.prepare("SELECT token_version FROM users WHERE id = ?").bind(userId).first<{ token_version: number }>();
    return row?.token_version ?? 0;
}

// Invalidates every token issued so far; returns the new version, which is
// what any token issued right after must be signed with.
export async function bumpTokenVersion(db: D1Database, userId: number): Promise<number> {
    const row = await db
        .prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ? RETURNING token_version")
        .bind(userId)
        .first<{ token_version: number }>();
    return row?.token_version ?? 0;
}

// "Log out all other devices": bumps the version and hands the calling
// device a fresh token for the new one, so only the others are signed out.
export async function logoutOtherSessions(db: D1Database, jwtSecret: string, userId: number): Promise<AuthResult> {
    const tv = await bumpTokenVersion(db, userId);
    const user = await db.prepare("SELECT role_id FROM users WHERE id = ?").bind(userId).first<{ role_id: number }>();
    const role = user ? await roleName(db, user.role_id) : "USER";
    const token = await signJwt({ sub: userId, role, tv }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId };
}

export async function loginUser(
    db: D1Database,
    jwtSecret: string,
    input: { identifier: string; password: string }
): Promise<AuthResult> {
    const user = await findLiveUserByIdentifier(db, input.identifier);

    // Wrong identifier and wrong password both fail the same way -- don't
    // leak which one was incorrect, or whether the identifier even exists.
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
        throw new InvalidCredentialsError();
    }

    await db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();

    const role = await roleName(db, user.role_id);
    const token = await signJwt({ sub: user.id, role, tv: await tokenVersion(db, user.id) }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId: user.id };
}

export async function restoreUser(
    db: D1Database,
    jwtSecret: string,
    input: { username: string; email: string; password: string }
): Promise<AuthResult> {
    // Same ORDER BY deleted_at DESC, id DESC tie-break as registerUser's
    // deleted-account gate above -- most-recently-deleted wins when the
    // same email has been deleted-and-reclaimed-and-deleted-again.
    const email = normalizeEmail(input.email);
    const deletedMatch = await db
        .prepare(`SELECT id, role_id, deleted_username FROM users WHERE lower(deleted_email) = ? AND deleted_at IS NOT NULL AND ${WITHIN_RESTORE_WINDOW} ORDER BY deleted_at DESC, id DESC`)
        .bind(email)
        .first<{ id: number; role_id: number; deleted_username: string | null }>();
    if (!deletedMatch) throw new NoDeletedAccountError();

    // Taking the account's own old username back is always fine, even a
    // legacy one from before the N-5 pattern existed.
    if (input.username !== deletedMatch.deleted_username && !USERNAME_PATTERN.test(input.username)) throw new InvalidUsernameError();

    const usernameTaken = await db
        .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
        .bind(input.username, deletedMatch.id)
        .first();
    if (usernameTaken) throw new UsernameTakenError();

    // The live email column is free unless some OTHER account has since
    // claimed it live (e.g. via registerUser's confirmNewAccount path) --
    // an ordinary uniqueness conflict, not special-cased.
    const emailTaken = await db
        .prepare("SELECT id FROM users WHERE lower(email) = ? AND id != ?")
        .bind(email, deletedMatch.id)
        .first();
    if (emailTaken) throw new EmailTakenError();

    const passwordHash = await hashPassword(input.password);
    await db
        .prepare(
            `UPDATE users SET username = ?, email = ?, password_hash = ?,
             deleted_username = NULL, deleted_email = NULL, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
        )
        .bind(input.username, email, passwordHash, deletedMatch.id)
        .run();

    const role = await roleName(db, deletedMatch.role_id);
    const token = await signJwt({ sub: deletedMatch.id, role, tv: await tokenVersion(db, deletedMatch.id) }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId: deletedMatch.id };
}
