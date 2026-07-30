// Client-side metadata enrichment via the OpenLibrary API -- fills
// description/genre/publisher/pages/cover from a known ISBN when local file
// extraction (metadataExtractor.js) couldn't find them. Unlike that module,
// this sends the user's ISBN to a third-party service, so it's only ever
// triggered by an explicit user action (an "Info abrufen" button), never
// automatically -- see BookUpload.razor/BookDetail.razor.
//
// Confirmed via live probing before writing this (real ISBNs, real browser
// fetches) that OpenLibrary's CORS allows direct calls from this app's
// origin, so no backend proxy is needed -- same client-side stance as
// metadataExtractor.js, and for the same reason (sidesteps the Workers
// CPU-budget concern entirely by never touching the backend at all).

let pendingCoverId = null;
let cachedCoverBlob;

// OpenLibrary's `description` field is inconsistently either a plain string
// or `{type, value}` -- confirmed live on a real edition record.
function textValue(value) {
    if (!value) return null;
    return typeof value === "string" ? value : (value.value ?? null);
}

export async function lookupByIsbn(isbn) {
    pendingCoverId = null;
    cachedCoverBlob = undefined;

    const cleanIsbn = isbn.replace(/[^0-9Xx]/g, "");
    if (!cleanIsbn) return { found: false };

    const editionRes = await fetch(`https://openlibrary.org/isbn/${cleanIsbn}.json`);
    if (!editionRes.ok) return { found: false };
    const edition = await editionRes.json();

    // The edition record has no `subjects` (genre) at all -- confirmed live
    // against two real books -- only the work record does, so a second
    // fetch is unavoidable when a genre guess is wanted.
    let workDescription = null;
    let subjects = [];
    const workKey = edition.works?.[0]?.key;
    if (workKey) {
        try {
            const workRes = await fetch(`https://openlibrary.org${workKey}.json`);
            if (workRes.ok) {
                const work = await workRes.json();
                workDescription = textValue(work.description);
                subjects = work.subjects ?? [];
            }
        } catch {
            // Best-effort -- the edition data alone is still useful without this.
        }
    }

    const coverId = (edition.covers ?? []).find((id) => id > 0);
    pendingCoverId = coverId ?? null;

    return {
        found: true,
        description: textValue(edition.description) ?? workDescription,
        genre: subjects[0]?.name ?? null,
        publisher: edition.publishers?.[0] ?? null,
        pages: edition.number_of_pages ?? null,
        // publish_date is inconsistently formatted ("2016", full dates,
        // prose) -- passed through as-is, the C# side only accepts it if
        // DateOnly.TryParse succeeds rather than guessing a fake day/month.
        releaseDate: edition.publish_date ?? null,
        hasCover: !!coverId,
    };
}

async function resolveCoverBlob() {
    if (cachedCoverBlob !== undefined) return cachedCoverBlob;
    if (!pendingCoverId) return (cachedCoverBlob = null);

    const res = await fetch(`https://covers.openlibrary.org/b/id/${pendingCoverId}-L.jpg`);
    cachedCoverBlob = res.ok ? await res.blob() : null;
    return cachedCoverBlob;
}

// Same standalone-call convention as metadataExtractor.js's
// getCoverBytes()/getCoverContentType() -- byte[] stays its own top-level
// return value rather than a field nested in the object above.
export async function getCoverBytes() {
    const blob = await resolveCoverBlob();
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
}

export async function getCoverContentType() {
    const blob = await resolveCoverBlob();
    return blob ? blob.type : null;
}
