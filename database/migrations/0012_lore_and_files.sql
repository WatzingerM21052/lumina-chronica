-- 0012_lore_and_files.sql
-- v2.0 (Worldbuilding), Phase 5 (issue #258): lore entries (no spec
-- precedent -- see documentation/Database.md) and a project-level
-- documents/images gallery (Teil 4 §49.6 names the purpose only, no field
-- list; the Map already got a first-class column in 0010_locations.sql, so
-- this table is scoped to the two remaining genuinely file-shaped items).
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE lore_entries (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    content TEXT, -- Markdown, rendered via the existing Markdig pipeline
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lore_entries_project_id ON lore_entries(project_id);

CREATE TABLE project_files (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    file_url TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- DOCUMENT | IMAGE
    size INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_files_project_id ON project_files(project_id);
