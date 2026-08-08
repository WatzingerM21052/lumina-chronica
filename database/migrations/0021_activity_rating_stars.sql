-- Splits "show my ratings in the public activity log at all" from "show the
-- actual star count within it" into two separate preferences (issue #315
-- Phase 3 follow-up, raised by the user while reviewing the redesign: a
-- visible star value on someone else's public profile is the actually
-- sensitive part, more than the fact that a rating happened at all).
--
-- ACTIVITY_RATING's default also flips from enabled to disabled here (see
-- notificationService.ts's new PREFERENCE_DEFAULTS) -- both are opt-in from
-- now on, not opt-out, since the "gates something genuinely personal" case
-- this table's own comment already called out for ACTIVITY_RATING applies
-- just as much to ACTIVITY_RATING_STARS.
--
-- SQLite/D1 can't ALTER a CHECK constraint in place -- recreate-and-copy is
-- the standard pattern (no prior migration needed one, this is the first).

CREATE TABLE user_preferences_new (
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK (type IN ('FOLLOW', 'COMMENT', 'RATING', 'SHARE', 'ACTIVITY_RATING', 'ACTIVITY_RATING_STARS')),
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, type)
);

INSERT INTO user_preferences_new (user_id, type, enabled)
SELECT user_id, type, enabled FROM user_preferences;

DROP TABLE user_preferences;

ALTER TABLE user_preferences_new RENAME TO user_preferences;
