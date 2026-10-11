// Text search over user content with LIKE. SQLite's LIKE ignores case for
// ASCII letters only, so "KÜSTEN" never found "Küstenmann" and "über" never
// found "Über ...". D1 has no ICU, so both sides are folded the same way:
// the column with a REPLACE chain, the term in JS, using one shared table of
// the capitals that occur in German and the common Western languages.

const FOLD: ReadonlyArray<readonly [string, string]> = [
    ["Ä", "ä"], ["Ö", "ö"], ["Ü", "ü"], ["ẞ", "ß"],
    ["À", "à"], ["Á", "á"], ["Â", "â"], ["Ã", "ã"], ["Å", "å"], ["Æ", "æ"],
    ["Ç", "ç"], ["È", "è"], ["É", "é"], ["Ê", "ê"], ["Ë", "ë"],
    ["Ì", "ì"], ["Í", "í"], ["Î", "î"], ["Ï", "ï"], ["Ñ", "ñ"],
    ["Ò", "ò"], ["Ó", "ó"], ["Ô", "ô"], ["Õ", "õ"], ["Ø", "ø"], ["Œ", "œ"],
    ["Ù", "ù"], ["Ú", "ú"], ["Û", "û"], ["Ý", "ý"],
];

// SQL expression for `column` with the capitals above lowered. The table is
// fixed and has no quotes, so inlining it is safe.
export function foldedColumn(column: string): string {
    return FOLD.reduce((expr, [upper, lower]) => `REPLACE(${expr}, '${upper}', '${lower}')`, column);
}

export function foldTerm(term: string): string {
    return FOLD.reduce((text, [upper, lower]) => text.split(upper).join(lower), term);
}

// A user's term goes into LIKE as text: escape LIKE's own wildcards so a
// search for "100%" or "a_b" means exactly that. Pair it with
// `${foldedColumn(col)} LIKE ? ESCAPE '\\'`.
export function likePattern(search: string): string {
    return `%${foldTerm(search).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

// "column LIKE ? ESCAPE '\'" over the folded column -- one placeholder.
export function likeClause(column: string): string {
    return `${foldedColumn(column)} LIKE ? ESCAPE '\\'`;
}
