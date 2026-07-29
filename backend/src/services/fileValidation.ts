// Shared file-validation logic for anything uploaded to R2 (book files,
// book covers, shelf covers). Extracted from bookService.ts when shelfService.ts
// needed the exact same cover-validation behavior, rather than duplicating it.

export class ValidationError extends Error {}

export const ALLOWED_COVER_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024;

export const COVER_MIME_HINTS: Record<string, string[]> = {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
};

export function extensionOf(filename: string): string {
    const dot = filename.lastIndexOf(".");
    return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function validateFile(file: File, allowedExtensions: readonly string[], mimeHints: Record<string, string[]>, maxBytes: number, label: string): string {
    const ext = extensionOf(file.name);
    if (!allowedExtensions.includes(ext as never)) {
        throw new ValidationError(`${label} must be one of: ${allowedExtensions.join(", ")}.`);
    }
    const hints = mimeHints[ext] ?? [];
    // "application/octet-stream" is the browser's generic fallback when the
    // OS has no MIME association for the extension -- observed live for
    // .epub uploads from Chrome on Windows (no ebook reader installed to
    // register application/epub+zip), which made every real EPUB upload
    // fail this check. Treated as "unknown", same as an empty file.type,
    // rather than a mismatch -- an actual mismatch (e.g. a renamed .txt
    // reporting text/plain) is still rejected.
    if (hints.length > 0 && file.type && file.type !== "application/octet-stream" && !hints.includes(file.type)) {
        throw new ValidationError(`${label} content does not match its .${ext} extension.`);
    }
    if (file.size > maxBytes) {
        throw new ValidationError(`${label} exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit.`);
    }
    return ext;
}
