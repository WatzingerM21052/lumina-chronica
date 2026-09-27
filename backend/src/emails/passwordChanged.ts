import { emailColors, emailFonts, renderEmailLayout } from "./layout";
import type { EmailLanguage } from "./strings";
import { emailT } from "./strings";
import { escapeHtml } from "./escapeHtml";

export type PasswordChangedEmail = { subject: string; html: string; text: string };

// D8 (docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md):
// the "wasn't you?" contact address is a real, already-owned mailbox the
// user provided -- NOT the noreply@ sender. Deliberately not read from env;
// this is display copy, not infrastructure config, same reasoning as the
// address itself not needing DNS/domain setup.
const CONTACT_EMAIL = "luminachronica@gmx.at";

// changedAt must already be a fully-formatted, localized string -- this
// module has no opinion on date formatting, matching how frontend
// components pass pre-formatted strings into shared UI pieces.
export function renderPasswordChangedEmail(language: EmailLanguage, frontendUrl: string, changedAt: string): PasswordChangedEmail {
    const safeChangedAt = escapeHtml(changedAt);
    const notYouNote = emailT(language, "passwordChanged.notYouNote", `<a href="mailto:${CONTACT_EMAIL}" style="color:${emailColors.brass};">${CONTACT_EMAIL}</a>`);

    const bodyHtml = `
        <tr>
          <td align="center"
              style="padding:16px 40px 0 40px;font-family:${emailFonts.ui};font-size:16px;
                     line-height:1.6;color:${emailColors.inkSecondary};">
            ${emailT(language, "passwordChanged.body", safeChangedAt)}
          </td>
        </tr>`;

    const html = renderEmailLayout({
        language,
        frontendUrl,
        previewText: emailT(language, "passwordChanged.heading"),
        heading: emailT(language, "passwordChanged.heading"),
        bodyHtml,
        footerNote: notYouNote,
    });

    const text = [
        emailT(language, "passwordChanged.heading"),
        "",
        emailT(language, "passwordChanged.body", changedAt),
        "",
        emailT(language, "passwordChanged.notYouNote", CONTACT_EMAIL),
    ].join("\n");

    return { subject: emailT(language, "passwordChanged.subject"), html, text };
}
