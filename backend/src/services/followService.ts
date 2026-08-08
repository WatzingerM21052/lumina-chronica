// User-follows-user -- v3.0 (Community), Phase 2 (issue #304). No spec
// precedent beyond the bare `followers(follower_id, following_id,
// created_at)` field list (§50.1); this file's shape is designed fresh.

import { NotFoundError } from "./errors";
import { buildNotificationInsert } from "./notificationService";

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
