// Proxies rest.api.bible -- see documentation/Architecture.md's "Bible page"
// row for why this is a backend proxy (every other external API in this app
// talks to its provider directly from the client) and the license
// constraints this enforces. BIBLE_API_KEY is a Worker secret, never sent
// to the browser.

const API_BASE = "https://rest.api.bible/v1";

export type BibleTranslation = {
    id: string;
    abbreviation: string;
    name: string;
    language: "en" | "de";
    isBiblica: boolean;
};

// Curated allowlist, not the full ~500-entry api.bible catalog -- matches
// the "ein paar Möglichkeiten" (a few options) request and keeps quota
// usage predictable. IDs verified live against GET /v1/bibles?language=eng
// and ?language=deu on 2026-08-02 -- don't guess new ones without the same
// verification, api.bible's IDs aren't derivable from the abbreviation.
export const TRANSLATIONS: BibleTranslation[] = [
    { id: "78a9f6124f344018-01", abbreviation: "NIV", name: "New International Version 2011", language: "en", isBiblica: true },
    { id: "9879dbb7cfe39e4d-01", abbreviation: "WEB", name: "World English Bible", language: "en", isBiblica: false },
    { id: "06125adad2d5898a-01", abbreviation: "ASV", name: "American Standard Version", language: "en", isBiblica: false },
    { id: "926aa5efbc5e04e2-01", abbreviation: "LUT1912", name: "Lutherbibel 1912", language: "de", isBiblica: false },
    { id: "95410db44ef800c1-01", abbreviation: "ELB", name: "Elberfelder Bibel (unrevidiert)", language: "de", isBiblica: false },
];

export class InvalidTranslationError extends Error {}
export class BibleApiError extends Error {}

function requireTranslation(bibleId: string): BibleTranslation {
    const translation = TRANSLATIONS.find((t) => t.id === bibleId);
    if (!translation) throw new InvalidTranslationError(`Unknown or unsupported translation: ${bibleId}`);
    return translation;
}

async function callBibleApi<T>(apiKey: string, path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const res = await fetch(url.toString(), { headers: { "api-key": apiKey } });
    if (!res.ok) throw new BibleApiError(`api.bible request failed: ${res.status}`);
    return (await res.json()) as T;
}

export type BibleChapterRef = { id: string; number: string; reference: string };

export type BibleChapter = {
    id: string;
    reference: string;
    content: string;
    copyright: string;
    next: BibleChapterRef | null;
    previous: BibleChapterRef | null;
    fumsToken: string;
};

// content-type=html gives per-verse <span data-number="14" data-sid="PHP 2:14">
// markers (confirmed live 2026-08-02) -- lets the frontend scroll to/highlight
// a specific verse (Philippians 2:14 on first open) without a second call.
export async function getChapter(apiKey: string, bibleId: string, chapterId: string): Promise<BibleChapter> {
    requireTranslation(bibleId);
    const json = await callBibleApi<{ data: any; meta: { fumsToken: string } }>(apiKey, `/bibles/${bibleId}/chapters/${chapterId}`, {
        "content-type": "html",
        "include-notes": "false",
        "include-titles": "true",
        "include-chapter-numbers": "false",
        "include-verse-numbers": "true",
        "fums-version": "3",
    });

    return {
        id: json.data.id,
        reference: json.data.reference,
        content: json.data.content,
        copyright: json.data.copyright,
        next: json.data.next ?? null,
        previous: json.data.previous ?? null,
        fumsToken: json.meta.fumsToken,
    };
}

export type BibleBook = { id: string; name: string; nameLong: string };

export async function listBooks(apiKey: string, bibleId: string): Promise<BibleBook[]> {
    requireTranslation(bibleId);
    const json = await callBibleApi<{ data: any[] }>(apiKey, `/bibles/${bibleId}/books`);
    return json.data.map((b) => ({ id: b.id, name: b.name, nameLong: b.nameLong }));
}

// api.bible lists an "intro" pseudo-chapter per book (front matter, no
// verses) -- filtered out, it's not something a reader can jump to.
export async function listChapters(apiKey: string, bibleId: string, bookId: string): Promise<BibleChapterRef[]> {
    requireTranslation(bibleId);
    const json = await callBibleApi<{ data: any[] }>(apiKey, `/bibles/${bibleId}/books/${bookId}/chapters`);
    return json.data.filter((c) => c.number !== "intro").map((c) => ({ id: c.id, number: c.number, reference: c.reference }));
}

export type BibleSearchResult = { id: string; reference: string; text: string };

export async function search(apiKey: string, bibleId: string, query: string): Promise<{ total: number; results: BibleSearchResult[] }> {
    requireTranslation(bibleId);
    const json = await callBibleApi<{ data: { total: number; verses: any[] } }>(apiKey, `/bibles/${bibleId}/search`, {
        query,
        limit: "20",
        "fums-version": "3",
    });

    return {
        total: json.data.total,
        results: (json.data.verses ?? []).map((v) => ({ id: v.id, reference: v.reference, text: v.text })),
    };
}
