-- 0019_comments.sql
-- v3.3 (Community follow-up), Phase 2 (issue #325): comments on books and
-- projects. Source spec §50.3 gives the bare field list (id, user_id,
-- target_type, target_id, content, created_at) and marks the table
-- "Spätere Version" -- no enum of valid target_type values given. Resolved
-- via AskUserQuestion (2026-08-08): comments on Books + Projects only, no
-- new public page type.
--
-- target_id has no FK -- target_type is polymorphic, same shape as
-- profile_activities (migration 0018). Every INSERT/DELETE path targeting
-- a BOOK/PROJECT must also be added to deleteBook/deleteProject's cleanup
-- batch, or a delete will leave orphaned rows.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE comments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('BOOK', 'PROJECT')),
    target_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_target ON comments(target_type, target_id, created_at);
CREATE INDEX idx_comments_user_id ON comments(user_id);
