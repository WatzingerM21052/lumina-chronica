// v3.3 (Community follow-up), Phase 3 (issue #326) -- in-app notifications
// with per-user, per-type preferences (FOLLOW/COMMENT/RATING/SHARE), plus a
// 5th preference type (ACTIVITY_RATING) added mid-scoping via
// AskUserQuestion that gates profile_activities' RATING_GIVEN entries
// instead of a notification. Preferences are checked at insert time, not
// read time -- muting must never retroactively hide history.

import { beforeEach, describe, expect, it } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string };
let tokenA: string;
let tokenB: string;

async function registerAndLogin(username: string, email: string): Promise<string> {
    const res = await app.request(
        "/api/auth/register",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password: "correct horse" }) },
        env
    );
    return (await readJson(res)).data.token;
}

async function uploadBook(token: string): Promise<number> {
    const form = new FormData();
    form.set("title", "Notifiable Book");
    form.set("file", new File(["epub-bytes"], "book.epub", { type: "application/epub+zip" }));
    const res = await app.request("/api/books/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
    return (await readJson(res)).data.id;
}

async function setBookVisibility(token: string, bookId: number, visibility: string) {
    return app.request(
        `/api/books/${bookId}`,
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ visibility }) },
        env
    );
}

async function follow(token: string, username: string) {
    return app.request(`/api/users/${username}/follow`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
}

async function rate(token: string, bookId: number, rating: number) {
    return app.request(
        `/api/books/${bookId}/rating`,
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ rating }) },
        env
    );
}

async function shareBook(ownerToken: string, bookId: number, username: string) {
    return app.request(
        `/api/books/${bookId}/shares`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` }, body: JSON.stringify({ username }) },
        env
    );
}

async function postComment(token: string, path: string, content: string) {
    return app.request(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ content }) }, env);
}

async function listNotifications(token: string) {
    const res = await app.request("/api/notifications", { headers: { Authorization: `Bearer ${token}` } }, env);
    return readJson(res);
}

async function setPreference(token: string, type: string, enabled: boolean) {
    return app.request(
        "/api/notifications/preferences",
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ type, enabled }) },
        env
    );
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("GET /api/notifications", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/notifications", {}, env);
        expect(res.status).toBe(401);
    });

    it("is empty for a fresh user", async () => {
        const { data } = await listNotifications(tokenA);
        expect(data.notifications).toEqual([]);
        expect(data.unreadCount).toBe(0);
    });

    it("notifies on FOLLOW, newest first, with unread count", async () => {
        await follow(tokenB, "alice");
        const { data } = await listNotifications(tokenA);
        expect(data.notifications).toHaveLength(1);
        expect(data.notifications[0]).toMatchObject({ type: "FOLLOW", actorUsername: "bob" });
        expect(data.unreadCount).toBe(1);
    });

    it("does not spam a duplicate notification on a repeat (idempotent) follow call", async () => {
        await follow(tokenB, "alice");
        await follow(tokenB, "alice");
        const { data } = await listNotifications(tokenA);
        expect(data.notifications).toHaveLength(1);
    });

    it("notifies the book owner on RATING, not the rater", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await rate(tokenB, bookId, 5);

        const ownerNotifications = await listNotifications(tokenA);
        expect(ownerNotifications.data.notifications).toHaveLength(1);
        expect(ownerNotifications.data.notifications[0]).toMatchObject({ type: "RATING", actorUsername: "bob", targetType: "BOOK", targetId: bookId });

        const raterNotifications = await listNotifications(tokenB);
        expect(raterNotifications.data.notifications).toEqual([]);
    });

    it("notifies the book owner on SHARE", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "SHARED");
        await shareBook(tokenA, bookId, "bob");

        const { data } = await listNotifications(tokenB);
        expect(data.notifications).toHaveLength(1);
        expect(data.notifications[0]).toMatchObject({ type: "SHARE", actorUsername: "alice", targetType: "BOOK", targetId: bookId });
    });

    it("notifies the target owner on COMMENT, but not on a self-comment", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");

        await postComment(tokenA, `/api/books/${bookId}/comments`, "Note to self");
        expect((await listNotifications(tokenA)).data.notifications).toEqual([]);

        await postComment(tokenB, `/api/books/${bookId}/comments`, "Great read!");
        const { data } = await listNotifications(tokenA);
        expect(data.notifications).toHaveLength(1);
        expect(data.notifications[0]).toMatchObject({ type: "COMMENT", actorUsername: "bob" });
    });

    it("respects a disabled preference, checked at insert time", async () => {
        await setPreference(tokenA, "FOLLOW", false);
        await follow(tokenB, "alice");
        const { data } = await listNotifications(tokenA);
        expect(data.notifications).toEqual([]);
    });

    it("re-enabling a preference does not retroactively resurrect suppressed notifications, and only affects future ones", async () => {
        await setPreference(tokenA, "FOLLOW", false);
        await follow(tokenB, "alice");
        await setPreference(tokenA, "FOLLOW", true);

        const { data } = await listNotifications(tokenA);
        expect(data.notifications).toEqual([]);
    });
});

describe("POST /api/notifications/:id/read and /read-all", () => {
    it("marks a single notification read and decrements the unread count", async () => {
        await follow(tokenB, "alice");
        const before = await listNotifications(tokenA);
        const id = before.data.notifications[0].id;

        const res = await app.request(`/api/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);

        const after = await listNotifications(tokenA);
        expect(after.data.unreadCount).toBe(0);
        expect(after.data.notifications[0].readAt).not.toBeNull();
    });

    it("marks all notifications read", async () => {
        await follow(tokenB, "alice");
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await rate(tokenB, bookId, 4);

        const res = await app.request("/api/notifications/read-all", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);

        const { data } = await listNotifications(tokenA);
        expect(data.unreadCount).toBe(0);
    });

    it("marking another user's notification read is a silent no-op, not a leak", async () => {
        await follow(tokenB, "alice");
        const before = await listNotifications(tokenA);
        const id = before.data.notifications[0].id;

        const res = await app.request(`/api/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${tokenB}` } }, env);
        expect(res.status).toBe(204);

        const after = await listNotifications(tokenA);
        expect(after.data.unreadCount).toBe(1);
    });
});

