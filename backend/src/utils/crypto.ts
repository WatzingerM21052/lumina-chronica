// Password hashing (PBKDF2) and JWT signing/verification, both via the
// Workers runtime's native crypto.subtle — no external dependency needed.
//
// PBKDF2 iteration count: benchmarked against the real Workers runtime
// (wrangler dev --local) — 50,000 iterations already takes ~33ms, well over
// the Workers Free plan's 10ms CPU-time-per-request budget (exceeding it
// fails the request with error 1102). PBKDF2_ITERATIONS is set low enough to
// leave solid headroom under that budget. This is below current OWASP
// guidance (600,000) for PBKDF2-HMAC-SHA256 — a deliberate, documented
// tradeoff for staying on the free plan (see documentation/Architecture.md).
// Revisit only if the project ever moves to a paid Workers plan.
const PBKDF2_ITERATIONS = 8000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BITS = 256;

// OAuth-only accounts (issue #40) have no password. users.password_hash
// stays NOT NULL (see the migration's own comment for why: making it
// nullable requires a SQLite table-rebuild that real D1 rejects with a
// FOREIGN KEY constraint error even with PRAGMA foreign_keys = OFF around
// it -- confirmed against the actual production database, not just assumed
// -- so this sentinel avoids the schema change entirely). It never starts
// with "pbkdf2$", so verifyPassword's format check below rejects it exactly
// like any other malformed value: cleanly, no crash, no possible match.
export const OAUTH_NO_PASSWORD_SENTINEL = "oauth:no-password";

const textEncoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
    const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = "";
    for (const byte of array) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const keyMaterial = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        keyMaterial,
        PBKDF2_HASH_BITS
    );
    return new Uint8Array(bits);
}

// Stored format: pbkdf2$<iterations>$<base64url-salt>$<base64url-hash>
export async function hashPassword(plain: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
    const hash = await deriveBits(plain, salt, PBKDF2_ITERATIONS);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

// stored is nullable since OAuth-only accounts (issue #40) have no password
// at all -- any password attempt against such an account must fail cleanly,
// not throw.
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
    if (!stored) return false;
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

    const iterations = Number.parseInt(parts[1], 10);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;

    const salt = fromBase64Url(parts[2]);
    const expectedHash = fromBase64Url(parts[3]);
    const actualHash = await deriveBits(plain, salt, iterations);
    return constantTimeEqual(actualHash, expectedHash);
}

export type JwtPayload = {
    sub: number;
    role: string;
    iat: number;
    exp: number;
};

async function hmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        textEncoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

export async function signJwt(claims: { sub: number; role: string }, secret: string, expiresInSeconds: number): Promise<string> {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = { sub: claims.sub, role: claims.role, iat: now, exp: now + expiresInSeconds };

    const encodedHeader = toBase64Url(textEncoder.encode(JSON.stringify(header)));
    const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const key = await hmacKey(secret);
    const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(signingInput));

    return `${signingInput}.${toBase64Url(signature)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const key = await hmacKey(secret);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const isValid = await crypto.subtle.verify("HMAC", key, fromBase64Url(encodedSignature), textEncoder.encode(signingInput));
    if (!isValid) return null;

    let payload: JwtPayload;
    try {
        payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
    } catch {
        return null;
    }

    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
}

// OAuth (issue #40): a CSRF `state` value for the authorize redirect, and a
// bearer-style single-use code for the cross-origin token handoff (see
// oauthService.ts). Both are high-entropy random values, not derived from
// anything guessable.
export function randomToken(bytes = 32): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// The exchange code table stores only this hash, never the raw code -- same
// principle as never storing a plaintext password: a leaked DB row alone
// can't be replayed without also having intercepted the original redirect.
export async function sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
