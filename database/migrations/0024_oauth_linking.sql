-- 0024_oauth_linking.sql
-- OAuth account linking (Roadmap "Profile functions", 3rd of 3). An
-- already-authenticated user can link an additional Google/GitHub identity
-- from their Profile page. oauth_states already exists (0005_oauth.sql) to
-- survive the redirect round-trip to the provider and back -- linking_user_id
-- rides along on the same row: NULL means "ordinary login flow" (today's
-- only case), set means "this callback should link onto that user, not log
-- someone in."
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

ALTER TABLE oauth_states ADD COLUMN linking_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
