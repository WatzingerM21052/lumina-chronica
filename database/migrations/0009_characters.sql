-- 0009_characters.sql
-- v2.0 (Worldbuilding), Phase 2 (issue #255): character management within a
-- project. See documentation/Database.md for the full column reference.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    age TEXT,
    origin TEXT,
    personality TEXT,
    biography TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_characters_project_id ON characters(project_id);
