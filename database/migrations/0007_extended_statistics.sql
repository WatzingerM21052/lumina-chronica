-- 0007_extended_statistics.sql
-- v1.5 (Personalisierung, §101 "Erweiterte Statistik"): Jahresübersicht,
-- Lesekalender, Ziele. See documentation/Database.md for the full column
-- reference and why this adds a lightweight activity log rather than full
-- session-time tracking (still out of scope, same as "Lesedauer" always
-- has been -- see statisticsService.ts).
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

-- One row per user per calendar day they saved reading progress at least
-- once -- powers the Lesekalender heatmap and streak/Jahresübersicht
-- calculations without needing real session start/stop instrumentation.
CREATE TABLE reading_activity (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    activity_date TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, activity_date)
);

CREATE INDEX idx_reading_activity_user_date ON reading_activity(user_id, activity_date);

-- A user-set yearly target book count for the Ziele (goals) card. Added to
-- the existing user_settings row rather than a new table -- same one-column
-- extension pattern as OAuth's sentinel password hash, since this is a
-- single nullable field with no independent lifecycle of its own.
ALTER TABLE user_settings ADD COLUMN reading_goal_books INTEGER;
