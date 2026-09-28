// Components/LanguagePicker: while its listbox is open, the arrow keys move
// the highlighted option and Enter picks it -- so their browser defaults
// (caret jump, implicit form submit) must not run. Blazor's
// @onkeydown:preventDefault is fixed per render, not per key, which would
// also swallow normal typing; hence this one small native listener.
//
// Escape is handled here entirely: it must close only the list, never the
// surrounding Dialog. Blazor's @onkeydown:stopPropagation can't do that --
// in WebAssembly the picker's handler re-renders synchronously, which
// clears the flag before Blazor checks it on the way up (verified in the
// browser: the edit dialog closed). Stopping the native event keeps it from
// Blazor's document-level listener altogether, so .NET is told directly.
const KEYS = ["ArrowDown", "ArrowUp", "Enter"];

export function attach(input, dotNetRef) {
    if (!input || input.dataset.comboboxAttached) return;
    input.dataset.comboboxAttached = "true";
    input.addEventListener("keydown", (e) => {
        if (input.getAttribute("aria-expanded") !== "true") return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            dotNetRef.invokeMethodAsync("CloseListFromEscape");
            return;
        }
        if (KEYS.includes(e.key)) e.preventDefault();
    });
}

// Keeps the highlighted option visible inside the scrolling list. Only the
// list's own scrollTop moves: scrollIntoView would also scroll every
// scrollable ancestor (the dialog body), sliding the input away under the
// user's pointer -- seen in the browser, where the next click then landed
// on an option.
export function revealOption(id) {
    const option = document.getElementById(id);
    const list = option?.parentElement;
    if (!option || !list) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
}

// Fits the open list into the space its clipping ancestor (e.g. the
// scrolling dialog body) actually shows: below the input if there's room,
// otherwise above it when that side has more, with the height capped to
// what's visible. Without this the list was cut off at the dialog's edge.
const MAX_LIST_HEIGHT = 240;
const MIN_LIST_HEIGHT = 120;
const GAP = 12;

export function placeList(input, listId) {
    const list = document.getElementById(listId);
    if (!input || !list) return;

    let clip = input.parentElement;
    while (clip && clip !== document.body) {
        const overflow = getComputedStyle(clip).overflowY;
        if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") break;
        clip = clip.parentElement;
    }
    const bounds = clip && clip !== document.body ? clip.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const rect = input.getBoundingClientRect();
    const below = bounds.bottom - rect.bottom - GAP;
    const above = rect.top - bounds.top - GAP;
    const wanted = Math.min(list.scrollHeight, MAX_LIST_HEIGHT);

    const up = below < wanted && above > below;
    list.classList.toggle("opens-up", up);
    list.style.maxHeight = `${Math.max(MIN_LIST_HEIGHT, Math.min(MAX_LIST_HEIGHT, up ? above : below))}px`;
}

