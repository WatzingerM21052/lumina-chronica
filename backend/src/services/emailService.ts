// Wraps Resend's HTTP API behind one small, test-mockable function -- no
// SDK dependency, consistent with this Worker's "native APIs over
// dependencies" style elsewhere (e.g. crypto.subtle for password hashing
// instead of a bcrypt package).
export async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: "Lumina Chronica <noreply@luminachronica.com>", to, subject, html }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${response.status}`);
}
