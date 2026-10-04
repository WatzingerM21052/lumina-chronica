// A PUBLIC project's world, readable by anyone (user decision 2026-10-04):
// the project itself, its characters (with their relationships), places,
// timeline and lore, and the linked books that are public themselves.
// Files and the map stay private -- the map was owner-only from the start
// (#300) and files are working material. Nothing here is writable.

export type PublicProject = {
    id: number;
    title: string;
    description: string | null;
    type: string;
    coverUrl: string | null;
    ownerUsername: string;
    createdAt: string;
    characters: PublicCharacter[];
    relationships: PublicRelationship[];
    locations: PublicLocation[];
    timeline: PublicTimelineEvent[];
    lore: PublicLoreEntry[];
    books: PublicLinkedBook[];
};

export type PublicCharacter = {
    id: number;
    name: string;
    age: string | null;
    origin: string | null;
    description: string | null;
    personality: string | null;
    biography: string | null;
    imageUrl: string | null;
};

export type PublicRelationship = {
    characterAId: number;
    characterBId: number;
    relationshipType: string;
    description: string | null;
};

export type PublicLocation = { id: number; name: string; description: string | null; imageUrl: string | null };
export type PublicTimelineEvent = { id: number; title: string; date: string | null; description: string | null };
export type PublicLoreEntry = { id: number; title: string; content: string };
export type PublicLinkedBook = { id: number; title: string; author: string | null; coverUrl: string | null };

// The project when it is PUBLIC and its owner's account still exists;
// otherwise null (the route answers 404, telling nothing about a private
// project's existence).
export async function findPublicProjectRow(db: D1Database, projectId: number) {
    return db
        .prepare(
            `SELECT projects.id, projects.title, projects.description, projects.type, projects.cover_url, projects.created_at,
                    projects.owner_id, users.username AS owner_username
             FROM projects JOIN users ON users.id = projects.owner_id
             WHERE projects.id = ? AND projects.visibility = 'PUBLIC' AND users.deleted_at IS NULL`
        )
        .bind(projectId)
        .first<{
            id: number;
            title: string;
            description: string | null;
            type: string;
            cover_url: string | null;
            created_at: string;
            owner_id: number;
            owner_username: string;
        }>();
}

export async function getPublicProject(db: D1Database, projectId: number): Promise<{ project: PublicProject; ownerId: number } | null> {
    const row = await findPublicProjectRow(db, projectId);
    if (!row) return null;

    const [characters, relationships, locations, timeline, lore, books] = await db.batch([
        db.prepare("SELECT id, name, age, origin, description, personality, biography, image_url FROM characters WHERE project_id = ? ORDER BY name COLLATE NOCASE, id").bind(projectId),
        db.prepare("SELECT character_a_id, character_b_id, relationship_type, description FROM character_relationships WHERE project_id = ? ORDER BY id").bind(projectId),
        db.prepare("SELECT id, name, description, image_url FROM locations WHERE project_id = ? ORDER BY name COLLATE NOCASE, id").bind(projectId),
        db.prepare('SELECT id, title, date, description FROM timeline_events WHERE project_id = ? ORDER BY order_index, id').bind(projectId),
        db.prepare("SELECT id, title, content FROM lore_entries WHERE project_id = ? ORDER BY title COLLATE NOCASE, id").bind(projectId),
        db.prepare(
            `SELECT books.id, books.title, books.author, books.cover_url
             FROM project_books JOIN books ON books.id = project_books.book_id
             WHERE project_books.project_id = ? AND books.visibility = 'PUBLIC'
             ORDER BY books.title COLLATE NOCASE, books.id`
        ).bind(projectId),
    ]);

    type Row = Record<string, unknown>;
    const rows = (r: D1Result<unknown>) => r.results as Row[];
    const text = (v: unknown) => (typeof v === "string" ? v : null);
    const base = `/api/projects/${projectId}`;

    return {
        ownerId: row.owner_id,
        project: {
            id: row.id,
            title: row.title,
            description: row.description,
            type: row.type,
            coverUrl: row.cover_url ? `${base}/cover` : null,
            ownerUsername: row.owner_username,
            createdAt: row.created_at,
            characters: rows(characters).map((c) => ({
                id: c.id as number,
                name: c.name as string,
                age: text(c.age),
                origin: text(c.origin),
                description: text(c.description),
                personality: text(c.personality),
                biography: text(c.biography),
                imageUrl: c.image_url ? `${base}/characters/${c.id}/image` : null,
            })),
            relationships: rows(relationships).map((r) => ({
                characterAId: r.character_a_id as number,
                characterBId: r.character_b_id as number,
                relationshipType: r.relationship_type as string,
                description: text(r.description),
            })),
            locations: rows(locations).map((l) => ({
                id: l.id as number,
                name: l.name as string,
                description: text(l.description),
                imageUrl: l.image_url ? `${base}/locations/${l.id}/image` : null,
            })),
            timeline: rows(timeline).map((t) => ({ id: t.id as number, title: t.title as string, date: text(t.date), description: text(t.description) })),
            lore: rows(lore).map((e) => ({ id: e.id as number, title: e.title as string, content: (e.content as string) ?? "" })),
            books: rows(books).map((b) => ({
                id: b.id as number,
                title: b.title as string,
                author: text(b.author),
                coverUrl: b.cover_url ? `/api/books/${b.id}/cover` : null,
            })),
        },
    };
}

// May the viewer see this project's pictures (characters, places)? The
// owner always; anyone else only while the project is PUBLIC.
export async function canSeeProjectPictures(db: D1Database, viewerId: number | null, projectId: number): Promise<boolean> {
    if (viewerId !== null) {
        const owns = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, viewerId).first();
        if (owns) return true;
    }
    return (await findPublicProjectRow(db, projectId)) !== null;
}

// One more look by someone other than the owner (a plain counter, see
// migration 0029).
export async function countProjectView(db: D1Database, projectId: number): Promise<void> {
    await db.prepare("UPDATE projects SET view_count = view_count + 1 WHERE id = ?").bind(projectId).run();
}

export async function countBookView(db: D1Database, bookId: number): Promise<void> {
    await db.prepare("UPDATE books SET view_count = view_count + 1 WHERE id = ?").bind(bookId).run();
}
