// Character relationships -- v2.0, Phase 6 (issue #259). No spec precedent
// (see documentation/Database.md). Directional by convention:
// relationship_type is phrased from character A to character B (e.g.
// "Mentor von"), not a symmetric/undirected model. Character-to-location
// relationships are out of scope for this phase.

import { ValidationError } from "./fileValidation";
import { NotFoundError } from "./errors";

export { NotFoundError, ValidationError };

export type CharacterRelationshipSummary = {
    id: number;
    projectId: number;
    characterAId: number;
    characterAName: string;
    characterBId: number;
    characterBName: string;
    relationshipType: string;
    description: string | null;
    createdAt: string;
};

type CharacterRelationshipRow = {
    id: number;
    project_id: number;
    character_a_id: number;
    character_a_name: string;
    character_b_id: number;
    character_b_name: string;
    relationship_type: string;
    description: string | null;
    created_at: string;
};

const SELECT_WITH_NAMES = `SELECT
    character_relationships.id AS id,
    character_relationships.project_id AS project_id,
    character_relationships.character_a_id AS character_a_id,
    ca.name AS character_a_name,
    character_relationships.character_b_id AS character_b_id,
    cb.name AS character_b_name,
    character_relationships.relationship_type AS relationship_type,
    character_relationships.description AS description,
    character_relationships.created_at AS created_at
    FROM character_relationships
    JOIN characters ca ON ca.id = character_relationships.character_a_id
    JOIN characters cb ON cb.id = character_relationships.character_b_id`;

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

// Both characters must belong to this project -- otherwise a caller could
// link characters across their own other projects (or, combined with a
// missing ownership check, someone else's characters entirely).
async function assertCharactersInProject(db: D1Database, projectId: number, characterAId: number, characterBId: number): Promise<void> {
    const rows = await db
        .prepare("SELECT id FROM characters WHERE project_id = ? AND id IN (?, ?)")
        .bind(projectId, characterAId, characterBId)
        .all<{ id: number }>();
    if (rows.results.length !== 2) throw new ValidationError("Both characters must belong to this project.");
}

async function findRelationshipRow(db: D1Database, projectId: number, relationshipId: number): Promise<CharacterRelationshipRow | null> {
    return db
        .prepare(`${SELECT_WITH_NAMES} WHERE character_relationships.id = ? AND character_relationships.project_id = ?`)
        .bind(relationshipId, projectId)
        .first<CharacterRelationshipRow>();
}

function toSummary(row: CharacterRelationshipRow): CharacterRelationshipSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        characterAId: row.character_a_id,
        characterAName: row.character_a_name,
        characterBId: row.character_b_id,
        characterBName: row.character_b_name,
        relationshipType: row.relationship_type,
        description: row.description,
        createdAt: row.created_at,
    };
}

export type CreateCharacterRelationshipInput = {
    characterAId: number;
    characterBId: number;
    relationshipType: string;
    description?: string;
};

export async function createCharacterRelationship(
    db: D1Database,
    ownerId: number,
    projectId: number,
    input: CreateCharacterRelationshipInput
): Promise<CharacterRelationshipSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    if (!input.relationshipType?.trim()) throw new ValidationError("relationshipType is required.");
    if (input.characterAId === input.characterBId) throw new ValidationError("A character cannot have a relationship with itself.");
    await assertCharactersInProject(db, projectId, input.characterAId, input.characterBId);

    const insert = await db
        .prepare("INSERT INTO character_relationships (project_id, character_a_id, character_b_id, relationship_type, description) VALUES (?, ?, ?, ?, ?)")
        .bind(projectId, input.characterAId, input.characterBId, input.relationshipType, input.description ?? null)
        .run();
    const relationshipId = insert.meta.last_row_id as number;

    const row = await findRelationshipRow(db, projectId, relationshipId);
    if (!row) throw new Error("Relationship disappeared right after creation.");
    return toSummary(row);
}

export async function listCharacterRelationships(db: D1Database, ownerId: number, projectId: number): Promise<CharacterRelationshipSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const rows = await db
        .prepare(`${SELECT_WITH_NAMES} WHERE character_relationships.project_id = ? ORDER BY character_relationships.created_at DESC, character_relationships.id DESC`)
        .bind(projectId)
        .all<CharacterRelationshipRow>();
    return rows.results.map(toSummary);
}

export type UpdateCharacterRelationshipInput = {
    relationshipType?: string;
    description?: string | null;
};

export async function updateCharacterRelationship(
    db: D1Database,
    ownerId: number,
    projectId: number,
    relationshipId: number,
    input: UpdateCharacterRelationshipInput
): Promise<CharacterRelationshipSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findRelationshipRow(db, projectId, relationshipId);
    if (!row) throw new NotFoundError();
    if (input.relationshipType !== undefined && !input.relationshipType.trim()) throw new ValidationError("relationshipType cannot be empty.");

    await db
        .prepare("UPDATE character_relationships SET relationship_type = ?, description = ? WHERE id = ?")
        .bind(input.relationshipType ?? row.relationship_type, input.description !== undefined ? input.description : row.description, relationshipId)
        .run();

    const updated = await findRelationshipRow(db, projectId, relationshipId);
    if (!updated) throw new NotFoundError();
    return toSummary(updated);
}

export async function deleteCharacterRelationship(db: D1Database, ownerId: number, projectId: number, relationshipId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findRelationshipRow(db, projectId, relationshipId);
    if (!row) throw new NotFoundError();
    await db.prepare("DELETE FROM character_relationships WHERE id = ?").bind(relationshipId).run();
}

// Used by deleteProject (projectService.ts) to clean up a project's
// relationships before the project row itself is deleted -- real D1
// enforces foreign keys, same lesson as deleteCharactersForProject.
export async function deleteCharacterRelationshipsForProject(db: D1Database, projectId: number): Promise<void> {
    await db.prepare("DELETE FROM character_relationships WHERE project_id = ?").bind(projectId).run();
}

// Used by deleteCharacter (characterService.ts) -- a character being
// deleted may still be referenced by relationships pointing at it from
// either side, which real D1's foreign keys would otherwise reject.
export async function deleteCharacterRelationshipsForCharacter(db: D1Database, characterId: number): Promise<void> {
    await db.prepare("DELETE FROM character_relationships WHERE character_a_id = ? OR character_b_id = ?").bind(characterId, characterId).run();
}
