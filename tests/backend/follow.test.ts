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
