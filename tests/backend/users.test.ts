import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../backend/src/index";
import { createFakeD1 } from "./fakeD1";
import { createFakeR2 } from "./fakeR2";
import { readJson } from "./testUtils";
import { OAUTH_NO_PASSWORD_SENTINEL } from "../../backend/src/utils/crypto";

let env: { DB: D1Database; STORAGE: R2Bucket; JWT_SECRET: string; RESEND_API_KEY: string; FRONTEND_URL: string };
let token: string;

function jsonRequest(method: string, body: unknown, authToken?: string) {
    return {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
    };
}

beforeEach(async () => {
    env = {
        DB: createFakeD1(),
        STORAGE: createFakeR2(),
        JWT_SECRET: "test-secret-do-not-use-in-production",
        RESEND_API_KEY: "test-resend-key",
        FRONTEND_URL: "https://example.test/some-app",
    };
    // The email-change notice (review M-6) goes out through Resend -- never
    // over the real network in tests.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "email-id" }), { status: 200 })));
    const registerRes = await app.request(
        "/api/auth/register",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "alice", email: "alice@example.com", password: "correct horse" }),
        },
        env
    );
    token = (await readJson(registerRes)).data.token;
});

describe("GET /api/users/me", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/me", {}, env);
        expect(res.status).toBe(401);
    });

    it("returns the current user's profile without the password hash", async () => {
        const res = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        const json = await readJson(res);

        expect(res.status).toBe(200);
        expect(json.data.username).toBe("alice");
        expect(json.data.email).toBe("alice@example.com");
        expect(json.data.roleName).toBe("USER");
        expect(json.data.password_hash).toBeUndefined();
        expect(json.data.passwordHash).toBeUndefined();
    });
});

describe("PUT /api/users/me", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice2" }), env);
        expect(res.status).toBe(401);
    });

    it("updates the username and persists it", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice2" }, token), env);
        expect(res.status).toBe(200);

        const getRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(getRes)).data.username).toBe("alice2");
    });

    it("rejects a username already taken by another user", async () => {
        await app.request(
            "/api/auth/register",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "bob", email: "bob@example.com", password: "correct horse" }),
            },
            env
        );

        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "bob" }, token), env);
        expect(res.status).toBe(409);
        expect((await readJson(res)).error.code).toBe("USERNAME_TAKEN");
    });

    it("rejects a password change with the wrong current password", async () => {
        const res = await app.request(
            "/api/users/me",
            jsonRequest("PUT", { currentPassword: "wrong password", newPassword: "new password 123" }, token),
            env
        );
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_PASSWORD");
    });

    it("changes the password and allows login with the new one", async () => {
        const updateRes = await app.request(
            "/api/users/me",
            jsonRequest("PUT", { currentPassword: "correct horse", newPassword: "new password 123" }, token),
            env
        );
        expect(updateRes.status).toBe(200);

        const loginRes = await app.request(
            "/api/auth/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: "alice@example.com", password: "new password 123" }),
            },
            env
        );
        expect(loginRes.status).toBe(200);
    });
});

describe("PUT /api/users/me -- email change (review M-6)", () => {
    async function currentEmail() {
        const res = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        return (await readJson(res)).data.email as string;
    }

    function sentEmails() {
        return (globalThis.fetch as any).mock.calls.map(([, init]: [string, RequestInit]) => JSON.parse(init.body as string));
    }

    it("rejects an email change without the current password and changes nothing", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { email: "mallory@example.com" }, token), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_PASSWORD");
        expect(await currentEmail()).toBe("alice@example.com");
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("rejects an email change with the wrong current password", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { email: "mallory@example.com", currentPassword: "wrong password" }, token), env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_PASSWORD");
        expect(await currentEmail()).toBe("alice@example.com");
    });

    it("does not let a username edit through without the password when the email changes alongside it", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice2", email: "mallory@example.com" }, token), env);
        expect(res.status).toBe(400);

        const me = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect((await readJson(me)).data.username).toBe("alice");
    });

    it("changes the email with the correct password and notifies ONLY the old address, with the new one masked", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { email: "alice.new@example.org", currentPassword: "correct horse" }, token), env);
        expect(res.status).toBe(200);
        expect(await currentEmail()).toBe("alice.new@example.org");

        const mails = sentEmails();
        expect(mails).toHaveLength(1);
        expect(mails[0].to).toBe("alice@example.com");
        expect(mails[0].subject).toContain("E-Mail-Adresse geändert");
        expect(mails[0].text).toContain("a•••@example.org");
        expect(mails[0].text).not.toContain("alice.new@example.org");
        expect(mails[0].html).not.toContain("alice.new@example.org");
    });

    it("needs no password when the submitted email is unchanged (Profile.razor always sends it with a username edit)", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice2", email: "alice@example.com" }, token), env);
        expect(res.status).toBe(200);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("checks the password before revealing whether the new email is taken", async () => {
        await app.request(
            "/api/auth/register",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "bob", email: "bob@example.com", password: "correct horse" }) },
            env
        );

        const withoutPassword = await app.request("/api/users/me", jsonRequest("PUT", { email: "bob@example.com" }, token), env);
        expect((await readJson(withoutPassword)).error.code).toBe("INVALID_PASSWORD");

        const withPassword = await app.request("/api/users/me", jsonRequest("PUT", { email: "bob@example.com", currentPassword: "correct horse" }, token), env);
        expect(withPassword.status).toBe(409);
        expect((await readJson(withPassword)).error.code).toBe("EMAIL_TAKEN");
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("lets an OAuth-only account change its email without a password, and still notifies the old address", async () => {
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE email = ?").bind(OAUTH_NO_PASSWORD_SENTINEL, "alice@example.com").run();

        const res = await app.request("/api/users/me", jsonRequest("PUT", { email: "alice.new@example.org" }, token), env);
        expect(res.status).toBe(200);
        expect(sentEmails()[0].to).toBe("alice@example.com");
    });

    it("keeps the change even when the notice fails to send", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("server error", { status: 500 })));

        const res = await app.request("/api/users/me", jsonRequest("PUT", { email: "alice.new@example.org", currentPassword: "correct horse" }, token), env);
        expect(res.status).toBe(200);
        expect(await currentEmail()).toBe("alice.new@example.org");
    });
});

