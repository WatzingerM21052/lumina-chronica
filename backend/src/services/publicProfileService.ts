// Community Phase 1 (issue #300) -- composes the public-safe projections
// from userService/bookService/projectService into one response for
// GET /api/users/:username/public. No ownerId anywhere in the books/projects
// queries: every one of those is visibility = 'PUBLIC'-scoped, not
// owner-scoped, since this is the one endpoint meant to be read by a
// logged-out visitor. Phase 2 (issue #304) adds viewerId (nullable --
// optionalAuth, not requireAuth) so the response can carry follow state
// without requiring the caller to be logged in at all.

import { getUserByUsername } from "./userService";
import { listPublicBooksByUsername, type PublicBookSummary } from "./bookService";
import { listPublicProjectsByUsername, type PublicProjectSummary } from "./projectService";
import { getFollowState } from "./followService";

export type PublicProfile = {
    username: string;
    avatarUrl: string | null;
    followerCount: number;
    followingCount: number;
    isFollowing: boolean;
    isOwnProfile: boolean;
    books: PublicBookSummary[];
    projects: PublicProjectSummary[];
};

export async function getPublicProfile(db: D1Database, username: string, viewerId: number | null): Promise<PublicProfile | null> {
    const user = await getUserByUsername(db, username);
    if (!user) return null;

    const [books, projects, followState] = await Promise.all([
        listPublicBooksByUsername(db, username),
        listPublicProjectsByUsername(db, username),
        getFollowState(db, user.id, viewerId),
    ]);

    // user.id is deliberately not included below -- see userService.ts's
    // PublicUserProfile comment for why.
    return { username: user.username, avatarUrl: user.avatarUrl, ...followState, books, projects };
}
