import { roleName } from "./authService";
import { OAUTH_NO_PASSWORD_SENTINEL, randomToken, sha256Hex, signJwt } from "../utils/crypto";
import { type OAuthProfile, type OAuthProviderName, providerFor } from "./oauthProviders";

// 7 days -- mirrors authService.ts's TOKEN_EXPIRY_SECONDS exactly, so an
// OAuth-issued token is indistinguishable from a password-login one to the
// rest of the app (middleware, frontend decode logic).
export const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7;
const STATE_TTL_SECONDS = 60 * 10; // enough time to complete the provider's consent screen
const EXCHANGE_CODE_TTL_SECONDS = 60 * 2; // just the redirect -> immediate POST round trip

export class InvalidProviderError extends Error {}
export class InvalidStateError extends Error {}

export type StartResult = { redirectUrl: string };

export async function startOAuth(db: D1Database, provider: string, clientId: string, redirectUri: string): Promise<StartResult> {
    const adapter = providerFor(provider);
    if (!adapter) throw new InvalidProviderError(provider);

    const state = randomToken();
    const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString();
    await db.prepare("INSERT INTO oauth_states (state, provider, expires_at) VALUES (?, ?, ?)").bind(state, provider, expiresAt).run();

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
): Promise<{ userId: number }> {
    const adapter = providerFor(provider);
    if (!adapter) throw new InvalidProviderError(provider);

    // Single-use: delete on read, not just check-then-ignore, so a replayed
    // callback URL (e.g. from browser history) can't be replayed too.
    const stateRow = await db
        .prepare("DELETE FROM oauth_states WHERE state = ? AND provider = ? AND expires_at > CURRENT_TIMESTAMP RETURNING state")
        .bind(state, provider)
        .first();
    if (!stateRow) throw new InvalidStateError();

    const profile = await adapter.exchangeCode(code, redirectUri, credentials);
    const userId = await findOrCreateUserForOAuth(db, provider as OAuthProviderName, profile);
    return { userId };
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
