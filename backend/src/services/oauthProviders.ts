// Provider-specific pieces of the OAuth flow (issue #40): building the
// authorize URL and exchanging an authorization code for a normalized
// profile. Both providers are used as confidential/server-side clients --
// the code exchange happens entirely in this Worker, which holds the client
// secret as a Cloudflare secret and never sends it to the browser. That's
// also why this deliberately skips PKCE: PKCE exists to protect public
// clients that can't hold a secret (native apps, browser-only SPAs doing
// the exchange themselves); since the exchange step here already requires
// the client secret, an intercepted authorization code is useless to an
// attacker without it. The `state` parameter (CSRF protection, unrelated to
// PKCE) is still required and handled by oauthService.ts.

export type OAuthProviderName = "google" | "github";

export type OAuthProfile = {
    providerUserId: string;
    email: string;
    name?: string;
    avatarUrl?: string;
};

export class OAuthExchangeError extends Error {}

type ProviderCredentials = { clientId: string; clientSecret: string };

export interface OAuthProviderAdapter {
    authorizeUrl(clientId: string, redirectUri: string, state: string): string;
    exchangeCode(code: string, redirectUri: string, credentials: ProviderCredentials): Promise<OAuthProfile>;
}

const GOOGLE_SCOPE = "openid email profile";

export const googleProvider: OAuthProviderAdapter = {
    authorizeUrl(clientId, redirectUri, state) {
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: GOOGLE_SCOPE,
            state,
            access_type: "online",
            prompt: "select_account",
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },

    async exchangeCode(code, redirectUri, { clientId, clientSecret }) {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }),
        });
        if (!tokenResponse.ok) throw new OAuthExchangeError(`Google token exchange failed (${tokenResponse.status}).`);

        const tokenBody = await tokenResponse.json<{ id_token?: string }>();
        if (!tokenBody.id_token) throw new OAuthExchangeError("Google token response had no id_token.");

        // The id_token arrived over a direct HTTPS call to Google's own token
        // endpoint, authenticated with our client secret -- its authenticity
        // already rests on that transport trust (same as every other field in
        // this response), so decoding the payload without re-verifying its
        // signature against Google's JWKS is safe here. Signature
        // verification matters for the implicit/public-client flow, where a
        // token could originate from anywhere; that's not this flow.
        const payload = decodeJwtPayload<{ sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }>(
            tokenBody.id_token
        );
        if (!payload?.sub || !payload.email || !payload.email_verified) {
            throw new OAuthExchangeError("Google account has no verified email.");
        }

        return { providerUserId: payload.sub, email: payload.email, name: payload.name, avatarUrl: payload.picture };
    },
};

const GITHUB_SCOPE = "read:user user:email";
const GITHUB_USER_AGENT = "LuminaChronica";

export const githubProvider: OAuthProviderAdapter = {
    authorizeUrl(clientId, redirectUri, state) {
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: GITHUB_SCOPE,
            state,
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    },

    async exchangeCode(code, redirectUri, { clientId, clientSecret }) {
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
        });
        if (!tokenResponse.ok) throw new OAuthExchangeError(`GitHub token exchange failed (${tokenResponse.status}).`);

        const tokenBody = await tokenResponse.json<{ access_token?: string; error?: string }>();
        if (!tokenBody.access_token) throw new OAuthExchangeError(tokenBody.error ?? "GitHub token response had no access_token.");

        const authHeader = { Authorization: `Bearer ${tokenBody.access_token}`, "User-Agent": GITHUB_USER_AGENT };
        const userResponse = await fetch("https://api.github.com/user", { headers: authHeader });
        if (!userResponse.ok) throw new OAuthExchangeError(`GitHub user lookup failed (${userResponse.status}).`);
        const user = await userResponse.json<{ id: number; login: string; name?: string; avatar_url?: string; email?: string | null }>();

        // GitHub only includes `email` on /user when the user made it public;
        // otherwise it's null even though a verified email exists. The emails
        // endpoint always has it -- pick the verified primary.
        let email = user.email ?? undefined;
        if (!email) {
            const emailsResponse = await fetch("https://api.github.com/user/emails", { headers: authHeader });
            if (emailsResponse.ok) {
                const emails = await emailsResponse.json<{ email: string; primary: boolean; verified: boolean }[]>();
                email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email;
            }
        }
        if (!email) throw new OAuthExchangeError("GitHub account has no verified email.");

        return { providerUserId: String(user.id), email, name: user.name ?? user.login, avatarUrl: user.avatar_url };
    },
};

export function providerFor(name: string): OAuthProviderAdapter | null {
    if (name === "google") return googleProvider;
    if (name === "github") return githubProvider;
    return null;
}

function decodeJwtPayload<T>(jwt: string): T | null {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    try {
        const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
        return JSON.parse(atob(padded)) as T;
    } catch {
        return null;
    }
}
