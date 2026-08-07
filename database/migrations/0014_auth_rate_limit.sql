-- 0014_auth_rate_limit.sql
-- v2.1 (Sicherheit): throttles POST /api/auth/login and /api/auth/register
-- against brute-force/credential-stuffing and mass account creation. A
-- fixed-window counter keyed by (route, ip, identifier) -- not a precise
-- sliding window or token bucket, since this is D1-backed (no KV
-- namespace is provisioned on the Workers Free plan, see
-- documentation/Architecture.md) and a coarse fixed window is more than
-- enough to blunt automated abuse. identifier is the attempted
-- username/email for "login" and '' (IP-only) for "register" -- login is
-- throttled per (ip, identifier) pair rather than identifier alone so an
-- attacker spamming a victim's username from many IPs cannot lock the
-- victim's own account out of the same endpoint.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE auth_rate_limits (
    id INTEGER PRIMARY KEY,
    route TEXT NOT NULL,
    ip TEXT NOT NULL,
    identifier TEXT NOT NULL DEFAULT '',
    attempt_count INTEGER NOT NULL DEFAULT 1,
    expires_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_auth_rate_limits_key ON auth_rate_limits(route, ip, identifier);
