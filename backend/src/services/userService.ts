import { OAUTH_NO_PASSWORD_SENTINEL, hashPassword, verifyPassword } from "../utils/crypto";
import { ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, ValidationError, validateFile } from "./fileValidation";

export class InvalidPasswordError extends Error {}
export class EmailTakenError extends Error {}
export class UsernameTakenError extends Error {}
export { ValidationError };

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
    avatar_key: string | null;
    created_at: string;
    role_name: string;
};

function r2AvatarKey(userId: number, ext: string): string {
    return `avatars/${userId}/avatar.${ext}`;
}

// A self-hosted upload (avatar_key) always wins over an external OAuth URL
// (avatar_url) when both are set -- the user explicitly chose to replace
// what their provider gave them. Resolved to an absolute URL (not a bare R2
// key) so the frontend can drop it straight into <img src> exactly like an
// external OAuth URL, with no special-casing needed on that side; origin
// comes from the request itself (new URL(c.req.url).origin in the route
// layer), mirroring routes/auth.ts's existing absolute-URL-building pattern
// for the OAuth callback URL.
export function resolveAvatarUrl(avatarUrl: string | null, avatarKey: string | null, username: string, origin: string): string | null {
    if (avatarKey) return `${origin}/api/users/${encodeURIComponent(username)}/avatar`;
    return avatarUrl;
}

function toProfile(row: UserProfileRow, origin: string): UserProfile {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        avatarUrl: resolveAvatarUrl(row.avatar_url, row.avatar_key, row.username, origin),
        roleName: row.role_name,
        createdAt: row.created_at,
    };
}

// id is included for callers that need it internally (e.g.
// publicProfileService.ts computing follow state) -- publicProfileService is
// responsible for NOT putting it in the actual API response, same as
// email/role/createdAt.
export type PublicUserProfile = {
    id: number;
    username: string;
    avatarUrl: string | null;
};

// Community Phase 1 (issue #300) -- deliberately a much narrower projection
// than UserProfile: no email/role/createdAt, nothing an anonymous visitor
// shouldn't see. Looked up by username (the public-facing identifier, e.g.
// /u/{username}) rather than id.
export async function getUserByUsername(db: D1Database, username: string, origin: string): Promise<PublicUserProfile | null> {
    const row = await db
        .prepare("SELECT id, username, avatar_url, avatar_key FROM users WHERE username = ? AND deleted_at IS NULL")
        .bind(username)
        .first<{ id: number; username: string; avatar_url: string | null; avatar_key: string | null }>();

    return row ? { id: row.id, username: row.username, avatarUrl: resolveAvatarUrl(row.avatar_url, row.avatar_key, row.username, origin) } : null;
}

export async function getUserProfile(db: D1Database, userId: number, origin: string): Promise<UserProfile | null> {
    const row = await db
        .prepare(
            `SELECT users.id, users.username, users.email, users.avatar_url, users.avatar_key, users.created_at, roles.name AS role_name
             FROM users JOIN roles ON roles.id = users.role_id
             WHERE users.id = ? AND users.deleted_at IS NULL`
        )
        .bind(userId)
        .first<UserProfileRow>();

    return row ? toProfile(row, origin) : null;
}

export type UpdateProfileInput = {
    username?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
};

export async function updateUserProfile(db: D1Database, userId: number, input: UpdateProfileInput, origin: string): Promise<UserProfile> {
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
        // OAuth-only accounts (issue #40) store crypto.ts's
        // OAUTH_NO_PASSWORD_SENTINEL here instead of a real hash --
        // verifyPassword's format check already rejects it cleanly (it never
        // matches "pbkdf2$..."), so such an account attempting this flow
        // correctly gets InvalidPasswordError rather than a false match or a
        // crash. Setting an initial real password for such an account is a
        // distinct, not-yet-built flow (it shouldn't require a "current
        // password" that never existed) -- out of scope here.
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

    const profile = await getUserProfile(db, userId, origin);
    if (!profile) throw new Error("User disappeared during profile update.");
    return profile;
}

