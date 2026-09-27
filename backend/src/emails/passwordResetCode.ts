import { emailColors, emailFonts, renderEmailLayout } from "./layout";
import type { EmailLanguage } from "./strings";
import { emailT } from "./strings";
import { escapeHtml } from "./escapeHtml";

export type PasswordResetCodeEmail = { subject: string; html: string; text: string };

// code and resetUrl are both our own generated values (never user input),
// but escapeHtml() is applied anyway -- template code shouldn't have to
// reason about which interpolations are "safe this time".
export function renderPasswordResetCodeEmail(language: EmailLanguage, frontendUrl: string, code: string, resetUrl: string): PasswordResetCodeEmail {
    const safeCode = escapeHtml(code);
    const safeResetUrl = escapeHtml(resetUrl);
    const spacedCode = safeCode.split("").join(" "); // visual grouping only; the real value has no spaces

    const bodyHtml = `
        <tr>
          <td align="center"
              style="padding:16px 40px 0 40px;font-family:${emailFonts.ui};font-size:16px;
                     line-height:1.6;color:${emailColors.inkSecondary};">
            ${emailT(language, "passwordResetCode.lede")}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center"
                    style="background-color:${emailColors.bgPaper};border:1px solid ${emailColors.border};
                           border-radius:10px;padding:18px 32px;
                           font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
                           font-size:34px;line-height:1.2;font-weight:700;letter-spacing:6px;
                           color:${emailColors.ink};">
                  ${spacedCode}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center"
              style="padding:4px 32px 0 32px;font-family:${emailFonts.ui};font-size:13px;color:${emailColors.inkMuted};">
            ${emailT(language, "passwordResetCode.validity")}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:28px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${emailColors.brass}" style="border-radius:6px;">
                  <a href="${safeResetUrl}"
                     style="display:inline-block;padding:12px 28px;font-family:${emailFonts.ui};
                            font-size:15px;font-weight:600;color:${emailColors.bgCard};
                            text-decoration:none;border-radius:6px;">
                    ${emailT(language, "passwordResetCode.fallbackLinkText")}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

    const html = renderEmailLayout({
        language,
        frontendUrl,
        previewText: emailT(language, "passwordResetCode.preheader", safeCode),
        heading: emailT(language, "passwordResetCode.heading"),
        bodyHtml,
        footerNote: emailT(language, "passwordResetCode.notYouNote"),
    });

    const text = [
        emailT(language, "passwordResetCode.heading"),
        "",
        emailT(language, "passwordResetCode.lede"),
        "",
        code,
        "",
        emailT(language, "passwordResetCode.validity"),
        "",
        `${emailT(language, "passwordResetCode.fallbackLinkText")}: ${resetUrl}`,
        "",
        emailT(language, "passwordResetCode.notYouNote"),
    ].join("\n");

    return { subject: emailT(language, "passwordResetCode.subject"), html, text };
}
