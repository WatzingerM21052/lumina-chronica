// Turns fetched bytes into an object URL for <img src="..."> -- used for
// covers, since the cover endpoint requires an Authorization header that a
// bare <img> tag can't send. See documentation/Architecture.md.
export function createObjectUrl(bytes, mimeType) {
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url) {
    URL.revokeObjectURL(url);
}