describe("PUT /api/users/me/avatar", () => {
    it("requires authentication", async () => {
        const form = new FormData();
        form.set("avatar", new File(["avatar bytes"], "avatar.jpg", { type: "image/jpeg" }));
        const res = await app.request("/api/users/me/avatar", { method: "PUT", body: form }, env);
        expect(res.status).toBe(401);
    });

    it("uploads an avatar and returns an absolute, publicly-servable URL", async () => {
        const form = new FormData();
        form.set("avatar", new File(["avatar bytes"], "avatar.jpg", { type: "image/jpeg" }));
        const res = await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
        expect(res.status).toBe(200);

        const json = await readJson(res);
        expect(new URL(json.data.avatarUrl).pathname).toBe("/api/users/alice/avatar");

        // The very URL just returned actually serves the uploaded bytes, with
        // zero auth -- an avatar has no privacy concept, unlike a book cover.
        const getRes = await app.request("/api/users/alice/avatar", {}, env);
        expect(getRes.status).toBe(200);
        expect(getRes.headers.get("Content-Type")).toBe("image/jpeg");
        expect(await getRes.text()).toBe("avatar bytes");
    });

    it("replaces an existing avatar, cleaning up the old R2 object", async () => {
        const firstForm = new FormData();
        firstForm.set("avatar", new File(["first avatar"], "avatar.jpg", { type: "image/jpeg" }));
        await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: firstForm }, env);

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        const userId = (await readJson(meRes)).data.id;

        // Replace with a different extension -- the old .jpg object must be cleaned up.
        const secondForm = new FormData();
        secondForm.set("avatar", new File(["second avatar"], "avatar.png", { type: "image/png" }));
        const secondRes = await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: secondForm }, env);
        expect(secondRes.status).toBe(200);

        const getRes = await app.request("/api/users/alice/avatar", {}, env);
        expect(getRes.headers.get("Content-Type")).toBe("image/png");
        expect(await getRes.text()).toBe("second avatar");

        const oldObject = await env.STORAGE.get(`avatars/${userId}/avatar.jpg`);
        expect(oldObject).toBeNull();
    });

    it("rejects a disallowed file type", async () => {
        const form = new FormData();
        form.set("avatar", new File(["not an image"], "avatar.gif", { type: "image/gif" }));
        const res = await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form }, env);
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("VALIDATION_ERROR");
    });
});

