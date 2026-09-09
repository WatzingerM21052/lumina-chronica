// Extracts a book cover's average/dominant color at runtime via an
// offscreen canvas, so a book's spine visually relates to its actual cover
// instead of a procedurally-assigned placeholder color (Library Rework
// Phase 3). This is a simple average-color approximation (mean of all
// sampled pixel RGB values), not a full dominant-color-clustering
// algorithm -- a deliberate simplicity choice; a proper k-means/histogram
// approach would need a dependency or considerably more code for a result
// that, for a small spine-tint swatch, isn't visually distinguishable from
// a good average in the vast majority of covers.
//
// Results are cached by the STABLE cover URL (Book.CoverUrl, e.g.
// "/api/books/5/cover"), not by the ephemeral blob: URL used to actually
// draw the image -- a fresh component mount for the same book produces a
// brand-new unique blob: URL every time (see BlobUrlService's
// createObjectUrl), so caching by that would never hit across re-mounts of
// the same book's cover.
const colorCache = new Map();

// Small downscale target -- average color doesn't need full resolution,
// and a tiny canvas keeps getImageData cheap even for a large cover image.
const SAMPLE_SIZE = 24;

// Perceptual luminance approximation (not full WCAG relative luminance
// with gamma correction -- good enough to decide "is this average color
// light enough to risk the white spine-title text becoming hard to read,"
// not a certified contrast-ratio calculation).
function relativeLuminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

async function sampleAverageColor(objectUrl) {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha === 0) continue; // skip fully transparent pixels
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
    }

    if (count === 0) return null; // fully transparent image -- nothing to sample

    const avgR = Math.round(r / count);
    const avgG = Math.round(g / count);
    const avgB = Math.round(b / count);

    // The book's spine title renders in near-white text (see
    // .shelf-book-spine-title, app.css) on top of whatever this tint
    // becomes. A raw average from a very light/white cover (common for
    // real book covers) would make that text hard to read -- darken the
    // result toward black when it's too light, rather than discarding a
    // real, if pale, cover color entirely.
    if (relativeLuminance(avgR, avgG, avgB) > 0.6) {
        const darken = 0.5;
        return `rgb(${Math.round(avgR * darken)}, ${Math.round(avgG * darken)}, ${Math.round(avgB * darken)})`;
    }

    return `rgb(${avgR}, ${avgG}, ${avgB})`;
}

export async function extractDominantColor(coverUrl, objectUrl) {
    if (colorCache.has(coverUrl)) {
        return colorCache.get(coverUrl);
    }

    let color = null;
    try {
        color = await sampleAverageColor(objectUrl);
    } catch {
        // Decode failure, tainted canvas, or any other extraction error --
        // leave color as null so the caller falls back to its own
        // procedural default rather than surfacing an error to the user.
    }

    // Only cache successful extractions -- caching a null (failure) result
    // by the stable coverUrl would permanently suppress this book's tint
    // for the rest of the session after a single transient failure (e.g. a
    // decode error or a blob URL revoked mid-flight), with no retry.
    if (color !== null) colorCache.set(coverUrl, color);
    return color;
}
