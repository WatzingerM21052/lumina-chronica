import { ValidationError } from "../services/fileValidation";

// Upper bounds for every free-text field a user can write. Before these,
// only comments (2000) and auth fields were bounded: a title, description,
// biography or lore entry could be any size, which is both a storage/abuse
// problem and a layout one. Generous on purpose -- they stop runaway input,
// not normal writing. Counted in UTF-16 code units (JavaScript's
// string.length), the same unit the frontend's maxlength attribute uses,
// so the two agree for every script, emoji included.
//
// Mirrored for the UI in frontend/LuminaChronica.Client/Services/TextLimits.cs
// -- change both together.
export const TEXT_LIMITS = {
    title: 300, // book/project/lore/timeline titles, character/location/shelf names
    shortText: 200, // author, publisher, genre, origin, age, date labels, relationship type
    code: 64, // language, ISBN, release date
    description: 10_000, // book/project/shelf/character/location/timeline/relationship descriptions, personality
    longText: 50_000, // character biography
    loreContent: 200_000, // a lore entry is a whole document
    comment: 2_000,
    bookmarkNote: 2_000,
    tag: 50,
    tagCount: 30,
} as const;

// Checks every given field that is a string; absent/null fields are fine
// (updates only carry the fields that change). Throws the same
// ValidationError the routes already turn into a 400.
export function assertMaxLengths(fields: Record<string, unknown>, limits: Record<string, number>): void {
    for (const [name, max] of Object.entries(limits)) {
        const value = fields[name];
        if (typeof value === "string" && value.length > max) {
            throw new ValidationError(`${name} must be at most ${max} characters.`);
        }
    }
}

export function assertTagLimits(tags: unknown): void {
    if (!Array.isArray(tags)) return;
    if (tags.length > TEXT_LIMITS.tagCount) throw new ValidationError(`At most ${TEXT_LIMITS.tagCount} tags are allowed.`);
    for (const tag of tags) {
        if (typeof tag === "string" && tag.length > TEXT_LIMITS.tag) {
            throw new ValidationError(`Each tag must be at most ${TEXT_LIMITS.tag} characters.`);
        }
    }
}
