import { emailFonts, emailColors, renderEmailLayout } from "./layout";
import type { EmailLanguage } from "./strings";
import { emailT } from "./strings";

export type OAuthNoPasswordEmail = { subject: string; html: string; text: string };

// Migrates the plain inline-string email passwordResetService.ts sent
// before this redesign -- same message, now through the shared layout and
// localized instead of a hardcoded German paragraph.
export function renderOAuthNoPasswordEmail(language: EmailLanguage, frontendUrl: string): OAuthNoPasswordEmail {
    const bodyHtml = `
        <tr>
          <td align="center"
              style="padding:16px 40px 32px 40px;font-family:${emailFonts.ui};font-size:16px;
                     line-height:1.6;color:${emailColors.inkSecondary};">
            ${emailT(language, "oauthNoPassword.body")}
          </td>
        </tr>`;

    const html = renderEmailLayout({
        language,
        frontendUrl,
        previewText: emailT(language, "oauthNoPassword.heading"),
        heading: emailT(language, "oauthNoPassword.heading"),
        bodyHtml,
    });

    const text = [emailT(language, "oauthNoPassword.heading"), "", emailT(language, "oauthNoPassword.body")].join("\n");

    return { subject: emailT(language, "oauthNoPassword.subject"), html, text };
}
