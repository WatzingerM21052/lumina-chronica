-- 0018_profile_activities.sql
-- v3.3 (Community follow-up), Phase 1 (issue #324): a log of a profile
-- owner's own public actions, shown on /u/{username}'s "Aktivitäten"
-- section. Deliberately named profile_activities, not activities -- there
-- is already a reading_activity table (0007) powering the Lesekalender
-- heatmap, a different concept (per-day reading counts vs. a public event
-- log); reusing the bare name next to that one would be a footgun.
--
-- target_id has no FK -- target_type is polymorphic (BOOK/PROJECT), same
-- shape as the spec's own comments table design (§50.3). Every INSERT/DELETE
-- path that creates a BOOK/PROJECT-targeted row here must also be added to
-- deleteBook/deleteProject's cleanup batch, or a book/project delete will
-- leave orphaned rows (harmless for FK integrity since there's no FK, but
-- still wrong -- covered by a regression test instead of relying on that).
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE profile_activities (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('BOOK_PUBLIC', 'PROJECT_PUBLIC', 'RATING_GIVEN')),
    target_type TEXT NOT NULL CHECK (target_type IN ('BOOK', 'PROJECT')),
    target_id INTEGER NOT NULL,
    -- Snapshot of the rating value at creation time (RATING_GIVEN only) --
    -- not live-joined against `ratings`, so the log stays truthful even if
    -- the user later changes or removes their rating.
    rating INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_profile_activities_user_id ON profile_activities(user_id, created_at DESC);
