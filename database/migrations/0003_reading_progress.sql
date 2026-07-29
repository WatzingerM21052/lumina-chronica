-- 0003_reading_progress.sql
-- Phase 4 (Reader): tracks per-user, per-book reading position.
-- See documentation/Database.md for the full column reference and the
-- per-format `position` semantics (deliberately TEXT, not the FLOAT shown
-- in the source spec's extracted field table -- see documentation/Architecture.md).
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE reading_progress (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    chapter INTEGER,
    position TEXT,
    percentage FLOAT NOT NULL DEFAULT 0,
    last_opened DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, book_id)
);

CREATE INDEX idx_reading_progress_book_id ON reading_progress(book_id);
