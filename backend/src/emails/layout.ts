import type { EmailLanguage } from "./strings";
import { emailT } from "./strings";

// Colors below are the classic-library theme's values, copied verbatim from
// frontend/LuminaChronica.Client/wwwroot/Styles/themes/classic-library.css
// -- email clients don't resolve CSS custom properties, so these have to be
// hardcoded hex. Keep this comment as the source-of-truth pointer rather
// than adding a drift-checking test (overkill for a handful of colors that
// only change with a deliberate theme edit).
const COLOR_BG_PAPER = "#f2e9d8";
const COLOR_BG_CARD = "#fbf6ec";
const COLOR_BORDER = "#dccba8";
const COLOR_INK = "#241a12";
const COLOR_INK_SECONDARY = "#5c4a37";
const COLOR_INK_MUTED = "#8a7660";
const COLOR_BRASS = "#8c6a24";

const FONT_UI = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Fraunces (the app's real display serif) isn't available in email --
// Georgia is already --font-family-display's own CSS fallback, so using it
// here doesn't diverge from what a font-blocking client would show anyway.
const FONT_DISPLAY = "Georgia,'Times New Roman',serif";

export type EmailLayoutParams = {
    language: EmailLanguage;
    frontendUrl: string;
    previewText: string;
    heading: string;
    /** Inner content between the heading and the footer note -- raw HTML, caller-escaped. */
    bodyHtml: string;
    /** The "wasn't you?" style closing note, rendered with a top border separating it from bodyHtml. Omit for templates with no such note. */
    footerNote?: string;
};

export function renderEmailLayout({ language, frontendUrl, previewText, heading, bodyHtml, footerNote }: EmailLayoutParams): string {
    const footerNoteRow = footerNote
        ? `
        <tr>
          <td align="center"
              style="padding:28px 40px 32px 40px;font-family:${FONT_UI};font-size:13px;
                     line-height:1.6;color:${COLOR_INK_MUTED};border-top:1px solid ${COLOR_BORDER};">
            ${footerNote}
          </td>
        </tr>`
        : "";

    return `<!-- preheader: the grey preview line next to the subject in the inbox -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:${COLOR_BG_PAPER};margin:0;padding:32px 0;">
  <tr>
    <td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background-color:${COLOR_BG_CARD};
                    border:1px solid ${COLOR_BORDER};border-radius:10px;overflow:hidden;">

        <tr>
          <td align="center" style="padding:32px 32px 8px 32px;">
            <img src="${frontendUrl}/images/email/email-logo.png"
                 width="80" alt="Lumina Chronica"
                 style="display:block;border:0;width:80px;height:auto;" />
          </td>
        </tr>

        <tr>
          <td align="center"
              style="padding:8px 32px 0 32px;font-family:${FONT_DISPLAY};
                     font-size:26px;line-height:1.15;color:${COLOR_INK};font-weight:600;">
            ${heading}
          </td>
        </tr>

        ${bodyHtml}
        ${footerNoteRow}
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;">
        <tr>
          <td align="center"
              style="padding:20px 32px;font-family:${FONT_UI};font-size:12px;line-height:1.6;
                     color:${COLOR_INK_MUTED};">
            Lumina Chronica · <a href="${frontendUrl}/impressum"
               style="color:${COLOR_BRASS};text-decoration:underline;">${emailT(language, "footer.impressumLinkText")}</a>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>`;
}

export const emailColors = {
    bgPaper: COLOR_BG_PAPER,
    bgCard: COLOR_BG_CARD,
    border: COLOR_BORDER,
    ink: COLOR_INK,
    inkSecondary: COLOR_INK_SECONDARY,
    inkMuted: COLOR_INK_MUTED,
    brass: COLOR_BRASS,
};
export const emailFonts = { ui: FONT_UI, display: FONT_DISPLAY };
