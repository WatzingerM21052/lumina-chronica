// Shared shape check for a place in a book, as sent by the reader for
// reading progress (POST /api/reading/update) and bookmarks
// (POST /api/bookmarks). Before this only bookId/percentage were checked to
// be numbers: a string `chapter` was stored as-is and later crashed the
// frontend's deserialisation when the reader loaded the progress.
//
// position is per-format (EPUB CFI, PDF page, TXT/MD scroll fraction -- see
// readingService.ts), so it's only bounded, not parsed.
export const MAX_POSITION_LENGTH = 2_000;

export type ReadingPosition = {
    bookId: number;
    percentage: number;
    chapter: number | null;
    position: string | null;
};

// Returns the checked values, or the message for a 400.
export function parseReadingPosition(body: {
    bookId?: unknown;
    percentage?: unknown;
    chapter?: unknown;
    position?: unknown;
}): { value: ReadingPosition } | { error: string } {
    const { bookId, percentage, chapter, position } = body;
    if (typeof bookId !== "number" || typeof percentage !== "number") {
        return { error: "bookId and percentage are required." };
    }
    if (!Number.isInteger(bookId) || bookId < 1) return { error: "bookId must be a positive integer." };
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        return { error: "percentage must be between 0 and 100." };
    }
    if (chapter != null && (typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 0)) {
        return { error: "chapter must be a non-negative integer or null." };
    }
    if (position != null && (typeof position !== "string" || position.length > MAX_POSITION_LENGTH)) {
        return { error: `position must be a string of at most ${MAX_POSITION_LENGTH} characters or null.` };
    }
    return {
        value: {
            bookId,
            percentage,
            chapter: (chapter as number | null | undefined) ?? null,
            position: (position as string | null | undefined) ?? null,
        },
    };
}
