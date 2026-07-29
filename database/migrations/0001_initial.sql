-- 0001_initial.sql
-- Phase 1 (Technical Foundation): just enough schema to prove D1
-- connectivity end-to-end. Full auth logic (registration/login/password
-- hashing) is Phase 2 — see documentation/Database.md.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL DEFAULT '[]', -- JSON array, see documentation/Database.md
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    role_id INTEGER NOT NULL REFERENCES roles(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE INDEX idx_users_role_id ON users(role_id);

CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    theme TEXT NOT NULL DEFAULT 'classic-library', -- classic-library | modern-light | dark-library | system
    reader_mode TEXT NOT NULL DEFAULT 'book',
    font_size INTEGER NOT NULL DEFAULT 18,
    language TEXT NOT NULL DEFAULT 'de',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (name, permissions) VALUES
    ('USER', '[]'),
    ('ADMIN', '["*"]');
