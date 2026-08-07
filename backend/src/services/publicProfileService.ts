// Community Phase 1 (issue #300) -- composes the public-safe projections
// from userService/bookService/projectService into one response for
// GET /api/users/:username/public. No ownerId anywhere in this file: every
// query underneath is visibility = 'PUBLIC'-scoped, not owner-scoped, since
// this is the one endpoint meant to be read by a logged-out visitor.

import { getUserByUsername, type PublicUserProfile } from "./userService";
import { listPublicBooksByUsername, type PublicBookSummary } from "./bookService";
import { listPublicProjectsByUsername, type PublicProjectSummary } from "./projectService";

export type PublicProfile = PublicUserProfile & {
    books: PublicBookSummary[];
    projects: PublicProjectSummary[];
};

export async function getPublicProfile(db: D1Database, username: string): Promise<PublicProfile | null> {
    const user = await getUserByUsername(db, username);
    if (!user) return null;

    const [books, projects] = await Promise.all([listPublicBooksByUsername(db, username), listPublicProjectsByUsername(db, username)]);

    return { ...user, books, projects };
}
