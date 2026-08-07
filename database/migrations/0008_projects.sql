-- 0008_projects.sql
-- v2.0 (Worldbuilding), Phase 1 (issue #254): the foundational `projects`
-- resource every later Worldbuilding phase (Characters, Locations/Map,
-- Timeline, Lore/Files, Linked Books/Relationships) nests under.
-- See documentation/Database.md for the full column reference.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'WORLD', -- WORLD | NOVEL | RPG | CUSTOM -- cosmetic/label only, not a feature gate
    cover_url TEXT,
    map_url TEXT, -- set in Phase 3 (Locations & Map, issue #256); NULL until then
    visibility TEXT NOT NULL DEFAULT 'PRIVATE', -- PRIVATE | SHARED | PUBLIC (unenforced this phase, same as books.visibility)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);
