// Paginates TXT/MD reader content via CSS multi-column layout -- the same
// technique epub.js uses internally for its own paginated flow (see
// epubReader.js's notes on inline column-width/height overrides winning
// over stylesheet rules). `contentId`'s own width stays 100% of its parent
// (`viewportId`); giving it a fixed `height` and a `column-width` equal to
// the viewport's own clientWidth forces exactly one column per "page" --
// the box then overflows *horizontally* to hold the rest (a standard CSS
// multicol behavior when height is constrained), and `viewportId`'s
// `overflow: hidden` (see .reader-content--paginated in app.css) clips
// every column but the current one. Paging is a `translateX` on
// `contentId`, not native scrolling.
const instances = new Map();
const GAP_PX = 48;

function measure(viewportId, contentId) {
    const viewport = document.getElementById(viewportId);
    const content = document.getElementById(contentId);
    if (!viewport || !content) return null;

    // viewportId (#reader-content) carries the reader's own padding
    // (app.css's .reader-content rule) -- clientWidth/clientHeight include
    // that padding, but contentId is a plain child sitting *inside* it, so
    // using the raw clientWidth/clientHeight overshoots by the padding
    // amount on every side, clipping a padding-width sliver of every
    // column's left edge (and the content's bottom) once overflow:hidden
    // clips the box. Subtract the viewport's own padding first.
    const cs = getComputedStyle(viewport);
    const paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const width = viewport.clientWidth - paddingX;
    const height = viewport.clientHeight - paddingY;

    content.style.transform = "translateX(0)";
    content.style.columnWidth = `${width}px`;
    content.style.columnGap = `${GAP_PX}px`;
    content.style.columnFill = "auto"; // strict sequential fill, not "balance"'s redistribution -- verified against real layout, see textPaginator's own PR notes
    content.style.height = `${height}px`;

    const pageCount = Math.max(1, Math.round(content.scrollWidth / (width + GAP_PX)));
    return { width, height, pageCount };
}

export function init(viewportId, contentId, dotNetRef) {
    const m = measure(viewportId, contentId);
    if (!m) return 1;
    instances.set(contentId, { ...m, currentPage: 1, dotNetRef });
    wireAnchorClicks(contentId);
    return m.pageCount;
}

// Re-measures after a font-size/page-width/line-height change resizes the
// content -- pageCount can change entirely, so the caller re-derives a
// target page from the fraction it had before calling this and follows up
// with goToPage; this only updates pageCount/width/height, it doesn't move
// the current page itself.
export function relayout(viewportId, contentId) {
    const m = measure(viewportId, contentId);
    if (!m) return 1;
    const entry = instances.get(contentId);
    instances.set(contentId, { ...m, currentPage: entry?.currentPage ?? 1, dotNetRef: entry?.dotNetRef });
    return m.pageCount;
}

// A TOC (or any in-content anchor link, e.g. Markdig's UseAutoIdentifiers
// heading ids) targets an element by id -- the browser's native "scroll
// into view" for such a click can't work here, since #reader-content
// clips with overflow:hidden and this content is positioned via a
// translateX transform, not real scroll offset. Intercept the click,
// compute which page the target id falls on, and jump there directly.
// Wired once per content element (guarded via a dataset flag) since this
// listener needs to survive Scroll<->Book toggles, which reuse the same
// DOM node rather than recreating it -- re-attaching on every init() would
// stack duplicate listeners.
function wireAnchorClicks(contentId) {
    const content = document.getElementById(contentId);
    if (!content || content.dataset.paginatorAnchorsWired) return;
    content.dataset.paginatorAnchorsWired = "true";

    content.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;

        const entry = instances.get(contentId);
        if (!entry) return; // not paginated (Scroll View) -- let the native anchor jump handle it

        const targetId = decodeURIComponent(link.getAttribute("href").slice(1));
        const target = document.getElementById(targetId);
        if (!target) return;

        event.preventDefault();
        // getBoundingClientRect() reflects contentId's *current* on-screen
        // (post-transform) position, and target moves by the identical
        // transform as a descendant -- so this delta is the target's true
        // offset within the untransformed column flow regardless of which
        // page is currently showing.
        const offset = target.getBoundingClientRect().left - content.getBoundingClientRect().left;
        const targetPage = Math.max(1, Math.round(offset / (entry.width + GAP_PX)) + 1);
        const actualPage = goToPage(contentId, targetPage);
        entry.dotNetRef?.invokeMethodAsync("OnTxtMdPageChanged", actualPage);
    });
}

export function goToPage(contentId, page) {
    const entry = instances.get(contentId);
    const content = document.getElementById(contentId);
    if (!entry || !content) return 1;

    const clamped = Math.max(1, Math.min(page, entry.pageCount));
    content.style.transform = `translateX(-${(clamped - 1) * (entry.width + GAP_PX)}px)`;
    entry.currentPage = clamped;
    return clamped;
}

export function getPageCount(contentId) {
    return instances.get(contentId)?.pageCount ?? 1;
}

export function getCurrentPage(contentId) {
    return instances.get(contentId)?.currentPage ?? 1;
}

export function destroy(contentId) {
    const content = document.getElementById(contentId);
    if (content) {
        content.style.columnWidth = "";
        content.style.columnGap = "";
        content.style.height = "";
        content.style.transform = "";
    }
    instances.delete(contentId);
}
