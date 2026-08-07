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

// Triggers a browser download for an already-created object URL (e.g. from
// createObjectUrl above) -- the project files gallery's "Herunterladen"
// button needs this since the real file endpoint requires an Authorization
// header a plain <a href> can't send, so the caller fetches the bytes via
// ApiClient first and only then calls this with the resulting blob: URL.
export function triggerDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
