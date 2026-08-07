-- 0013_project_links.sql
-- v2.0 (Worldbuilding), Phase 6 (issue #259): linked books and character
-- relationships. Neither table has spec precedent (Teil 4 §122 items 8 and
-- 10 name the purpose only, no schema) -- see documentation/Database.md.
--
-- Never edit this file after it has been merged — every future schema
-- change is a new migration file (Technical Standards §3).

-- Mirrors shelf_books exactly: a plain join table, no surrogate id. Only
-- books the caller owns can be linked (checked in projectBookService.ts).
CREATE TABLE project_books (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    book_id INTEGER NOT NULL REFERENCES books(id),
    PRIMARY KEY (project_id, book_id)
);

CREATE INDEX idx_project_books_book_id ON project_books(book_id);

-- Directional by convention (relationship_type is phrased from A to B, e.g.
-- "Mentor von") rather than a symmetric/undirected model. Character-to-
-- location relationships are out of scope for this phase (see issue #259).
CREATE TABLE character_relationships (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    character_a_id INTEGER NOT NULL REFERENCES characters(id),
    character_b_id INTEGER NOT NULL REFERENCES characters(id),
    relationship_type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_character_relationships_project_id ON character_relationships(project_id);
CREATE INDEX idx_character_relationships_character_a_id ON character_relationships(character_a_id);
CREATE INDEX idx_character_relationships_character_b_id ON character_relationships(character_b_id);
