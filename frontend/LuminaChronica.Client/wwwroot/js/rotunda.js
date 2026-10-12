// The rotunda shelf style (RotundaShelf): turning the bays by drag, wheel,
// arrow buttons, keys or the bay list -- a full ring, or an arc that stops
// at its ends -- the warm light that follows the pointer, the gilt shine on
// spines it passes, a title hint over the spine under the pointer, and the
// name of the bay in front.
const states = new WeakMap();
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function init(room, bayCount, bayWidth, step, start, partial) {
    dispose(room);
    const world = room.querySelector(".rotunda-world");
    const title = room.querySelector(".rotunda-title-text");
    const tip = room.querySelector(".rotunda-tip");
    const radius = bayWidth / (2 * Math.sin(step * Math.PI / 360));
    const state = { index: start, drag: null, frame: 0, pointer: null, listeners: [] };
    states.set(room, state);

    const bays = () => [...room.querySelectorAll(".rotunda-bay")];
    const clamp = (i) => partial ? Math.max(0, Math.min(bayCount - 1, i)) : ((i % bayCount) + bayCount) % bayCount;

    // Bay i stands at -i steps; the world turns by +angle to bring it front.
    state.angle = start * step;
    const show = (animate = true) => {
        world.style.transition = animate && !reduceMotion() ? "" : "none";
        world.style.transform = `translateZ(${radius - 40}px) rotateY(${state.angle}deg)`;
        const front = clamp(Math.round(state.angle / step));
        state.index = front;
        const bay = bays()[front];
        title.textContent = bay ? `${bay.dataset.label} · ${front + 1} / ${bayCount}` : "";
        // the bay list marks the compartment in front
        let current = front;
        while (current > 0 && !room.querySelector(`.rotunda-nav-item[data-index="${current}"]`)) current--;
        room.querySelectorAll(".rotunda-nav-item").forEach((b) => b.classList.toggle("is-active", +b.dataset.index === current));
    };
    const turnTo = (i) => {
        const target = clamp(i);
        // the nearest equivalent angle, so a ring never spins round
        const want = target * step;
        state.angle = partial ? want : want + Math.round((state.angle - want) / 360) * 360;
        show();
    };
    const turn = (d) => turnTo(Math.round(state.angle / step) + d);

    const on = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        state.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    on(room.querySelector(".rotunda-turn--prev"), "click", () => turn(-1));
    on(room.querySelector(".rotunda-turn--next"), "click", () => turn(1));
    on(room.querySelector(".rotunda-nav"), "click", (e) => {
        const item = e.target.closest(".rotunda-nav-item");
        if (item) turnTo(+item.dataset.index);
    });

    on(room, "wheel", (e) => {
        if (e.target.closest(".rotunda-ui")) return;
        e.preventDefault();
        turn(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    on(room, "keydown", (e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); turn(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); turn(1); }
    });

    // Dragging turns; a drag never also counts as a click.
    on(room, "pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".rotunda-ui")) return;
        state.drag = { x: e.clientX, angle: state.angle, moved: false };
    });
    on(window, "pointerup", () => {
        if (state.drag?.moved) turnTo(Math.round(state.angle / step));
        setTimeout(() => { state.drag = null; }, 0);
    });
    on(room, "click", (e) => {
        if (state.drag?.moved) { e.preventDefault(); e.stopPropagation(); }
    }, { capture: true });

    // Lantern and shine follow the pointer; the hint names the spine under it.
    const light = () => {
        state.frame = 0;
        const p = state.pointer;
        if (!p) return;
        const rect = room.getBoundingClientRect();
        room.style.setProperty("--mx", `${p.x - rect.left}px`);
        room.style.setProperty("--my", `${p.y - rect.top}px`);
        const spine = document.elementFromPoint(p.x, p.y)?.closest(".rotunda-spine");
        if (spine && !spine.classList.contains("is-lit") && !reduceMotion()) {
            spine.classList.add("is-lit");
            setTimeout(() => spine.classList.remove("is-lit"), 1500);
        }
        if (spine && !state.drag) {
            const r = spine.getBoundingClientRect();
            tip.querySelector("strong").textContent = spine.dataset.title || "";
            tip.querySelector("span").textContent = spine.dataset.author || "";
            tip.style.left = `${r.left + r.width / 2 - rect.left}px`;
            tip.style.top = `${r.top - rect.top}px`;
            tip.classList.add("is-shown");
        } else {
            tip.classList.remove("is-shown");
        }
    };
    on(room, "pointermove", (e) => {
        if (state.drag) {
            const dx = e.clientX - state.drag.x;
            if (Math.abs(dx) > 4) state.drag.moved = true;
            let angle = state.drag.angle - dx * 0.12;
            if (partial) angle = Math.max(0, Math.min((bayCount - 1) * step, angle));
            state.angle = angle;
            world.style.transition = "none";
            world.style.transform = `translateZ(${radius - 40}px) rotateY(${state.angle}deg)`;
        }
        // Over the controls the light rests.
        if (e.target.closest(".rotunda-ui")) {
            room.classList.remove("has-lantern");
            tip.classList.remove("is-shown");
            return;
        }
        if (e.pointerType === "mouse") {
            state.pointer = { x: e.clientX, y: e.clientY };
            room.classList.add("has-lantern");
            if (!state.frame) state.frame = requestAnimationFrame(light);
        }
    });
    on(room, "pointerleave", () => { room.classList.remove("has-lantern"); tip.classList.remove("is-shown"); });

    // Keyboard focus on a spine turns its bay to the front.
    on(room, "focusin", (e) => {
        const bay = e.target.closest?.(".rotunda-bay");
        if (bay) turnTo(bays().indexOf(bay));
    });

    show(false);
}

export function dispose(room) {
    const state = states.get(room);
    if (!state) return;
    state.listeners.forEach((off) => off());
    if (state.frame) cancelAnimationFrame(state.frame);
    states.delete(room);
}
