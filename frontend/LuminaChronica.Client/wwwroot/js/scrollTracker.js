// Reports how far a scrollable container has been scrolled, as a 0..1
// fraction -- used as `position`/`percentage` for the TXT/MD reader views.
// Polled periodically from Reader.razor rather than wired as a scroll-event
// callback, since progress is only saved on a debounced timer anyway.
export function getScrollFraction(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return 0;

    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable <= 0) return 1;

    return Math.max(0, Math.min(1, el.scrollTop / scrollable));
}

export function setScrollFraction(elementId, fraction) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
}
