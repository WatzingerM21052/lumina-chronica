// In-app notifications with per-type preferences -- v3.3 Phase 3 (issue
// #326). No email/push infrastructure, in-app only. Migration
// 0020_notifications.sql.
//
// buildNotificationInsert returns a single self-contained D1PreparedStatement
// (not an async pre-check) so callers can include it directly in a
// db.batch() call alongside their primary write -- the preference check and
// self-notification guard both live inside the SQL's WHERE clause, so the
// statement is always safe to run and simply inserts zero rows when muted
// or when the actor is the recipient. This also makes the "check at insert
// time, not read time" requirement automatic: a later preference change
// can never retroactively affect a row that's already been inserted.

export type NotificationType = "FOLLOW" | "COMMENT" | "RATING" | "SHARE";
export type PreferenceType = NotificationType | "ACTIVITY_RATING";

const PREFERENCE_TYPES: PreferenceType[] = ["FOLLOW", "COMMENT", "RATING", "SHARE", "ACTIVITY_RATING"];

export type Notification = {
    id: number;
    type: NotificationType;
    actorUserId: number;
    actorUsername: string;
    targetType: string | null;
    targetId: number | null;
    readAt: string | null;
    createdAt: string;
};

const MAX_NOTIFICATIONS = 50;

export function buildNotificationInsert(
    db: D1Database,
    recipientUserId: number,
    type: NotificationType,
    actorUserId: number,
    targetType: string | null,
    targetId: number | null
): D1PreparedStatement {
    return db
        .prepare(
            `INSERT INTO notifications (user_id, type, actor_user_id, target_type, target_id)
             SELECT ?, ?, ?, ?, ?
             WHERE ? != ?
               AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = ? AND type = ? AND enabled = 0)`
        )
        .bind(recipientUserId, type, actorUserId, targetType, targetId, recipientUserId, actorUserId, recipientUserId, type);
}

// Used by activityService.recordRatingActivity to gate the ACTIVITY_RATING
// preference the same way -- the row-per-type mechanism isn't limited to
// notifications, it's a general "does this user want this kind of thing
// logged/sent" switch.
export async function isPreferenceEnabled(db: D1Database, userId: number, type: PreferenceType): Promise<boolean> {
    const row = await db.prepare("SELECT enabled FROM user_preferences WHERE user_id = ? AND type = ?").bind(userId, type).first<{ enabled: number }>();
    return row === null || row.enabled === 1;
}

export async function setPreference(db: D1Database, userId: number, type: PreferenceType, enabled: boolean): Promise<void> {
    if (!PREFERENCE_TYPES.includes(type)) throw new Error(`invalid preference type: ${type}`);
    await db
        .prepare(
            `INSERT INTO user_preferences (user_id, type, enabled) VALUES (?, ?, ?)
             ON CONFLICT(user_id, type) DO UPDATE SET enabled = excluded.enabled`
        )
        .bind(userId, type, enabled ? 1 : 0)
        .run();
}

export async function listPreferences(db: D1Database, userId: number): Promise<Record<PreferenceType, boolean>> {
    const { results } = await db.prepare("SELECT type, enabled FROM user_preferences WHERE user_id = ?").bind(userId).all<{ type: PreferenceType; enabled: number }>();
    const overrides = new Map(results.map((row) => [row.type, row.enabled === 1]));
    return Object.fromEntries(PREFERENCE_TYPES.map((type) => [type, overrides.get(type) ?? true])) as Record<PreferenceType, boolean>;
}

export async function listNotifications(db: D1Database, userId: number): Promise<{ notifications: Notification[]; unreadCount: number }> {
    const [{ results }, unreadRow] = await Promise.all([
        db
            .prepare(
                `SELECT n.id, n.type, n.actor_user_id, users.username AS actor_username, n.target_type, n.target_id, n.read_at, n.created_at
                 FROM notifications n
                 JOIN users ON users.id = n.actor_user_id
                 WHERE n.user_id = ?
                 ORDER BY n.created_at DESC, n.id DESC
                 LIMIT ?`
            )
            .bind(userId, MAX_NOTIFICATIONS)
            .all<{
                id: number;
                type: NotificationType;
                actor_user_id: number;
                actor_username: string;
                target_type: string | null;
                target_id: number | null;
                read_at: string | null;
                created_at: string;
            }>(),
        db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(userId).first<{ count: number }>(),
    ]);

    return {
        notifications: results.map((row) => ({
            id: row.id,
            type: row.type,
            actorUserId: row.actor_user_id,
            actorUsername: row.actor_username,
            targetType: row.target_type,
            targetId: row.target_id,
            readAt: row.read_at,
            createdAt: row.created_at,
        })),
        unreadCount: unreadRow?.count ?? 0,
    };
}

export async function markNotificationRead(db: D1Database, userId: number, notificationId: number): Promise<void> {
    await db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL").bind(notificationId, userId).run();
}

export async function markAllNotificationsRead(db: D1Database, userId: number): Promise<void> {
    await db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL").bind(userId).run();
}
