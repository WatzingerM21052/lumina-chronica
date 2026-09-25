import { hashPassword, signJwt, verifyPassword } from "../utils/crypto";

// 7 days, no refresh-token flow this phase — see documentation/Architecture.md.
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export type AuthResult = { token: string; userId: number };

export class EmailTakenError extends Error {}
export class UsernameTakenError extends Error {}
export class InvalidCredentialsError extends Error {}
export class DeletedAccountFoundError extends Error {}
export class NoDeletedAccountError extends Error {}

type UserRow = {
    id: number;
    password_hash: string;
    role_id: number;
};

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
    const [emailTaken, usernameTaken] = await Promise.all([
        db.prepare("SELECT id FROM users WHERE email = ?").bind(input.email).first(),
        db.prepare("SELECT id FROM users WHERE username = ?").bind(input.username).first(),
    ]);
    if (emailTaken) throw new EmailTakenError();
    if (usernameTaken) throw new UsernameTakenError();

    if (!input.confirmNewAccount) {
        const deletedMatch = await db
            .prepare("SELECT id FROM users WHERE deleted_email = ? AND deleted_at IS NOT NULL")
            .bind(input.email)
            .first();
        if (deletedMatch) throw new DeletedAccountFoundError();
    }

    const userRole = await db.prepare("SELECT id FROM roles WHERE name = 'USER'").first<{ id: number }>();
    if (!userRole) throw new Error("USER role is not seeded (see database/migrations/0001_initial.sql).");

    const passwordHash = await hashPassword(input.password);
    const insertUser = await db
        .prepare("INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)")
        .bind(input.username, input.email, passwordHash, userRole.id)
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

    const token = await signJwt({ sub: userId, role: "USER" }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId };
}

export async function loginUser(
    db: D1Database,
    jwtSecret: string,
    input: { identifier: string; password: string }
): Promise<AuthResult> {
    const user = await db
        .prepare("SELECT id, password_hash, role_id FROM users WHERE (email = ?1 OR username = ?1) AND deleted_at IS NULL")
        .bind(input.identifier)
        .first<UserRow>();

    // Wrong identifier and wrong password both fail the same way -- don't
    // leak which one was incorrect, or whether the identifier even exists.
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
        throw new InvalidCredentialsError();
    }

    await db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();

    const role = await roleName(db, user.role_id);
    const token = await signJwt({ sub: user.id, role }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId: user.id };
}

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
