-- 0004_organization.sql
-- Phase 5 (Organization): favorites, shelves, and shelf_books.
-- See documentation/Database.md for the full column reference.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE favorites (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id)
);

CREATE INDEX idx_favorites_user_id ON favorites(user_id);

CREATE TABLE shelves (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    visibility TEXT NOT NULL DEFAULT 'PRIVATE', -- PRIVATE | SHARED | PUBLIC (unenforced this phase, same as books.visibility)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shelves_owner_id ON shelves(owner_id);

CREATE TABLE shelf_books (
    shelf_id INTEGER NOT NULL REFERENCES shelves(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    PRIMARY KEY (shelf_id, book_id)
);
