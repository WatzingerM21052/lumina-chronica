import { roleName } from "./authService";
import { OAUTH_NO_PASSWORD_SENTINEL, randomToken, sha256Hex, signJwt } from "../utils/crypto";
import { OAuthExchangeError, type OAuthProfile, type OAuthProviderName, providerFor } from "./oauthProviders";

// 7 days -- mirrors authService.ts's TOKEN_EXPIRY_SECONDS exactly, so an
// OAuth-issued token is indistinguishable from a password-login one to the
// rest of the app (middleware, frontend decode logic).
export const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7;
const STATE_TTL_SECONDS = 60 * 10; // enough time to complete the provider's consent screen
const EXCHANGE_CODE_TTL_SECONDS = 60 * 2; // just the redirect -> immediate POST round trip

export class InvalidProviderError extends Error {}
export class InvalidStateError extends Error {}
export class OAuthAlreadyLinkedError extends Error {}

// A distinguishable error for "the provider token exchange failed, but this
// was a link attempt (an already-authenticated user linking an additional
// provider), not an ordinary login." Without this, routes/auth.ts's callback
// handler had no way to tell the two apart once
// the exchange itself throws OAuthExchangeError, since by then the state
// row (which carried linking_user_id) has already been consumed, and always
// sent the caller to the login-oriented redirect even when they were mid-
// link on the Profile page. InvalidStateError deliberately does NOT get the
// same treatment: the state row was never found at all in that case, so
// there's no way to know it was a link attempt -- that one still goes to
// loginRedirect.
export class LinkExchangeFailedError extends Error {}

export type StartResult = { redirectUrl: string };

export async function startOAuth(
    db: D1Database,
    provider: string,
    clientId: string,
    redirectUri: string,
    linkingUserId: number | null = null
): Promise<StartResult> {
    const adapter = providerFor(provider);
    if (!adapter) throw new InvalidProviderError(provider);

    const state = randomToken();
    const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString();
    await db
        .prepare("INSERT INTO oauth_states (state, provider, expires_at, linking_user_id) VALUES (?, ?, ?, ?)")
        .bind(state, provider, expiresAt, linkingUserId)
        .run();

    return { redirectUrl: adapter.authorizeUrl(clientId, redirectUri, state) };
}

// Verifies state + exchanges the code with the provider + finds-or-creates
// the local user, but deliberately does NOT issue a JWT here -- see the
// module comment on storeExchangeCode/redeemExchangeCode for why the token
// is only ever signed at actual exchange time, not baked into the
// short-lived handoff row.
export async function completeOAuthCallback(
    db: D1Database,
    provider: string,
    code: string,
    state: string,
    credentials: { clientId: string; clientSecret: string },
    redirectUri: string
): Promise<{ userId: number; linked: boolean }> {
    const adapter = providerFor(provider);
    if (!adapter) throw new InvalidProviderError(provider);

    // Single-use: delete on read, not just check-then-ignore, so a replayed
    // callback URL (e.g. from browser history) can't be replayed too.
    const stateRow = await db
        .prepare("DELETE FROM oauth_states WHERE state = ? AND provider = ? AND expires_at > CURRENT_TIMESTAMP RETURNING state, linking_user_id")
        .bind(state, provider)
        .first<{ state: string; linking_user_id: number | null }>();
    if (!stateRow) throw new InvalidStateError();

    let profile: OAuthProfile;
    try {
        profile = await adapter.exchangeCode(code, redirectUri, credentials);
    } catch (err) {
        if (stateRow.linking_user_id !== null && err instanceof OAuthExchangeError) throw new LinkExchangeFailedError();
        throw err;
    }

    if (stateRow.linking_user_id !== null) {
        await linkOAuthIdentity(db, stateRow.linking_user_id, provider as OAuthProviderName, profile);
        return { userId: stateRow.linking_user_id, linked: true };
    }

    const userId = await findOrCreateUserForOAuth(db, provider as OAuthProviderName, profile);
    return { userId, linked: false };
}

// Links an already-authenticated user's account onto a provider identity.
// Idempotent when re-linking an identity the caller already has (a repeat
// link attempt after e.g. a double-click shouldn't error); rejects when the
// identity belongs to someone else.
async function linkOAuthIdentity(db: D1Database, userId: number, provider: OAuthProviderName, profile: OAuthProfile): Promise<void> {
    const existing = await db
        .prepare("SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?")
        .bind(provider, profile.providerUserId)
        .first<{ user_id: number }>();

    if (existing) {
        if (existing.user_id !== userId) throw new OAuthAlreadyLinkedError();
        return;
    }

    await db
        .prepare("INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)")
        .bind(userId, provider, profile.providerUserId, profile.email)
        .run();
}

