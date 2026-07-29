-- 0002_books.sql
-- Phase 3 (Library): book model, files, metadata, and tags.
-- See documentation/Database.md for the full column reference.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,
    language TEXT,
    genre TEXT,
    visibility TEXT NOT NULL DEFAULT 'PRIVATE', -- PRIVATE | SHARED | PUBLIC (only PRIVATE is enforced this phase)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_books_owner_id ON books(owner_id);
CREATE INDEX idx_books_genre ON books(genre);

CREATE TABLE book_files (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id),
    file_url TEXT NOT NULL,
    format TEXT NOT NULL, -- EPUB | PDF | TXT | MD
    size INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_book_files_book_id ON book_files(book_id);

CREATE TABLE book_metadata (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL UNIQUE REFERENCES books(id),
    isbn TEXT,
    publisher TEXT,
    release_date DATE,
    pages INTEGER
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE book_tags (
    book_id INTEGER NOT NULL REFERENCES books(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (book_id, tag_id)
);
