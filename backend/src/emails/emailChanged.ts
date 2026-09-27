import { emailColors, emailFonts, renderEmailLayout } from "./layout";
import type { EmailLanguage } from "./strings";
import { emailT } from "./strings";
import { escapeHtml } from "./escapeHtml";
import { CONTACT_EMAIL } from "./passwordChanged";

export type EmailChangedEmail = { subject: string; html: string; text: string };

// Review M-6: sent to the OLD address after an email change. The new
// address is masked (first character + domain) -- enough for the real owner
// to recognise their own change, without handing the full address to
// whoever reads the old inbox.
export function maskEmail(email: string): string {
    const at = email.indexOf("@");
    if (at < 1) return "•••";
    return `${email[0]}•••${email.slice(at)}`;
}

// changedAt must already be formatted (strings.ts's formatEmailTimestamp),
// same contract as renderPasswordChangedEmail.
export function renderEmailChangedEmail(language: EmailLanguage, frontendUrl: string, changedAt: string, newEmail: string): EmailChangedEmail {
    const maskedNewEmail = maskEmail(newEmail);
    const notYouNote = emailT(language, "emailChanged.notYouNote", `<a href="mailto:${CONTACT_EMAIL}" style="color:${emailColors.brass};">${CONTACT_EMAIL}</a>`);

    const bodyHtml = `
        <tr>
          <td align="center"
              style="padding:16px 40px 0 40px;font-family:${emailFonts.ui};font-size:16px;
                     line-height:1.6;color:${emailColors.inkSecondary};">
            ${emailT(language, "emailChanged.body", escapeHtml(changedAt), `<strong>${escapeHtml(maskedNewEmail)}</strong>`)}
          </td>
        </tr>`;

    const html = renderEmailLayout({
        language,
        frontendUrl,
        previewText: emailT(language, "emailChanged.heading"),
        heading: emailT(language, "emailChanged.heading"),
        bodyHtml,
        footerNote: notYouNote,
    });

    const text = [
        emailT(language, "emailChanged.heading"),
        "",
        emailT(language, "emailChanged.body", changedAt, maskedNewEmail),
        "",
        emailT(language, "emailChanged.notYouNote", CONTACT_EMAIL),
    ].join("\n");

    return { subject: emailT(language, "emailChanged.subject"), html, text };
}