async function findOrCreateUserForOAuth(db: D1Database, provider: OAuthProviderName, profile: OAuthProfile): Promise<number> {
    const existingIdentity = await db
        .prepare("SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?")
        .bind(provider, profile.providerUserId)
        .first<{ user_id: number }>();
    if (existingIdentity) {
        await db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(existingIdentity.user_id).run();
        return existingIdentity.user_id;
    }

    // No identity linked yet -- auto-link onto an existing password account
    // with the same (provider-verified) email if one exists. The user chose
    // this behavior explicitly: convenient, with the accepted tradeoff that
    // whoever controls that Google/GitHub account also reaches this one.
    const existingUser = await db
        .prepare("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL")
        .bind(profile.email)
        .first<{ id: number }>();

    let userId: number;
    if (existingUser) {
        userId = existingUser.id;
    } else {
        // No LIVE account has this email either -- but a previously
        // soft-deleted one might (userService.ts's deleteUser moves the live
        // email into deleted_email and anonymizes the live column). Unlike
        // the password-based restore flow (authService.ts's registerUser /
        // POST /api/auth/restore), which requires an explicit confirm step
        // because registering blind with someone else's email is a real
        // risk, this restore is automatic and silent: the email just came
        // from the OAuth provider, which already verified it, and this
        // function already auto-links onto a *live* account under that same
        // trust model two lines up -- restoring a *deleted* account by the
        // same verified email carries no additional risk. OAuth's
        // redirect-based flow also makes an interactive confirm step here
        // significantly more expensive to build (a new short-lived
        // pending-profile cache) for little benefit.
        //
        // ORDER BY deleted_at DESC, id DESC: same tie-break as
        // authService.ts's registerUser/restoreUser for the identical
        // ambiguous-collision scenario (multiple soft-deleted rows sharing
        // the same deleted_email) -- most-recently-deleted wins.
        const deletedMatch = await db
            .prepare("SELECT id, deleted_username FROM users WHERE deleted_email = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC")
            .bind(profile.email)
            .first<{ id: number; deleted_username: string }>();

        if (deletedMatch) {
            // The original username might since have been taken by a
            // different active account -- fall back to a fresh generated one
            // in that case, same as a brand-new account would get.
            let restoredUsername = deletedMatch.deleted_username;
            const usernameTaken = await db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").bind(restoredUsername, deletedMatch.id).first();
            if (usernameTaken) {
                restoredUsername = await generateUniqueUsername(db, profile);
            }

            // password_hash and avatar_key are deliberately left untouched:
            // deleteUser never touches password_hash, and it already cleared
            // avatar_key (and deleted the R2 object) on deletion, so there's
            // nothing to restore there. user_settings was likewise never
            // deleted, so no fresh INSERT is needed for it here (only the
            // create-new-user branch below needs one).
            await db
                .prepare(
                    `UPDATE users SET username = ?, email = ?,
                     deleted_username = NULL, deleted_email = NULL, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`
                )
                .bind(restoredUsername, profile.email, deletedMatch.id)
                .run();
            userId = deletedMatch.id;
        } else {
            const userRole = await db.prepare("SELECT id FROM roles WHERE name = 'USER'").first<{ id: number }>();
            if (!userRole) throw new Error("USER role is not seeded (see database/migrations/0001_initial.sql).");

            const username = await generateUniqueUsername(db, profile);
            const insertUser = await db
                .prepare("INSERT INTO users (username, email, password_hash, avatar_url, role_id) VALUES (?, ?, ?, ?, ?)")
                .bind(username, profile.email, OAUTH_NO_PASSWORD_SENTINEL, profile.avatarUrl ?? null, userRole.id)
                .run();
            userId = insertUser.meta.last_row_id;

            try {
                // Same compensating-delete pattern as authService.ts's
                // registerUser -- D1's batch() can't express this as one atomic
                // call since the second insert needs the first insert's id.
                await db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").bind(userId).run();
            } catch (err) {
                await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
                throw err;
            }
        }
    }

    await db
        .prepare("INSERT INTO oauth_identities (user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?)")
        .bind(userId, provider, profile.providerUserId, profile.email)
        .run();
    await db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();

    return userId;
}

