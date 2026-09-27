// Every value interpolated into an email template must go through this --
// a reset URL/code we generate ourselves is safe, but the moment a
// username or email address (both user-supplied) goes into the markup it's
// an HTML-injection vector, same reasoning as any other template engine.
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
