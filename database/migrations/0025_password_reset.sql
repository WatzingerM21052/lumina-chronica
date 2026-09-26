-- 0025_password_reset.sql
-- Forgot-password flow. Mirrors oauth_exchange_codes (0005_oauth.sql):
-- only a hash of the raw token is ever stored, single-use via consumed_at,
-- time-boxed via expires_at. TTL is 1 hour (set in
-- passwordResetService.ts) -- much longer than the exchange code's 2
-- minutes, since that one only has to survive an immediate redirect round
-- trip and this one has to survive the user actually checking their email.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
