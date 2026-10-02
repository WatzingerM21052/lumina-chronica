-- Review N-7: revoke sessions. Every JWT carries the user's token_version
-- as "tv"; requireAuth rejects a token whose tv no longer matches. Bumped
-- by "log out all other devices", a password reset and account deletion.
-- Tokens issued before this column existed carry no tv and count as 0, so
-- adding it logs nobody out.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