// Separate from updateUserProfile (JSON metadata only) since an avatar
// replace is a multipart upload -- mirrors bookService.ts's
// updateBookCover, plus best-effort cleanup of the old R2 object. Only
// ever touches avatar_key, never avatar_url -- an OAuth-provided avatar_url
// is left untouched underneath a self-hosted upload, so removing the
// upload later (not yet built) could fall back to it again.
export async function updateUserAvatar(db: D1Database, storage: R2Bucket, userId: number, avatar: File, origin: string): Promise<UserProfile> {
    const row = await db.prepare("SELECT avatar_key FROM users WHERE id = ? AND deleted_at IS NULL").bind(userId).first<{ avatar_key: string | null }>();
    if (!row) throw new Error("User disappeared during avatar update.");

    const ext = validateFile(avatar, ALLOWED_COVER_EXTENSIONS, COVER_MIME_HINTS, MAX_COVER_FILE_BYTES, "Avatar image");
    const avatarKey = r2AvatarKey(userId, ext);
    const previousKey = row.avatar_key;

    await storage.put(avatarKey, await avatar.arrayBuffer(), { httpMetadata: { contentType: avatar.type || undefined } });
    await db.prepare("UPDATE users SET avatar_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(avatarKey, userId).run();

    if (previousKey && previousKey !== avatarKey) {
        await storage.delete(previousKey).catch((err) => {
            console.error(`Failed to delete old R2 avatar ${previousKey} after replacing user ${userId}'s avatar:`, err);
        });
    }

    const profile = await getUserProfile(db, userId, origin);
    if (!profile) throw new Error("User disappeared during avatar update.");
    return profile;
}

// For the public, unauthenticated GET /api/users/:username/avatar route --
// deliberately no privacy/visibility gating (unlike book/shelf covers):
// an avatar has no concept of private/shared, it's either set or it isn't.
export async function getUserAvatarObject(db: D1Database, storage: R2Bucket, username: string): Promise<R2ObjectBody | null> {
    const row = await db
        .prepare("SELECT avatar_key FROM users WHERE username = ? AND deleted_at IS NULL")
        .bind(username)
        .first<{ avatar_key: string | null }>();
    if (!row || !row.avatar_key) return null;

    return storage.get(row.avatar_key);
}

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

    // A soft-deleted account must not remain sign-in-able via a linked
    // OAuth identity -- findOrCreateUserForOAuth
    // (oauthService.ts) looks identities up with no deleted_at check on the
    // owning user, so for a purely-OAuth account (no password) this was the
    // only sign-in method that account ever had, making deletion nearly a
    // no-op. Deleting the identity rows here closes that directly: a later
    // sign-in via the same provider finds no identity and falls through to
    // findOrCreateUserForOAuth's normal create-new-or-auto-link-by-email
    // path, which itself already filters deleted_at IS NULL on the email
    // lookup, so it can't resurrect this account by accident.
    //
    // Known, accepted tradeoff: OAuth identities do NOT come back on
    // POST /api/auth/restore (unlike every other owned row, which reattaches
    // because restoreUser reactivates the same user row) -- a restored
    // account must re-link providers from Profile's "Verknüpfte Konten"
    // section. Acceptable because restoreUser always sets a fresh password,
    // so the restored account has a working sign-in method immediately.
    await db.prepare("DELETE FROM oauth_identities WHERE user_id = ?").bind(userId).run();

    // Defense-in-depth, not closing a separate hole (both tables are
    // already short-TTL: exchange codes 2 min, states 10 min) -- a code/state
    // minted seconds before deletion shouldn't still be redeemable after.
    // oauth_states has no user_id column for a normal login-flow row, only
    // linking_user_id for a link-flow row, so that's the only deletable
    // shape here.
    await db.prepare("DELETE FROM oauth_exchange_codes WHERE user_id = ?").bind(userId).run();
    await db.prepare("DELETE FROM oauth_states WHERE linking_user_id = ?").bind(userId).run();

    if (row.avatar_key) {
        await storage.delete(row.avatar_key).catch((err) => {
            console.error(`Failed to delete R2 avatar ${row.avatar_key} for deleted user ${userId}:`, err);
        });
    }
}
