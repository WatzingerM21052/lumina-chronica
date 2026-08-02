// Client-side metadata enrichment via OpenLibrary + (optionally) Google
// Books -- fills description/genre/publisher/pages/cover from a known ISBN
// or a title/author search when local file extraction (metadataExtractor.js)
// couldn't find them. Unlike that module, this sends the user's data to a
// third-party service, so it's only ever triggered by an explicit user
// action (an "Info abrufen"/"Suchen" button), never automatically -- see
// BookUpload.razor/BookDetail.razor.
//
// Confirmed via live probing before writing this (real ISBNs, real browser
// fetches) that OpenLibrary's CORS allows direct calls from this app's
// origin, so no backend proxy is needed -- same client-side stance as
// metadataExtractor.js, and for the same reason (sidesteps the Workers
// CPU-budget concern entirely by never touching the backend at all).
//
// Google Books: confirmed live (curl, WebFetch, AND a real browser fetch --
// all three hit the exact same `project_number:624717413613` consumer) that
// Google now buckets every keyless request into a shared default consumer
// with a hard zero daily quota. There is no working anonymous tier anymore --
// an API key is mandatory. `GOOGLE_BOOKS_API_KEY` is safe to ship in this
// public client-side file: Google's own security model for this key type is
// HTTP-referrer restriction (configured in Cloud Console to this app's
// GitHub Pages origin), not secrecy -- the same pattern as a public Google
// Maps JS API key. If the key is ever empty, Google Books is silently
// skipped and search falls back to OpenLibrary alone.

const GOOGLE_BOOKS_API_KEY = "AIzaSyD14nj-uKTm9xCgwPEMhxAXXcj9IC0ZM4U";

let pendingCover = null; // { type: "openlibrary-id", value: number } | { type: "url", value: string } | null
let cachedCoverBlob;

function googleBooksEnabled() {
    return GOOGLE_BOOKS_API_KEY.length > 0;
}

// OpenLibrary's `description` field is inconsistently either a plain string
// or `{type, value}` -- confirmed live on a real edition record.
function textValue(value) {
    if (!value) return null;
    return typeof value === "string" ? value : (value.value ?? null);
}

// Some OpenLibrary/Google Books description text embeds raw HTML markup
// (e.g. `<p class="description">...</p>`) rather than plain text -- confirmed
// live on a real book. BookDetail.razor's `<p>@_book.Description</p>`
// binding is a plain (safe) text interpolation, so without this the literal
// tags show up as visible text instead of being stripped. DOMParser strips
// tags *and* decodes entities (`&amp;`, `&#39;`, ...) in one step -- a regex
// tag-strip alone would leave entities behind as a second, quieter version
// of the same bug. No script execution risk: the parsed document is never
// inserted into the page, only its .textContent is read.
function stripHtml(value) {
    if (!value) return value;
    const text = new DOMParser().parseFromString(value, "text/html").body.textContent ?? "";
    return text.trim() || null;
}

// Google Books thumbnail URLs come back as `http://`, which the browser
// blocks as mixed content on this https-served app.
function toHttpsUrl(url) {
    if (!url) return null;
    return url.replace(/^http:/, "https:");
}

