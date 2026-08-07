-- 0011_timeline.sql
-- v2.0 (Worldbuilding), Phase 4 (issue #257): chronological in-world events
-- within a project. See documentation/Database.md for the full column
-- reference.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE timeline_events (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    date TEXT, -- free-form in-world date ("Jahr 1247 der Dritten Ära") -- not a real DATE, see Architecture.md
    order_index INTEGER NOT NULL DEFAULT 0, -- manual sequence; date can't be sorted reliably since it's free text
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timeline_events_project_id ON timeline_events(project_id);
