// Shared rules for the two things a user can sign in with (email or
// username), so registration, profile edits, OAuth, login, the reset flow
// and the throttle keys all agree on what "the same account" means.

// Review N-5: no "@" (so a username can never equal someone else's email and
// shadow it in the email-or-username lookup), URL-safe (usernames appear in
// /u/{username}), bounded. Only enforced for NEW values -- legacy usernames
// outside the pattern keep working, see the callers.
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
export const USERNAME_RULE_MESSAGE = "username must be 3-32 characters: letters, digits, '.', '_' or '-'.";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 254;
// Lowered from 8 to 6 on the owner's request (2026-09-28). Online guessing
// stays bounded by the login throttle (rateLimitService.ts).
export const MIN_PASSWORD_LENGTH = 6;
// Upper bound for any password field, so PBKDF2 cost per request stays
// bounded (review N-3). Far above anything a person or manager generates.
export const MAX_PASSWORD_LENGTH = 1024;

export class InvalidUsernameError extends Error {}

// Review N-6: emails are stored and compared lowercase. Legacy rows may
// still hold mixed case (no data migration), which is why every lookup
// compares lower(email) against this, never email = ?.
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// For the login/reset identifier and every throttle key derived from it:
// "Foo@x.at" and "foo@x.at" must hit the same account AND the same rate
// limit bucket (otherwise changing case skips the 60s resend cooldown).
// Contains "@" means email, since new usernames can't (N-5).
export function normalizeIdentifier(identifier: string): string {
    const trimmed = identifier.trim();
    return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
}

// Request-body guard for N-3: a non-string (object, number) used to reach
// the services and 500 there.
export function isBoundedString(value: unknown, maxLength: number): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}
