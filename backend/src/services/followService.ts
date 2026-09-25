// User-follows-user -- v3.0 (Community), Phase 2 (issue #304). No spec
// precedent beyond the bare `followers(follower_id, following_id,
// created_at)` field list (§50.1); this file's shape is designed fresh.

import { NotFoundError } from "./errors";
import { buildNotificationInsert } from "./notificationService";
import { resolveAvatarUrl } from "./userService";

export { NotFoundError };
export class SelfFollowError extends Error {}

export async function resolveUserIdByUsername(db: D1Database, username: string): Promise<number> {
    const row = await db.prepare("SELECT id FROM users WHERE username = ? AND deleted_at IS NULL").bind(username).first<{ id: number }>();
    if (!row) throw new NotFoundError();
    return row.id;
}

export async function followUser(db: D1Database, followerId: number, targetUsername: string): Promise<void> {
    const targetId = await resolveUserIdByUsername(db, targetUsername);
    if (targetId === followerId) throw new SelfFollowError();
    const result = await db.prepare("INSERT OR IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)").bind(followerId, targetId).run();
    // OR IGNORE means a repeat follow() call is a silent no-op -- only
    // notify on the row actually being inserted, not on every idempotent
    // retry (meta.changes, not db.batch(), since the decision depends on
    // the first statement's own result).
    if (result.meta.changes > 0) {
        await buildNotificationInsert(db, targetId, "FOLLOW", followerId, "USER", followerId).run();
    }
}

export async function unfollowUser(db: D1Database, followerId: number, targetUsername: string): Promise<void> {
    const targetId = await resolveUserIdByUsername(db, targetUsername);
    await db.prepare("DELETE FROM followers WHERE follower_id = ? AND following_id = ?").bind(followerId, targetId).run();
}

export type FollowState = {
    followerCount: number;
    followingCount: number;
    isFollowing: boolean;
    isOwnProfile: boolean;
};

// viewerId is null for a fully logged-out visitor (optionalAuth) -- counts
// are public regardless, isFollowing/isOwnProfile just default to false.
export async function getFollowState(db: D1Database, targetUserId: number, viewerId: number | null): Promise<FollowState> {
    const [followerRow, followingRow, viewerFollowsRow] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS count FROM followers WHERE following_id = ?").bind(targetUserId).first<{ count: number }>(),
        db.prepare("SELECT COUNT(*) AS count FROM followers WHERE follower_id = ?").bind(targetUserId).first<{ count: number }>(),
        viewerId === null
            ? Promise.resolve(null)
            : db.prepare("SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?").bind(viewerId, targetUserId).first(),
    ]);

    return {
        followerCount: followerRow?.count ?? 0,
        followingCount: followingRow?.count ?? 0,
        isFollowing: viewerFollowsRow !== null,
        isOwnProfile: viewerId !== null && viewerId === targetUserId,
    };
}

export type FollowListItem = {
    username: string;
    avatarUrl: string | null;
    // Whether the CALLER (viewerId) follows this listed user -- null for a
    // logged-out visitor, since "do you follow X" has no answer without an
    // identity. Distinct from whatever relationship the listed row itself
    // represents (e.g. every row in a followers list already follows the
    // profile being viewed -- that's not what this field means).
    isFollowing: boolean | null;
};

export type FollowListResult = {
    items: FollowListItem[];
    total: number;
    page: number;
    pageSize: number;
};

async function resolveViewerFollowing(db: D1Database, viewerId: number | null, userIds: number[]): Promise<Set<number>> {
    if (viewerId === null || userIds.length === 0) return new Set();
    const placeholders = userIds.map(() => "?").join(", ");
    const rows = await db
        .prepare(`SELECT following_id FROM followers WHERE follower_id = ? AND following_id IN (${placeholders})`)
        .bind(viewerId, ...userIds)
        .all<{ following_id: number }>();
    return new Set(rows.results.map((r) => r.following_id));
}

// Who follows targetUsername -- newest follow first. Returns null (not an
// empty result) for an unknown username, same as resolveUserIdByUsername's
// own NotFoundError-throwing sibling, so the route layer can 404 cleanly.
export async function listFollowers(
    db: D1Database,
    targetUsername: string,
    viewerId: number | null,
    page: number,
    pageSize: number,
    origin: string
): Promise<FollowListResult | null> {
    let targetId: number;
    try {
        targetId = await resolveUserIdByUsername(db, targetUsername);
    } catch (err) {
        if (err instanceof NotFoundError) return null;
        throw err;
    }

    const offset = (page - 1) * pageSize;
    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT users.username, users.avatar_url, users.avatar_key, users.id
                 FROM followers JOIN users ON users.id = followers.follower_id
                 WHERE followers.following_id = ? AND users.deleted_at IS NULL
                 ORDER BY followers.created_at DESC, users.id DESC
                 LIMIT ? OFFSET ?`
            )
            .bind(targetId, pageSize, offset)
            .all<{ username: string; avatar_url: string | null; avatar_key: string | null; id: number }>(),
        db
            .prepare(`SELECT COUNT(*) AS total FROM followers JOIN users ON users.id = followers.follower_id WHERE followers.following_id = ? AND users.deleted_at IS NULL`)
            .bind(targetId)
            .first<{ total: number }>(),
    ]);

    const viewerFollowing = await resolveViewerFollowing(db, viewerId, rows.results.map((r) => r.id));
    return {
        items: rows.results.map((row) => ({
            username: row.username,
            avatarUrl: resolveAvatarUrl(row.avatar_url, row.avatar_key, row.username, origin),
            isFollowing: viewerId === null ? null : viewerFollowing.has(row.id),
        })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
    };
}

// Who targetUsername follows -- newest follow first.
export async function listFollowing(
    db: D1Database,
    targetUsername: string,
    viewerId: number | null,
    page: number,
    pageSize: number,
    origin: string
): Promise<FollowListResult | null> {
    let targetId: number;
    try {
        targetId = await resolveUserIdByUsername(db, targetUsername);
    } catch (err) {
        if (err instanceof NotFoundError) return null;
        throw err;
    }

    const offset = (page - 1) * pageSize;
    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT users.username, users.avatar_url, users.avatar_key, users.id
                 FROM followers JOIN users ON users.id = followers.following_id
                 WHERE followers.follower_id = ? AND users.deleted_at IS NULL
                 ORDER BY followers.created_at DESC, users.id DESC
                 LIMIT ? OFFSET ?`
            )
            .bind(targetId, pageSize, offset)
            .all<{ username: string; avatar_url: string | null; avatar_key: string | null; id: number }>(),
        db
            .prepare(`SELECT COUNT(*) AS total FROM followers JOIN users ON users.id = followers.following_id WHERE followers.follower_id = ? AND users.deleted_at IS NULL`)
            .bind(targetId)
            .first<{ total: number }>(),
    ]);

    const viewerFollowing = await resolveViewerFollowing(db, viewerId, rows.results.map((r) => r.id));
    return {
        items: rows.results.map((row) => ({
            username: row.username,
            avatarUrl: resolveAvatarUrl(row.avatar_url, row.avatar_key, row.username, origin),
            isFollowing: viewerId === null ? null : viewerFollowing.has(row.id),
        })),
        total: countRow?.total ?? 0,
        page,
        pageSize,
    };
}
