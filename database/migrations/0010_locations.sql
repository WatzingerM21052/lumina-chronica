-- 0010_locations.sql
-- v2.0 (Worldbuilding), Phase 3 (issue #256): locations within a project,
-- placeable as pins on the project's map (projects.map_url, added in
-- 0008_projects.sql). See documentation/Database.md for the full column
-- reference.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

CREATE TABLE locations (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    x FLOAT, -- percentage (0-100) position on the project's map image; NULL = not placed yet
    y FLOAT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_locations_project_id ON locations(project_id);
