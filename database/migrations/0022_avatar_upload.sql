-- Lets email/password users upload their own avatar (OAuth users already
-- get one automatically from their provider, stored in users.avatar_url).
--
-- Kept separate from avatar_url rather than repurposing it: avatar_url
-- holds an external URL we don't own (Google/GitHub's own CDN) and never
-- touch R2 for; avatar_key holds our own R2 object key for a self-hosted
-- upload, which the app DOES need to manage (delete on replace). Mixing
-- "external URL" and "our own R2 key" into one column would need a
-- string-prefix check to tell them apart before ever deleting an R2
-- object -- a dedicated column makes that distinction structural instead
-- of inferred. When both are set, avatar_key wins (resolved to a public
-- serving URL at read time, see userService.ts).
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE users ADD COLUMN avatar_key TEXT;
