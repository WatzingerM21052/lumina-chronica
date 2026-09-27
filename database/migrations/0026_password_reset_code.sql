-- 0026_password_reset_code.sql
-- Adds the short human-typeable code to the existing link-token row
-- (0025_password_reset.sql). One row carries BOTH credentials; consuming
-- via either kills both. See
-- docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md §3.
--
-- code_hash is an HMAC-SHA256 (keyed with a Worker secret), NOT a plain
-- sha256Hex like token_hash: token_hash covers a 256-bit random value where
-- a preimage search is hopeless, code_hash covers a 10^6 keyspace that a
-- plain SHA-256 dump reverses in milliseconds.
--
-- attempt_count is the real brute-force defense. The existing
-- auth_rate_limits table keys on (route, ip, identifier) and an attacker
-- rotating IPs walks straight past it; this counter lives on the row the
-- attacker is actually attacking and cannot be moved.
--
-- Nullable: rows created before this migration (and, if we ever want it, a
-- link-only reset) legitimately have no code.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE password_reset_tokens ADD COLUMN code_hash TEXT;
ALTER TABLE password_reset_tokens ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

-- Lookup is always scoped by user_id (a 6-digit code is NOT globally unique
-- -- two concurrent resets can collide), so the useful index is on the
-- lookup key, not on code_hash alone.
CREATE INDEX idx_password_reset_tokens_user_live
    ON password_reset_tokens(user_id, consumed_at, expires_at);
