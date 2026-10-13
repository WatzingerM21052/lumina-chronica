// BookSpread's motion: the book flies from its place on the shelf (the
// element with data-spread-key, or a rectangle) to the middle, turning
// from its spine to its cover, then the cover swings open; closing runs it
// back. The shelf's own book is hidden (.is-taken) while it is out.
const BOOK_W = 300, BOOK_H = 440, DEPTH = 22;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const states = new WeakMap();

// On a phone the open book doesn't fit side by side at a readable size: the
// page with title and buttons fills the middle and the cover page, swung
// open to the left, is cut by the screen's edge.
const narrow = () => window.innerWidth < 600;
const shift = () => (narrow() ? 0 : BOOK_W / 2);

function fitScale() {
    const w = narrow() ? (window.innerWidth - 24) / BOOK_W : Math.min(window.innerWidth - 32, 760) / (BOOK_W * 2);
    const h = (window.innerHeight - 140) / BOOK_H;
    return Math.min(narrow() ? 1.15 : 1, w, h);
}

export async function open(root, sourceKey, rect) {
    const fit = root.querySelector(".book-spread-fit");
    const book = root.querySelector(".book-spread-book");
    const cover = root.querySelector(".book-spread-cover");
    const source = sourceKey ? document.querySelector(`[data-spread-key="${CSS.escape(sourceKey)}"]`) : null;
    const from = source?.getBoundingClientRect() ?? rect;
    const scale = fitScale();
    fit.style.transform = `scale(${scale})`;

    // The start pose: at the source, as small as it stood there, spine first.
    const f = fit.getBoundingClientRect();
    const cx = f.left + f.width / 2, cy = f.top + f.height / 2;
    let start = "translate(0, 40px) scale(0.6) rotateY(90deg)";
    if (from && from.width > 0) {
        const dx = (from.left + from.width / 2 - cx) / scale, dy = (from.top + from.height / 2 - cy) / scale;
        const k = Math.max(0.12, from.height / BOOK_H / scale);
        start = `translate(${dx}px, ${dy}px) scale(${k}) rotateY(90deg)`;
    }
    const state = { source, start, book, cover, fit, onResize: () => { fit.style.transform = `scale(${fitScale()})`; } };
    states.set(root, state);
    window.addEventListener("resize", state.onResize);

    source?.classList.add("is-taken");
    requestAnimationFrame(() => root.classList.add("is-open"));
    setTimeout(() => root.querySelector(".book-spread-close")?.focus({ preventScroll: true }), reduce() ? 0 : 900);

    if (reduce()) {
        book.style.transform = `translateX(${shift()}px)`;
        cover.style.transform = `translateZ(${DEPTH}px) rotateY(-178deg)`;
        return;
    }
    // One calm movement: out of the shelf, turning its cover to you.
    await book.animate([
        { transform: start },
        { transform: "translate(0, 0) scale(1) rotateY(0deg)" },
    ], { duration: 700, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).finished;
    if (!states.has(root)) return;
    book.animate([{ transform: "translate(0, 0) scale(1) rotateY(0deg)" }, { transform: `translateX(${shift()}px)` }],
        { duration: 950, easing: "cubic-bezier(.45,.05,.2,1)", fill: "forwards" });
    cover.animate([{ transform: `translateZ(${DEPTH}px) rotateY(0deg)` }, { transform: `translateZ(${DEPTH}px) rotateY(-178deg)` }],
        { duration: 950, easing: "cubic-bezier(.45,.05,.25,1)", fill: "forwards" });
}

export async function close(root) {
    const state = states.get(root);
    if (!state) return;
    states.delete(root);
    window.removeEventListener("resize", state.onResize);
    root.classList.remove("is-open");
    const { book, cover, source, start } = state;
    if (!reduce()) {
        try {
            await Promise.all([
                cover.animate([{ transform: `translateZ(${DEPTH}px) rotateY(-178deg)` }, { transform: `translateZ(${DEPTH}px) rotateY(0deg)` }],
                    { duration: 600, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" }).finished,
                book.animate([{ transform: `translateX(${shift()}px)` }, { transform: "translate(0, 0) scale(1) rotateY(0deg)" }],
                    { duration: 600, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" }).finished,
            ]);
            await book.animate([{ transform: "translate(0, 0) scale(1) rotateY(0deg)" }, { transform: start }],
                { duration: 520, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).finished;
        } catch {
            // Element removed meanwhile.
        }
    }
    source?.classList.remove("is-taken");
    source?.focus?.({ preventScroll: true });
}