function normalize(value) {
    return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Two results are "the same book" if they share any ISBN (OpenLibrary's
// `isbn` is every known edition's ISBN for a work, so this must be a set
// intersection, not a first-element comparison -- an isbn[0]-only compare
// would miss most real duplicates) or, failing that, if title+author match
// after normalization.
function isSameBook(a, b) {
    const aIsbns = a.isbnSet ?? [];
    const bIsbns = b.isbnSet ?? [];
    if (aIsbns.length > 0 && bIsbns.length > 0 && aIsbns.some((isbn) => bIsbns.includes(isbn))) return true;
    return normalize(a.title) === normalize(b.title) && normalize(a.author) === normalize(b.author) && normalize(a.title) !== "";
}

function dedupe(results) {
    const kept = [];
    for (const candidate of results) {
        if (!kept.some((existing) => isSameBook(existing, candidate))) kept.push(candidate);
    }
    return kept;
}

export async function lookupByIsbn(isbn) {
    pendingCover = null;
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
    pendingCover = coverId ? { type: "openlibrary-id", value: coverId } : null;

    return {
        found: true,
        description: stripHtml(textValue(edition.description) ?? workDescription),
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

async function searchOpenLibrary(query) {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,first_publish_year,isbn&limit=8`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();

    return (json.docs ?? []).map((doc) => ({
        source: "openlibrary",
        key: doc.key ?? null,
        googleBooksId: null,
        title: doc.title ?? null,
        author: doc.author_name?.[0] ?? null,
        year: doc.first_publish_year ?? null,
        coverId: doc.cover_i ?? null,
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg` : null,
        isbn: doc.isbn?.[0] ?? null,
        isbnSet: doc.isbn ?? [],
    }));
}

async function searchGoogleBooks(query) {
    if (!googleBooksEnabled()) return [];

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8&key=${GOOGLE_BOOKS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();

    return (json.items ?? []).map((item) => {
        const info = item.volumeInfo ?? {};
        const isbns = (info.industryIdentifiers ?? [])
            .filter((id) => id.type === "ISBN_10" || id.type === "ISBN_13")
            .map((id) => id.identifier);
        const coverUrl = toHttpsUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null);

        return {
            source: "googlebooks",
            key: null,
            googleBooksId: item.id ?? null,
            title: info.title ?? null,
            author: info.authors?.[0] ?? null,
            year: info.publishedDate ? Number.parseInt(info.publishedDate.slice(0, 4), 10) || null : null,
            coverId: null,
            coverUrl,
            isbn: isbns[0] ?? null,
            isbnSet: isbns,
        };
    });
}

// Title/author search -- lets the user pick the right edition instead of
// trusting a single ISBN match blindly. Queries OpenLibrary and (if
// configured) Google Books in parallel and merges the results, deduped, so
// the user sees one combined list rather than picking a source first.
export async function searchByQuery(query) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const [olResults, gbResults] = await Promise.all([searchOpenLibrary(trimmed), searchGoogleBooks(trimmed)]);
    return dedupe([...olResults, ...gbResults]).slice(0, 8);
}

// Fallback resolver for a chosen OpenLibrary search result that has no ISBN
// at all -- fetches only the work record (description/subjects) and uses
// the cover ID already known from the search result, skipping the edition
// call entirely since there's no edition to look up.
export async function lookupByWork(workKey, coverId) {
    pendingCover = coverId ? { type: "openlibrary-id", value: coverId } : null;
    cachedCoverBlob = undefined;

    if (!workKey) return { found: false };

    const workRes = await fetch(`https://openlibrary.org${workKey}.json`);
    if (!workRes.ok) return { found: false };
    const work = await workRes.json();

    return {
        found: true,
        description: stripHtml(textValue(work.description)),
        genre: work.subjects?.[0] ?? null,
        publisher: null,
        pages: null,
        releaseDate: null,
        hasCover: !!coverId,
    };
}

// Resolver for a chosen Google Books search result -- fetches the full
// volume record directly by ID (Google's documented single-resource
// endpoint), so this works even for a result with no ISBN at all, unlike
// the OpenLibrary path which needs an ISBN or a work key.
export async function lookupByGoogleBooksId(volumeId) {
    pendingCover = null;
    cachedCoverBlob = undefined;

    if (!googleBooksEnabled() || !volumeId) return { found: false };

    const res = await fetch(`https://www.googleapis.com/books/v1/volumes/${volumeId}?key=${GOOGLE_BOOKS_API_KEY}`);
    if (!res.ok) return { found: false };
    const item = await res.json();
    const info = item.volumeInfo ?? {};

    const coverUrl = toHttpsUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null);
    pendingCover = coverUrl ? { type: "url", value: coverUrl } : null;

    // publishedDate here is at least as precise as the source lets it be --
    // only accepted downstream if it parses as a full date, same rule as
    // OpenLibrary's publish_date (see the C# side's release-date handling).
    return {
        found: true,
        description: stripHtml(info.description ?? null),
        genre: info.categories?.[0] ?? null,
        publisher: info.publisher ?? null,
        pages: info.pageCount ?? null,
        releaseDate: info.publishedDate ?? null,
        hasCover: !!coverUrl,
    };
}

async function resolveCoverBlob() {
    if (cachedCoverBlob !== undefined) return cachedCoverBlob;
    if (!pendingCover) return (cachedCoverBlob = null);

    const url =
        pendingCover.type === "openlibrary-id"
            ? `https://covers.openlibrary.org/b/id/${pendingCover.value}-L.jpg`
            : pendingCover.value;

    const res = await fetch(url);
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
