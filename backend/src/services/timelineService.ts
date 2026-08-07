// Timeline events -- v2.0, Phase 4 (issue #257). See
// documentation/Architecture.md and documentation/Database.md for the
// schema. No owner_id of its own -- access control walks up to "do you own
// the parent project," same shape as characterService.ts/locationService.ts.

import { ValidationError } from "./fileValidation";
import { NotFoundError } from "./errors";

export { NotFoundError, ValidationError };

export type TimelineEventSummary = {
    id: number;
    projectId: number;
    title: string;
    description: string | null;
    date: string | null;
    order: number;
    createdAt: string;
};

type TimelineEventRow = {
    id: number;
    project_id: number;
    title: string;
    description: string | null;
    date: string | null;
    order_index: number;
    created_at: string;
};

async function assertOwnsProject(db: D1Database, ownerId: number, projectId: number): Promise<void> {
    const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?").bind(projectId, ownerId).first();
    if (!row) throw new NotFoundError();
}

async function findTimelineEventRow(db: D1Database, projectId: number, eventId: number): Promise<TimelineEventRow | null> {
    return db.prepare("SELECT * FROM timeline_events WHERE id = ? AND project_id = ?").bind(eventId, projectId).first<TimelineEventRow>();
}

function toSummary(row: TimelineEventRow): TimelineEventSummary {
    return {
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        description: row.description,
        date: row.date,
        order: row.order_index,
        createdAt: row.created_at,
    };
}

export type CreateTimelineEventInput = {
    title: string;
    description?: string;
    date?: string;
};

export async function createTimelineEvent(db: D1Database, ownerId: number, projectId: number, input: CreateTimelineEventInput): Promise<TimelineEventSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    if (!input.title.trim()) throw new ValidationError("title is required.");

    const maxOrderRow = await db.prepare("SELECT MAX(order_index) AS max_order FROM timeline_events WHERE project_id = ?").bind(projectId).first<{ max_order: number | null }>();
    const nextOrder = (maxOrderRow?.max_order ?? -1) + 1;

    const insert = await db
        .prepare("INSERT INTO timeline_events (project_id, title, description, date, order_index) VALUES (?, ?, ?, ?, ?)")
        .bind(projectId, input.title, input.description ?? null, input.date ?? null, nextOrder)
        .run();
    const eventId = insert.meta.last_row_id as number;

    const row = await findTimelineEventRow(db, projectId, eventId);
    if (!row) throw new Error("Timeline event disappeared right after creation.");
    return toSummary(row);
}

export async function listTimelineEvents(db: D1Database, ownerId: number, projectId: number): Promise<TimelineEventSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const rows = await db.prepare("SELECT * FROM timeline_events WHERE project_id = ? ORDER BY order_index ASC").bind(projectId).all<TimelineEventRow>();
    return rows.results.map(toSummary);
}

export async function getTimelineEvent(db: D1Database, ownerId: number, projectId: number, eventId: number): Promise<TimelineEventSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findTimelineEventRow(db, projectId, eventId);
    if (!row) throw new NotFoundError();
    return toSummary(row);
}

export type UpdateTimelineEventInput = {
    title?: string;
    description?: string | null;
    date?: string | null;
};

export async function updateTimelineEvent(db: D1Database, ownerId: number, projectId: number, eventId: number, input: UpdateTimelineEventInput): Promise<TimelineEventSummary> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findTimelineEventRow(db, projectId, eventId);
    if (!row) throw new NotFoundError();
    if (input.title !== undefined && !input.title.trim()) throw new ValidationError("title cannot be empty.");

    await db
        .prepare("UPDATE timeline_events SET title = ?, description = ?, date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(input.title ?? row.title, input.description !== undefined ? input.description : row.description, input.date !== undefined ? input.date : row.date, eventId)
        .run();

    return getTimelineEvent(db, ownerId, projectId, eventId);
}

export async function deleteTimelineEvent(db: D1Database, ownerId: number, projectId: number, eventId: number): Promise<void> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findTimelineEventRow(db, projectId, eventId);
    if (!row) throw new NotFoundError();

    await db.prepare("DELETE FROM timeline_events WHERE id = ?").bind(eventId).run();
}

export type MoveDirection = "up" | "down";

// Swaps order_index with the adjacent event in that direction -- kept
// server-side (rather than the frontend computing new indices for two rows
// and issuing two PUTs) so the swap is atomic and the frontend never needs
// to know the ordering scheme, just "move this one up/down."
export async function moveTimelineEvent(db: D1Database, ownerId: number, projectId: number, eventId: number, direction: MoveDirection): Promise<TimelineEventSummary[]> {
    await assertOwnsProject(db, ownerId, projectId);
    const row = await findTimelineEventRow(db, projectId, eventId);
    if (!row) throw new NotFoundError();

    const neighborRow = await db
        .prepare(
            direction === "up"
                ? "SELECT * FROM timeline_events WHERE project_id = ? AND order_index < ? ORDER BY order_index DESC LIMIT 1"
                : "SELECT * FROM timeline_events WHERE project_id = ? AND order_index > ? ORDER BY order_index ASC LIMIT 1"
        )
        .bind(projectId, row.order_index)
        .first<TimelineEventRow>();

    if (neighborRow) {
        await db.batch([
            db.prepare("UPDATE timeline_events SET order_index = ? WHERE id = ?").bind(neighborRow.order_index, row.id),
            db.prepare("UPDATE timeline_events SET order_index = ? WHERE id = ?").bind(row.order_index, neighborRow.id),
        ]);
    }

    return listTimelineEvents(db, ownerId, projectId);
}

// Used by deleteProject (projectService.ts) to clean up a project's
// timeline events before the project row itself is deleted -- real D1
// enforces foreign keys, same lesson as deleteCharactersForProject.
export async function deleteTimelineEventsForProject(db: D1Database, projectId: number): Promise<void> {
    await db.prepare("DELETE FROM timeline_events WHERE project_id = ?").bind(projectId).run();
}
