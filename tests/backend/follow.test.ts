// Community Phase 2 (issue #304) -- follow/unfollow + the public profile's
// follow-state fields (followerCount/followingCount/isFollowing/isOwnProfile).

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
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password: "correct horse" }),
        },
        env
    );
    return (await readJson(res)).data.token;
}

async function getPublicProfile(username: string, token?: string) {
    const res = await app.request(`/api/users/${username}/public`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}, env);
    return { status: res.status, json: await readJson(res) };
}

beforeEach(async () => {
    env = { DB: createFakeD1(), STORAGE: createFakeR2(), JWT_SECRET: "test-secret-do-not-use-in-production" };
    tokenA = await registerAndLogin("alice", "alice@example.com");
    tokenB = await registerAndLogin("bob", "bob@example.com");
});

describe("POST/DELETE /api/users/:username/follow", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/bob/follow", { method: "POST" }, env);
        expect(res.status).toBe(401);
    });

    it("returns 404 for an unknown username", async () => {
        const res = await app.request("/api/users/nobody/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(404);
    });

    it("rejects following yourself", async () => {
        const res = await app.request("/api/users/alice/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });

    it("follows, updates counts on both sides, and is idempotent", async () => {
        const res1 = await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res1.status).toBe(204);

        // idempotent -- following again doesn't error or double-count
        const res2 = await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res2.status).toBe(204);

        const bobProfile = await getPublicProfile("bob");
        expect(bobProfile.json.data.followerCount).toBe(1);
        expect(bobProfile.json.data.followingCount).toBe(0);

        const aliceProfile = await getPublicProfile("alice");
        expect(aliceProfile.json.data.followerCount).toBe(0);
        expect(aliceProfile.json.data.followingCount).toBe(1);
    });

    it("reflects isFollowing only for the actual follower, not other viewers", async () => {
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const asFollower = await getPublicProfile("bob", tokenA);
        expect(asFollower.json.data.isFollowing).toBe(true);

        const asStranger = await getPublicProfile("bob", tokenB);
        expect(asStranger.json.data.isFollowing).toBe(false);

        const anonymous = await getPublicProfile("bob");
        expect(anonymous.json.data.isFollowing).toBe(false);
    });

    it("sets isOwnProfile only when the viewer is the profile's own user", async () => {
        const own = await getPublicProfile("alice", tokenA);
        expect(own.json.data.isOwnProfile).toBe(true);

        const other = await getPublicProfile("alice", tokenB);
        expect(other.json.data.isOwnProfile).toBe(false);

        const anonymous = await getPublicProfile("alice");
        expect(anonymous.json.data.isOwnProfile).toBe(false);
    });

    it("unfollows, and unfollowing a non-follow is a harmless no-op", async () => {
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request("/api/users/bob/follow", { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(204);

        const bobProfile = await getPublicProfile("bob");
        expect(bobProfile.json.data.followerCount).toBe(0);

        // unfollowing again (no existing follow) still succeeds
        const res2 = await app.request("/api/users/bob/follow", { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res2.status).toBe(204);
    });

    it("returns 404 unfollowing an unknown username", async () => {
        const res = await app.request("/api/users/nobody/follow", { method: "DELETE", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        expect(res.status).toBe(404);
    });
});

describe("GET /api/users/:username/followers and /following", () => {
    it("returns 404 for an unknown username, on both endpoints", async () => {
        const followersRes = await app.request("/api/users/nobody/followers", {}, env);
        expect(followersRes.status).toBe(404);

        const followingRes = await app.request("/api/users/nobody/following", {}, env);
        expect(followingRes.status).toBe(404);
    });

    it("requires no authentication -- same as the public profile's own counts", async () => {
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request("/api/users/bob/followers", {}, env);
        expect(res.status).toBe(200);
        const json = await readJson(res);
        expect(json.data.items).toEqual([{ username: "alice", avatarUrl: null, isFollowing: null }]);
        expect(json.data.total).toBe(1);
    });

    it("reports isFollowing from the authenticated viewer's own perspective, per row", async () => {
        const tokenC = await registerAndLogin("carol", "carol@example.com");
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenC}` } }, env);
        // alice (the viewer below) already follows carol, but not herself.
        await app.request("/api/users/carol/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request("/api/users/bob/followers", { headers: { Authorization: `Bearer ${tokenA}` } }, env);
        const json = await readJson(res);
        const byUsername = Object.fromEntries(json.data.items.map((u: { username: string; isFollowing: boolean }) => [u.username, u.isFollowing]));
        expect(byUsername).toEqual({ carol: true, alice: false });
    });

    it("lists who follows the target user, most recent first", async () => {
        const tokenC = await registerAndLogin("carol", "carol@example.com");
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenC}` } }, env);

        const res = await app.request("/api/users/bob/followers", {}, env);
        const json = await readJson(res);
        expect(json.data.items.map((u: { username: string }) => u.username)).toEqual(["carol", "alice"]);
        expect(json.data.total).toBe(2);
    });

    it("lists who the target user follows, most recent first", async () => {
        const tokenC = await registerAndLogin("carol", "carol@example.com");
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);
        await app.request("/api/users/carol/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const res = await app.request("/api/users/alice/following", {}, env);
        const json = await readJson(res);
        expect(json.data.items.map((u: { username: string }) => u.username)).toEqual(["carol", "bob"]);
        expect(json.data.total).toBe(2);
        void tokenC;
    });

    it("paginates via page/pageSize, matching the discover-users convention", async () => {
        for (const name of ["carol", "dave", "erin"]) {
            const t = await registerAndLogin(name, `${name}@example.com`);
            await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${t}` } }, env);
        }
        await app.request("/api/users/bob/follow", { method: "POST", headers: { Authorization: `Bearer ${tokenA}` } }, env);

        const firstPage = await app.request("/api/users/bob/followers?page=1&pageSize=2", {}, env);
        const firstJson = await readJson(firstPage);
        expect(firstJson.data.items).toHaveLength(2);
        expect(firstJson.data.total).toBe(4);
        expect(firstJson.data.page).toBe(1);
        expect(firstJson.data.pageSize).toBe(2);

        const secondPage = await app.request("/api/users/bob/followers?page=2&pageSize=2", {}, env);
        const secondJson = await readJson(secondPage);
        expect(secondJson.data.items).toHaveLength(2);

        const allUsernames = [...firstJson.data.items, ...secondJson.data.items].map((u: { username: string }) => u.username);
        expect(new Set(allUsernames)).toEqual(new Set(["alice", "carol", "dave", "erin"]));
    });

    it("returns an empty list for a user nobody follows / who follows nobody", async () => {
        const res = await app.request("/api/users/bob/followers", {}, env);
        const json = await readJson(res);
        expect(json.data.items).toEqual([]);
        expect(json.data.total).toBe(0);
    });
});
