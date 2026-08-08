-- In-app notifications with per-type preferences -- v3.3 Phase 3 (issue
-- #326). Triggers: FOLLOW, COMMENT, RATING, SHARE. No email/push.

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('FOLLOW', 'COMMENT', 'RATING', 'SHARE')),
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    target_type TEXT,
    target_id INTEGER,
    read_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);

-- Row-per-type preferences, default enabled (absence of a row = enabled).
-- Covers the 4 notification types plus ACTIVITY_RATING, a fifth type that
-- gates profile_activities' RATING_GIVEN entries rather than a
-- notification -- same "enable/disable what you want" mechanism the user
-- asked for, reused instead of a second parallel table (added to scope via
-- AskUserQuestion, 2026-08-08, alongside Phase 3's initial scoping).
CREATE TABLE user_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('FOLLOW', 'COMMENT', 'RATING', 'SHARE', 'ACTIVITY_RATING')),
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, type)
);
