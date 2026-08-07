-- 0006_bookmarks.sql
-- v1.5 (Personalisierung): user-created bookmarks within a book, distinct
-- from reading_progress's single auto-saved resume position -- a user can
-- have any number of bookmarks per book. See documentation/Database.md for
-- the full column reference and why this uses reading_progress's
-- chapter/position/percentage shape instead of the source spec's single
-- "location" field.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    chapter INTEGER,
    position TEXT,
    percentage FLOAT NOT NULL DEFAULT 0,
    note TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookmarks_user_book ON bookmarks(user_id, book_id);
