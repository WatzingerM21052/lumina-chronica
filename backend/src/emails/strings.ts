// de/en copy for every transactional email template, flat keys -- mirrors
// the frontend's wwwroot/i18n/{de,en}.json convention (see
// docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md
// §5.2/§5.5). German is the source-of-truth/fallback language, same as the
// frontend's I18nService.

export type EmailLanguage = "de" | "en";

const de = {
    "footer.impressumLinkText": "Impressum",

    "passwordResetCode.subject": "Lumina Chronica: Passwort zurücksetzen",
    "passwordResetCode.preheader": "Dein Bestätigungscode: {0} — 20 Minuten gültig.",
    "passwordResetCode.heading": "Passwort zurücksetzen",
    "passwordResetCode.lede": "Gib diesen Code in Lumina Chronica ein, um ein neues Passwort zu setzen.",
    "passwordResetCode.validity": "Der Code ist 20 Minuten gültig.",
    "passwordResetCode.fallbackLinkText": "Direkt im Browser zurücksetzen",
    "passwordResetCode.notYouNote": "Du hast das nicht angefordert? Dann ignoriere diese E-Mail — ohne den Code bleibt dein Passwort unverändert.",

    "passwordChanged.subject": "Lumina Chronica: Passwort geändert",
    "passwordChanged.heading": "Dein Passwort wurde geändert",
    "passwordChanged.body": "Das Passwort für dein Lumina-Chronica-Konto wurde am {0} geändert.",
    "passwordChanged.notYouNote": "Warst du das nicht? Dann schreib uns bitte umgehend an {0} — und setze dein Passwort erneut zurück, solange du noch Zugriff auf dieses E-Mail-Postfach hast.",

    "emailChanged.subject": "Lumina Chronica: E-Mail-Adresse geändert",
    "emailChanged.heading": "Deine E-Mail-Adresse wurde geändert",
    "emailChanged.body": "Die E-Mail-Adresse deines Lumina-Chronica-Kontos wurde am {0} auf {1} geändert. Diese Adresse erhält ab jetzt keine Nachrichten zu deinem Konto mehr.",
    "emailChanged.notYouNote": "Warst du das nicht? Dann schreib uns bitte umgehend an {0} — ein Passwort-Reset über diese Adresse ist nicht mehr möglich.",

    "oauthNoPassword.subject": "Lumina Chronica: Kein Passwort zum Zurücksetzen",
    "oauthNoPassword.heading": "Kein Passwort zum Zurücksetzen",
    "oauthNoPassword.body": "Dieser Account meldet sich über Google oder GitHub an und hat kein eigenes Passwort. Melde dich stattdessen über den jeweiligen Button an.",
};

const en: Partial<typeof de> = {
    "footer.impressumLinkText": "Legal Notice",

    "passwordResetCode.subject": "Lumina Chronica: Reset your password",
    "passwordResetCode.preheader": "Your verification code: {0} — valid for 20 minutes.",
    "passwordResetCode.heading": "Reset your password",
    "passwordResetCode.lede": "Enter this code in Lumina Chronica to set a new password.",
    "passwordResetCode.validity": "This code is valid for 20 minutes.",
    "passwordResetCode.fallbackLinkText": "Reset it directly in your browser",
    "passwordResetCode.notYouNote": "Didn't request this? You can safely ignore this email — your password stays unchanged without the code.",

    "passwordChanged.subject": "Lumina Chronica: Your password was changed",
    "passwordChanged.heading": "Your password was changed",
    "passwordChanged.body": "The password for your Lumina Chronica account was changed on {0}.",
    "passwordChanged.notYouNote": "Wasn't you? Please email us right away at {0} — and reset your password again while you still have access to this inbox.",

    "emailChanged.subject": "Lumina Chronica: Your email address was changed",
    "emailChanged.heading": "Your email address was changed",
    "emailChanged.body": "The email address of your Lumina Chronica account was changed to {1} on {0}. This address will no longer receive messages about your account.",
    "emailChanged.notYouNote": "Wasn't you? Please email us right away at {0} — a password reset via this address is no longer possible.",

    "oauthNoPassword.subject": "Lumina Chronica: No password to reset",
    "oauthNoPassword.heading": "No password to reset",
    "oauthNoPassword.body": "This account signs in via Google or GitHub and has no password of its own. Use that provider's button to sign in instead.",
};

const dictionaries: Record<EmailLanguage, Partial<typeof de>> = { de, en };

export function emailT(language: EmailLanguage, key: keyof typeof de, ...args: string[]): string {
    const template = dictionaries[language]?.[key] ?? de[key];
    return args.reduce<string>((text, arg, i) => text.split(`{${i}}`).join(arg), template);
}

// Shared by every "something changed on your account" email, so the
// timestamps read the same across templates. UTC on purpose: the Worker
// doesn't know the reader's timezone.
export function formatEmailTimestamp(language: EmailLanguage, date: Date = new Date()): string {
    return date.toLocaleString(language === "en" ? "en-GB" : "de-AT", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });
}
