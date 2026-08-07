-- 0016_ratings.sql
-- v3.0 (Community), Phase 3 (issue #307): 1-5 star ratings on books.
-- Source spec §50.2 gives only the bare field list (id, user_id, book_id,
-- rating, created_at) plus "Rating range: 1-5 Sterne" -- no endpoint or UI
-- is specified anywhere for this table, designed fresh here same as
-- followers (0015).
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE ratings (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_ratings_user_book ON ratings(user_id, book_id);
CREATE INDEX idx_ratings_book_id ON ratings(book_id);
