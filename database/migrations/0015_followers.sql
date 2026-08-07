-- 0015_followers.sql
-- v3.0 (Community), Phase 2 (issue #304): user-follows-user. Source spec
-- §50.1 gives only the bare field list (follower_id, following_id,
-- created_at) -- no endpoint or UI is specified anywhere for this table,
-- designed fresh here same as several v2.0 sub-resources.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE followers (
    follower_id INTEGER NOT NULL REFERENCES users(id),
    following_id INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_followers_following_id ON followers(following_id);
