// Wraps Resend's HTTP API behind one small, test-mockable function -- no
// SDK dependency, consistent with this Worker's "native APIs over
// dependencies" style elsewhere (e.g. crypto.subtle for password hashing
// instead of a bcrypt package).
// text is optional but should be passed by every caller that has one: an
// HTML-only email scores worse in spam filters, and it's the only version
// readable in a text-only client (docs/superpowers/specs/2026-09-27-
// password-reset-modernization-design.md §5.1).
export async function sendEmail(apiKey: string, to: string, subject: string, html: string, text?: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: "Lumina Chronica <noreply@luminachronica.com>", to, subject, html, ...(text ? { text } : {}) }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${response.status}`);
}
