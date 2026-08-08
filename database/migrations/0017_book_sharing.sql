-- 0017_book_sharing.sql
-- Follow-up to v3.1 (issue #316): PUBLIC/SHARED semantics swap requested by
-- the user right after v3.1.0 shipped (issue #321). PUBLIC now means "any
-- logged-in user can fully read", SHARED becomes explicit per-book sharing
-- with a chosen set of people rather than "any logged-in user".
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE book_shares (
    book_id INTEGER NOT NULL REFERENCES books(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, user_id)
);

CREATE INDEX idx_book_shares_user_id ON book_shares(user_id);

-- Whether a non-listed person still sees the SHARED book's cover+description
-- teaser on the owner's public profile. Defaults to visible (1), matching
-- how SHARED already behaved before this migration, so existing SHARED
-- books don't silently disappear from anyone's view when this ships.
ALTER TABLE books ADD COLUMN shared_teaser_visible INTEGER NOT NULL DEFAULT 1;
