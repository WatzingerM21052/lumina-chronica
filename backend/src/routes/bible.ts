import { Hono } from "hono";
import type { AppEnv } from "../models/env";
import { success, failure } from "../models/response";
import { getChapter, listBooks, listChapters, search, TRANSLATIONS, InvalidTranslationError, BibleApiError } from "../services/bibleService";

// Deliberately public (no requireAuth) -- reached only via a link on the
// public Impressum page, and gating it behind login would break the easter
// egg for a logged-out visitor. api.bible's free tier (5,000 req/month) is
// generous for a personal site. See documentation/Architecture.md.
export const bibleRoute = new Hono<AppEnv>();

bibleRoute.get("/translations", (c) => {
    return c.json(success(TRANSLATIONS.map(({ id, abbreviation, name, language, isBiblica }) => ({ id, abbreviation, name, language, isBiblica }))));
});

bibleRoute.get("/chapters/:bibleId/:chapterId", async (c) => {
    try {
        const chapter = await getChapter(c.env.BIBLE_API_KEY, c.req.param("bibleId"), c.req.param("chapterId"));
        return c.json(success(chapter));
    } catch (err) {
        if (err instanceof InvalidTranslationError) return c.json(failure("INVALID_TRANSLATION", err.message), 400);
        if (err instanceof BibleApiError) return c.json(failure("BIBLE_API_ERROR", "Der Bibeltext konnte gerade nicht geladen werden. Bitte versuche es erneut."), 502);
        throw err;
    }
});

bibleRoute.get("/books/:bibleId/:bookId/chapters", async (c) => {
    try {
        const chapters = await listChapters(c.env.BIBLE_API_KEY, c.req.param("bibleId"), c.req.param("bookId"));
        return c.json(success(chapters));
    } catch (err) {
        if (err instanceof InvalidTranslationError) return c.json(failure("INVALID_TRANSLATION", err.message), 400);
        if (err instanceof BibleApiError) return c.json(failure("BIBLE_API_ERROR", "Die Kapitelliste konnte gerade nicht geladen werden. Bitte versuche es erneut."), 502);
        throw err;
    }
});

bibleRoute.get("/books/:bibleId", async (c) => {
    try {
        const books = await listBooks(c.env.BIBLE_API_KEY, c.req.param("bibleId"));
        return c.json(success(books));
    } catch (err) {
        if (err instanceof InvalidTranslationError) return c.json(failure("INVALID_TRANSLATION", err.message), 400);
        if (err instanceof BibleApiError) return c.json(failure("BIBLE_API_ERROR", "Die Bücherliste konnte gerade nicht geladen werden. Bitte versuche es erneut."), 502);
        throw err;
    }
});

bibleRoute.get("/search/:bibleId", async (c) => {
    const query = c.req.query("q");
    if (!query) return c.json(failure("MISSING_QUERY", "Suchbegriff fehlt."), 400);

    try {
        const results = await search(c.env.BIBLE_API_KEY, c.req.param("bibleId"), query);
        return c.json(success(results));
    } catch (err) {
        if (err instanceof InvalidTranslationError) return c.json(failure("INVALID_TRANSLATION", err.message), 400);
        if (err instanceof BibleApiError) return c.json(failure("BIBLE_API_ERROR", "Die Suche ist gerade fehlgeschlagen. Bitte versuche es erneut."), 502);
        throw err;
    }
});