const USERNAME_FALLBACK = "user";

async function generateUniqueUsername(db: D1Database, profile: OAuthProfile): Promise<string> {
    const base =
        (profile.name ?? profile.email.split("@")[0])
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "")
            .slice(0, 20) || USERNAME_FALLBACK;

    let candidate = base;
    for (let attempt = 0; attempt < 20; attempt++) {
        const taken = await db.prepare("SELECT id FROM users WHERE username = ?").bind(candidate).first();
        if (!taken) return candidate;
        candidate = `${base}${randomToken(3)}`.slice(0, 32);
    }
    // Astronomically unlikely to be reached (20 collisions in a row), but
    // fall through to something that will not collide rather than looping
    // forever.
    return `${USERNAME_FALLBACK}${randomToken(6)}`;
}

// The exchange code table stores only who it's for (user_id), not a signed
// token -- the JWT itself is minted fresh in redeemExchangeCode, at the
// moment it's actually handed to the browser. This keeps the handoff row's
// blast radius small (a leaked row is just "log this user in", not a
// pre-signed bearer token with its own independent 7-day lifetime) and means
// the code's own short TTL, not the JWT's, is what an attacker racing the
// redirect has to beat.
export async function storeExchangeCode(db: D1Database, userId: number): Promise<string> {
    const rawCode = randomToken();
    const codeHash = await sha256Hex(rawCode);
    const expiresAt = new Date(Date.now() + EXCHANGE_CODE_TTL_SECONDS * 1000).toISOString();
    await db
        .prepare("INSERT INTO oauth_exchange_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(codeHash, userId, expiresAt)
        .run();
    return rawCode;
}

export async function redeemExchangeCode(db: D1Database, jwtSecret: string, rawCode: string): Promise<{ token: string; userId: number } | null> {
    const codeHash = await sha256Hex(rawCode);
    const row = await db
        .prepare(
            "UPDATE oauth_exchange_codes SET consumed_at = CURRENT_TIMESTAMP " +
                "WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP " +
                "RETURNING user_id"
        )
        .bind(codeHash)
        .first<{ user_id: number }>();
    if (!row) return null;

    const user = await db.prepare("SELECT role_id FROM users WHERE id = ?").bind(row.user_id).first<{ role_id: number }>();
    const role = user ? await roleName(db, user.role_id) : "USER";
    const token = await signJwt({ sub: row.user_id, role }, jwtSecret, TOKEN_EXPIRY_SECONDS);
    return { token, userId: row.user_id };
}

export class OAuthUnlinkBlockedError extends Error {}

export type LinkedProvider = { provider: string; email: string | null; linkedAt: string };

export async function getLinkedProviders(db: D1Database, userId: number): Promise<LinkedProvider[]> {
    const rows = await db
        .prepare("SELECT provider, email, created_at FROM oauth_identities WHERE user_id = ? ORDER BY created_at ASC")
        .bind(userId)
        .all<{ provider: string; email: string | null; created_at: string }>();
    return rows.results.map((row) => ({ provider: row.provider, email: row.email, linkedAt: row.created_at }));
}

// Refuses to remove the last way a purely-OAuth account (no real password)
// could ever sign in again. Deleting a provider the caller never actually
// had linked is treated as a no-op success, same idempotent-by-design
// philosophy as routes/users.ts's follow/unfollow.
export async function unlinkProvider(db: D1Database, userId: number, provider: string): Promise<void> {
    const user = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first<{ password_hash: string }>();
    if (!user) throw new Error("User disappeared during unlink.");

    const targetExists = await db.prepare("SELECT 1 FROM oauth_identities WHERE user_id = ? AND provider = ?").bind(userId, provider).first();
    if (!targetExists) return; // nothing to unlink -- idempotent no-op, matches follow/unfollow's philosophy

    const identityCount = await db.prepare("SELECT COUNT(*) AS count FROM oauth_identities WHERE user_id = ?").bind(userId).first<{ count: number }>();
    const hasRealPassword = user.password_hash !== OAUTH_NO_PASSWORD_SENTINEL;

    if (!hasRealPassword && (identityCount?.count ?? 0) <= 1) {
        throw new OAuthUnlinkBlockedError();
    }

    await db.prepare("DELETE FROM oauth_identities WHERE user_id = ? AND provider = ?").bind(userId, provider).run();
}
