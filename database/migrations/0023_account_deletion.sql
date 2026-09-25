-- Account deletion (Roadmap "Profile functions", 2nd of 3 -- avatar upload
-- was #463). users.username/email are UNIQUE table-wide, not scoped to
-- deleted_at (0001_initial.sql), and rebuilding the users table to change
-- that is documented as broken against real D1 in 0005_oauth.sql's own
-- comment (FOREIGN KEY constraint error on DROP TABLE -- users has several
-- incoming FKs). So instead of touching the constraint: on delete, the
-- live username/email get overwritten with a generated placeholder (freeing
-- them immediately, zero constraint risk), and the ORIGINAL values move into
-- these two new columns so a later registration with the same email can
-- find and restore this exact row (see authService.ts's registerUser /
-- restoreUser). Restored accounts clear these back to NULL.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE users ADD COLUMN deleted_username TEXT;
ALTER TABLE users ADD COLUMN deleted_email TEXT;