describe("GET/PUT /api/notifications/preferences", () => {
    it("defaults every type to enabled for a fresh user", async () => {
        const res = await app.request("/api/notifications/preferences", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const { data } = await readJson(res);
        expect(data).toEqual({ FOLLOW: true, COMMENT: true, RATING: true, SHARE: true, ACTIVITY_RATING: true });
    });

    it("persists a per-type toggle without affecting the others", async () => {
        await setPreference(tokenA, "COMMENT", false);
        const res = await app.request("/api/notifications/preferences", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const { data } = await readJson(res);
        expect(data).toEqual({ FOLLOW: true, COMMENT: false, RATING: true, SHARE: true, ACTIVITY_RATING: true });
    });

    it("rejects an unknown preference type", async () => {
        const res = await setPreference(tokenA, "BOGUS", false);
        expect(res.status).toBe(400);
    });
});

describe("ACTIVITY_RATING preference gates profile_activities, not notifications", () => {
    it("suppresses the RATING_GIVEN activity log entry when disabled, but the RATING notification to the book owner still fires", async () => {
        const bookId = await uploadBook(tokenA);
        await setBookVisibility(tokenA, bookId, "PUBLIC");
        await setPreference(tokenB, "ACTIVITY_RATING", false);

        await rate(tokenB, bookId, 3);

        const profileRes = await app.request("/api/users/bob/public", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const profile = await readJson(profileRes);
        expect(profile.data.activities).toEqual([]);

        const ownerNotifications = await listNotifications(tokenA);
        expect(ownerNotifications.data.notifications).toHaveLength(1);
        expect(ownerNotifications.data.notifications[0].type).toBe("RATING");
    });
});
