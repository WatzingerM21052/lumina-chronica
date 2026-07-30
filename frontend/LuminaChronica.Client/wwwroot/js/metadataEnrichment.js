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
    // fetch is unavoidable when a genre guess is wanted. `subjects` is an
    // array of plain strings (e.g. "Fantasy fiction"), not `{name}` objects
    // -- confirmed live against a real work record.
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
        genre: subjects[0] ?? null,
        publisher: edition.publishers?.[0] ?? null,
        pages: edition.number_of_pages ?? null,
        // publish_date is inconsistently formatted ("2016", full dates,
        // prose) -- passed through as-is, the C# side only accepts it if
        // DateOnly.TryParse succeeds rather than guessing a fake day/month.
        releaseDate: edition.publish_date ?? null,
        hasCover: !!coverId,
    };
}

// Title/author search -- lets the user pick the right edition instead of
// trusting a single ISBN match blindly. `search.json` returns work-level
// docs (not editions): `cover_i` is a direct numeric cover ID usable with
// covers.openlibrary.org with no extra lookup, and `isbn` is every known
// edition's ISBN for that work -- confirmed live before writing this.
export async function searchByQuery(query) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(trimmed)}&fields=key,title,author_name,cover_i,first_publish_year,isbn&limit=8`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();

    return (json.docs ?? []).map((doc) => ({
        key: doc.key ?? null,
        title: doc.title ?? null,
        author: doc.author_name?.[0] ?? null,
        year: doc.first_publish_year ?? null,
        coverId: doc.cover_i ?? null,
        isbn: doc.isbn?.[0] ?? null,
    }));
}

// Fallback resolver for a chosen search result that has no ISBN at all --
// fetches only the work record (description/subjects) and uses the cover ID
// already known from the search result, skipping the edition call entirely
// since there's no edition to look up.
export async function lookupByWork(workKey, coverId) {
    pendingCoverId = coverId ?? null;
    cachedCoverBlob = undefined;

    if (!workKey) return { found: false };

    const workRes = await fetch(`https://openlibrary.org${workKey}.json`);
    if (!workRes.ok) return { found: false };
    const work = await workRes.json();

    return {
        found: true,
        description: textValue(work.description),
        genre: work.subjects?.[0] ?? null,
        publisher: null,
        pages: null,
        releaseDate: null,
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
