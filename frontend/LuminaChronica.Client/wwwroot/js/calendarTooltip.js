// Lesekalender tooltip (theme studio): one tooltip per card, filled from
// the hovered/focused cell's data-* attributes. Hover shows it, a tap or
// click pins it, the arrow keys walk the days (up/down = day, left/right =
// week) and Escape closes it. It lives in the card, outside the swipeable
// .calendar-scroll, and is clamped to the card's edges.
export function init(card) {
    // `card` is any positioned box around the calendar (.reading-calendar).

    if (!card || card.__calendarTooltip) return;

    const heatmap = card.querySelector(".calendar-heatmap");
    const tip = card.querySelector(".calendar-tooltip");
    if (!heatmap || !tip) return;

    const days = () => [...heatmap.querySelectorAll(".calendar-cell[data-date]")];
    let selected = null;
    let pinned = false;

    function show(cell) {
        if (!cell) return;
        selected = cell;
        days().forEach((c) => c.classList.toggle("is-selected", c === cell));

        tip.replaceChildren();
        const title = document.createElement("b");
        title.textContent = cell.dataset.date;
        tip.append(title);
        if (cell.dataset.main) {
            const main = document.createElement("span");
            main.textContent = cell.dataset.main;
            tip.append(main);
        }
        if (cell.dataset.books) {
            const books = document.createElement("small");
            books.textContent = cell.dataset.books;
            tip.append(books);
        }

        tip.hidden = false;
        tip.classList.add("is-shown");
        const cardRect = card.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        const margin = 8;
        const half = tip.offsetWidth / 2;
        let x = cellRect.left - cardRect.left + cellRect.width / 2;
        x = Math.max(half + margin, Math.min(cardRect.width - half - margin, x));
        let y = cellRect.top - cardRect.top - tip.offsetHeight - 8;
        if (y < margin) y = cellRect.bottom - cardRect.top + 8;
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
    }

    function hide() {
        if (pinned) return;
        tip.classList.remove("is-shown");
        days().forEach((c) => c.classList.remove("is-selected"));
    }

    const onOver = (e) => {
        const cell = e.target.closest(".calendar-cell[data-date]");
        if (cell) show(cell);
    };
    const onLeave = () => hide();
    const onClick = (e) => {
        const cell = e.target.closest(".calendar-cell[data-date]");
        if (!cell) return;
        pinned = true;
        show(cell);
    };
    const onFocus = () => {
        const all = days();
        show(selected && all.includes(selected) ? selected : all[all.length - 1]);
    };
    const onBlur = () => {
        pinned = false;
        hide();
    };
    const onKey = (e) => {
        const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
        if (step === undefined) {
            if (e.key === "Escape") {
                pinned = false;
                hide();
            }
            return;
        }
        e.preventDefault();
        const all = days();
        if (all.length === 0) return;
        const index = Math.max(0, Math.min(all.length - 1, (selected ? all.indexOf(selected) : all.length - 1) + step));
        pinned = true;
        show(all[index]);
        all[index].scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    const onScroll = () => {
        if (!tip.hidden && selected) show(selected);
    };

    heatmap.addEventListener("pointerover", onOver);
    heatmap.addEventListener("pointerleave", onLeave);
    heatmap.addEventListener("click", onClick);
    heatmap.addEventListener("focus", onFocus);
    heatmap.addEventListener("blur", onBlur);
    heatmap.addEventListener("keydown", onKey);
    const scroller = card.querySelector(".calendar-scroll");
    scroller?.addEventListener("scroll", onScroll, { passive: true });

    card.__calendarTooltip = () => {
        heatmap.removeEventListener("pointerover", onOver);
        heatmap.removeEventListener("pointerleave", onLeave);
        heatmap.removeEventListener("click", onClick);
        heatmap.removeEventListener("focus", onFocus);
        heatmap.removeEventListener("blur", onBlur);
        heatmap.removeEventListener("keydown", onKey);
        scroller?.removeEventListener("scroll", onScroll);
    };
}

export function dispose(card) {
    card?.__calendarTooltip?.();
    if (card) delete card.__calendarTooltip;
}