describe("GET /api/users/:username/avatar", () => {
    it("returns 404 for a user with no avatar set", async () => {
        const res = await app.request("/api/users/alice/avatar", {}, env);
        expect(res.status).toBe(404);
    });

    it("returns 404 for a nonexistent username", async () => {
        const res = await app.request("/api/users/nobody/avatar", {}, env);
        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/users/me", () => {
    it("requires authentication", async () => {
        const res = await app.request("/api/users/me", { method: "DELETE" }, env);
        expect(res.status).toBe(401);
    });

    it("rejects a missing/wrong current password for a password-based account", async () => {
        const res = await app.request(
            "/api/users/me",
            jsonRequest("DELETE", { currentPassword: "wrong password" }, token),
            env
        );
        expect(res.status).toBe(400);
        expect((await readJson(res)).error.code).toBe("INVALID_PASSWORD");

        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect(meRes.status).toBe(200);
    });

    it("soft-deletes the account, frees the username/email, and blocks further login", async () => {
        const res = await app.request(
            "/api/users/me",
            jsonRequest("DELETE", { currentPassword: "correct horse" }, token),
            env
        );
        expect(res.status).toBe(200);
        expect((await readJson(res)).success).toBe(true);

        // Review N-7: the deleted account's token is rejected outright
        // (it used to get through requireAuth and 404 on the profile).
        const meRes = await app.request("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, env);
        expect(meRes.status).toBe(401);

        const loginRes = await app.request(
            "/api/auth/login",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier: "alice@example.com", password: "correct horse" }),
            },
            env
        );
        expect(loginRes.status).toBe(401);

        // Username/email are freed for a brand new registration.
        const reRegisterRes = await app.request(
            "/api/auth/register",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: "alice", email: "someone-else@example.com", password: "another password" }),
            },
            env
        );
        expect(reRegisterRes.status).toBe(201);
    });

    it("deletes the R2 avatar object on account deletion", async () => {
        const form = new FormData();
        form.set("avatar", new File(["avatar bytes"], "avatar.jpg", { type: "image/jpeg" }));
        await app.request("/api/users/me/avatar", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form }, env);

        await app.request("/api/users/me", jsonRequest("DELETE", { currentPassword: "correct horse" }, token), env);

        const getRes = await app.request("/api/users/alice/avatar", {}, env);
        expect(getRes.status).toBe(404);
    });
});

describe("PUT /api/users/me -- identity rules (review N-3/N-5/N-6)", () => {
    it("does not treat a legacy mixed-case email re-sent unchanged as an email change", async () => {
        await env.DB.prepare("UPDATE users SET email = 'Alice@Example.com' WHERE username = 'alice'").run();

        const res = await app.request("/api/users/me", jsonRequest("PUT", { username: "alice", email: "Alice@Example.com" }, token), env);
        expect(res.status).toBe(200);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("lets a legacy username outside the pattern save other fields, but not pick a new invalid one", async () => {
        await env.DB.prepare("UPDATE users SET username = 'a' WHERE username = 'alice'").run();

        const keep = await app.request("/api/users/me", jsonRequest("PUT", { username: "a", email: "alice@example.com" }, token), env);
        expect(keep.status).toBe(200);

        const invalid = await app.request("/api/users/me", jsonRequest("PUT", { username: "bob@example.com", email: "alice@example.com" }, token), env);
        expect(invalid.status).toBe(400);
        expect((await readJson(invalid)).error.code).toBe("VALIDATION_ERROR");
    });

    it("stores a changed email lowercase and rejects a case-variant of someone else's email", async () => {
        await app.request("/api/auth/register", jsonRequest("POST", { username: "bob", email: "bob@example.com", password: "correct horse" }), env);

        const taken = await app.request("/api/users/me", jsonRequest("PUT", { email: "BOB@example.com", currentPassword: "correct horse" }, token), env);
        expect(taken.status).toBe(409);

        const ok = await app.request("/api/users/me", jsonRequest("PUT", { email: "Alice.New@Example.com", currentPassword: "correct horse" }, token), env);
        expect(ok.status).toBe(200);
        expect((await readJson(ok)).data.email).toBe("alice.new@example.com");
    });

    it("rejects non-string fields with 400 instead of a 500", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { email: { a: 1 } }, token), env);
        expect(res.status).toBe(400);
    });

    it("accepts a 6-character new password", async () => {
        const res = await app.request("/api/users/me", jsonRequest("PUT", { newPassword: "htlgkr", currentPassword: "correct horse" }, token), env);
        expect(res.status).toBe(200);
    });
});

describe("PUT /api/users/me/language", () => {
    async function storedLanguage(): Promise<string | undefined> {
        const row = await env.DB.prepare(
            "SELECT s.language FROM user_settings s JOIN users u ON u.id = s.user_id WHERE u.username = 'alice'"
        ).first<{ language: string }>();
        return row?.language;
    }

    it("requires authentication", async () => {
        const res = await app.request("/api/users/me/language", jsonRequest("PUT", { language: "en" }), env);
        expect(res.status).toBe(401);
    });

    it("stores the language so emails follow it", async () => {
        expect(await storedLanguage()).toBe("de");

        const res = await app.request("/api/users/me/language", jsonRequest("PUT", { language: "en" }, token), env);

        expect(res.status).toBe(200);
        expect((await readJson(res)).data.language).toBe("en");
        expect(await storedLanguage()).toBe("en");
    });

    it("creates the settings row for an account that has none", async () => {
        await env.DB.prepare("DELETE FROM user_settings").run();

        const res = await app.request("/api/users/me/language", jsonRequest("PUT", { language: "en" }, token), env);

        expect(res.status).toBe(200);
        expect(await storedLanguage()).toBe("en");
    });

    it.each([["fr"], [""], [42], [null]])("rejects %j", async (language) => {
        const res = await app.request("/api/users/me/language", jsonRequest("PUT", { language }, token), env);

        expect(res.status).toBe(400);
        expect(await storedLanguage()).toBe("de");
    });
});
