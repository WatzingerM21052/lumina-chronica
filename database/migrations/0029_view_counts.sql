-- How often a book or project's page was opened by someone other than its
-- owner -- a plain counter, nothing about who looked. Feeds the "most/least
-- viewed" sort on Discover.
ALTER TABLE books ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
