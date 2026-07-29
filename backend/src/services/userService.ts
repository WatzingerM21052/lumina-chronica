import { hashPassword, verifyPassword } from "../utils/crypto";

export class InvalidPasswordError extends Error {}
export class EmailTakenError extends Error {}
export class UsernameTakenError extends Error {}

export type UserProfile = {
    id: number;
    username: string;
    email: string;
    avatarUrl: string | null;
    roleName: string;
    createdAt: string;
};

type UserProfileRow = {
    id: number;
    username: string;
    email: string;
    avatar_url: string | null;
    created_at: string;
    role_name: string;
};

function toProfile(row: UserProfileRow): UserProfile {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUrl: row.avatar_url,
        roleName: row.role_name,
        createdAt: row.created_at,
    };
}

export async function getUserProfile(db: D1Database, userId: number): Promise<UserProfile | null> {
    const row = await db
        .prepare(
            `SELECT users.id, users.username, users.email, users.avatar_url, users.created_at, roles.name AS role_name
             FROM users JOIN roles ON roles.id = users.role_id
             WHERE users.id = ? AND users.deleted_at IS NULL`
        )
        .bind(userId)
        .first<UserProfileRow>();

    return row ? toProfile(row) : null;
}

export type UpdateProfileInput = {
    username?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
};

export async function updateUserProfile(db: D1Database, userId: number, input: UpdateProfileInput): Promise<UserProfile> {
    if (input.username) {
        const taken = await db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").bind(input.username, userId).first();
        if (taken) throw new UsernameTakenError();
    }
    if (input.email) {
        const taken = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").bind(input.email, userId).first();
        if (taken) throw new EmailTakenError();
    }

    let newPasswordHash: string | null = null;
    if (input.newPassword) {
        const current = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
        if (!current || !input.currentPassword || !(await verifyPassword(input.currentPassword, current.password_hash))) {
            throw new InvalidPasswordError();
        }
        newPasswordHash = await hashPassword(input.newPassword);
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    if (input.username) {
        sets.push("username = ?");
        values.push(input.username);
    }
    if (input.email) {
        sets.push("email = ?");
        values.push(input.email);
    }
    if (newPasswordHash) {
        sets.push("password_hash = ?");
        values.push(newPasswordHash);
    }

    if (sets.length > 0) {
        sets.push("updated_at = CURRENT_TIMESTAMP");
        values.push(userId);
        await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    }

    const profile = await getUserProfile(db, userId);
    if (!profile) throw new Error("User disappeared during profile update.");
    return profile;
}
