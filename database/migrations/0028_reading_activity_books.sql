-- Lesekalender day detail: which books were read on a day and how far.
-- reading_activity (0007) only knows that a day was active; this adds one
-- row per user, day and book with the progress at the first and the last
-- save of that day, so the calendar tooltip can show pages read
-- ((end - start) x book_metadata.pages) and the book titles. Days before
-- this migration have no rows and keep showing activity only.
CREATE TABLE reading_activity_books (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    activity_date TEXT NOT NULL,
    start_percentage FLOAT NOT NULL,
    end_percentage FLOAT NOT NULL,
    UNIQUE (user_id, activity_date, book_id)
);

CREATE INDEX idx_reading_activity_books_user_date ON reading_activity_books(user_id, activity_date);
