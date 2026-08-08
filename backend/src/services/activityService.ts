// Profile activity log -- v3.3 (Community follow-up), Phase 1 (issue #324).
// A log of the *profile owner's own* public actions, folded into
// getPublicProfile's response and rendered on /u/{username}'s
// "Aktivitäten" section. See migration 0018_profile_activities.sql for why
// the table is named profile_activities, not activities (reading_activity,
// migration 0007, is an unrelated per-day reading-count table).
//
// No aggregated "home feed" across followed users here -- that's a
// possible later story, out of scope for this first version (confirmed via
// AskUserQuestion, 2026-08-08).

import { isPreferenceEnabled } from "./notificationService";

export type ActivityType = "BOOK_PUBLIC" | "PROJECT_PUBLIC" | "RATING_GIVEN";
export type ActivityTargetType = "BOOK" | "PROJECT";

export type ProfileActivity = {
    id: number;
    type: ActivityType;
    targetType: ActivityTargetType;
    targetId: number;
    // Null if the target book/project has since been deleted. In practice
    // this shouldn't happen -- deleteBook/deleteProject clean up their
    // profile_activities rows -- but target_id has no FK (polymorphic), so
    // this stays defensive rather than assuming the join always hits.
    targetTitle: string | null;
    rating: number | null;
    createdAt: string;
};

const MAX_ACTIVITIES = 50;

export async function recordBookPublicActivity(db: D1Database, userId: number, bookId: number): Promise<void> {
    await db
        .prepare(`INSERT INTO profile_activities (user_id, type, target_type, target_id) VALUES (?, 'BOOK_PUBLIC', 'BOOK', ?)`)
        .bind(userId, bookId)
        .run();
}

export async function recordProjectPublicActivity(db: D1Database, userId: number, projectId: number): Promise<void> {
    await db
        .prepare(`INSERT INTO profile_activities (user_id, type, target_type, target_id) VALUES (?, 'PROJECT_PUBLIC', 'PROJECT', ?)`)
        .bind(userId, projectId)
        .run();
}

// Gated by the ACTIVITY_RATING preference (v3.3 Phase 3, issue #326) --
// rating activity is the first profile_activities entry that reveals a
// specific action (who rated what), unlike BOOK_PUBLIC/PROJECT_PUBLIC which
// just restate something already public. Users can opt out of this one
// specifically without disabling the whole activity log.
export async function recordRatingActivity(db: D1Database, userId: number, bookId: number, rating: number): Promise<void> {
    if (!(await isPreferenceEnabled(db, userId, "ACTIVITY_RATING"))) return;
    await db
        .prepare(`INSERT INTO profile_activities (user_id, type, target_type, target_id, rating) VALUES (?, 'RATING_GIVEN', 'BOOK', ?, ?)`)
        .bind(userId, bookId, rating)
        .run();
}

export async function listProfileActivities(db: D1Database, userId: number): Promise<ProfileActivity[]> {
    const { results } = await db
        .prepare(
            `SELECT pa.id, pa.type, pa.target_type, pa.target_id, pa.rating, pa.created_at,
                    COALESCE(books.title, projects.title) AS target_title
             FROM profile_activities pa
             LEFT JOIN books ON pa.target_type = 'BOOK' AND books.id = pa.target_id
             LEFT JOIN projects ON pa.target_type = 'PROJECT' AND projects.id = pa.target_id
             WHERE pa.user_id = ?
             ORDER BY pa.created_at DESC, pa.id DESC
             LIMIT ?`
        )
        .bind(userId, MAX_ACTIVITIES)
        .all<{
            id: number;
            type: ActivityType;
            target_type: ActivityTargetType;
            target_id: number;
            rating: number | null;
            created_at: string;
            target_title: string | null;
        }>();

    return results.map((row) => ({
        id: row.id,
        type: row.type,
        targetType: row.target_type,
        targetId: row.target_id,
        targetTitle: row.target_title,
        rating: row.rating,
        createdAt: row.created_at,
    }));
}
