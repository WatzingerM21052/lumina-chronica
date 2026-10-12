// The rotunda shelf style (RotundaShelf): turning the ring of bays by drag,
// wheel, arrow buttons and keys, the lantern that follows the pointer, the
// gilt shine on spines it passes, and naming the bay in front.
const states = new WeakMap();
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function init(room, bayCount, bayWidth) {
    const world = room.querySelector(".rotunda-world");
    const title = room.querySelector(".rotunda-title-text");
    const state = { angle: 0, count: bayCount, bayWidth, drag: null, frame: 0, pointer: null, listeners: [] };
    states.set(room, state);

    const step = () => 360 / state.count;
    const radius = () => state.count * state.bayWidth / (2 * Math.PI);

    const apply = (animate = true) => {
        world.style.transition = animate && !reduceMotion() ? "" : "none";
        world.style.transform = `translateZ(${radius() - 40}px) rotateY(${state.angle}deg)`;
        const front = ((Math.round(state.angle / step()) % state.count) + state.count) % state.count;
        const bay = room.querySelectorAll(".rotunda-bay")[front];
        title.textContent = bay?.dataset.label ?? "";
    };
    state.apply = apply;

    const turn = (bays) => {
        state.angle = Math.round(state.angle / step()) * step() + bays * step();
        apply();
    };

    const on = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        state.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    on(room.querySelector(".rotunda-turn--prev"), "click", () => turn(-1));
    on(room.querySelector(".rotunda-turn--next"), "click", () => turn(1));

    on(room, "wheel", (e) => {
        if (e.target.closest(".rotunda-open")) return;
        e.preventDefault();
        state.angle += (e.deltaY > 0 ? 1 : -1) * step() / 2;
        apply();
    }, { passive: false });

    on(room, "keydown", (e) => {
        if (e.target.closest(".rotunda-open")) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); turn(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); turn(1); }
    });

    // Bays run left to right: bay i stands at -i steps, so the ring turns
    // by +i steps to bring it to the front. Dragging turns the ring; a drag never also counts as a click.
    on(room, "pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".rotunda-open, .rotunda-arrows")) return;
        state.drag = { x: e.clientX, angle: state.angle, moved: false };
    });
    on(window, "pointerup", () => {
        if (state.drag?.moved) apply();
        setTimeout(() => { state.drag = null; }, 0);
    });
    on(room, "click", (e) => {
        if (state.drag?.moved) { e.preventDefault(); e.stopPropagation(); }
    }, { capture: true });

    // Lantern: follows the pointer; spines it passes catch the light.
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
    };
    on(room, "pointermove", (e) => {
        if (state.drag) {
            const dx = e.clientX - state.drag.x;
            if (Math.abs(dx) > 4) state.drag.moved = true;
            state.angle = state.drag.angle - dx * 0.12;
            world.style.transition = "none";
            world.style.transform = `translateZ(${radius() - 40}px) rotateY(${state.angle}deg)`;
        }
        if (e.pointerType === "mouse") {
            state.pointer = { x: e.clientX, y: e.clientY };
            room.classList.add("has-lantern");
            if (!state.frame) state.frame = requestAnimationFrame(light);
        }
    });
    on(room, "pointerleave", () => room.classList.remove("has-lantern"));

    // Keyboard focus on a spine turns its bay to the front.
    on(room, "focusin", (e) => {
        const bay = e.target.closest?.(".rotunda-bay");
        if (!bay || e.target.closest(".rotunda-open")) return;
        const index = [...room.querySelectorAll(".rotunda-bay")].indexOf(bay);
        const target = index * step();
        // the nearest equivalent angle, so focus never spins the ring round
        state.angle = target + Math.round((state.angle - target) / 360) * 360;
        apply();
    });

    apply(false);
}

export function update(room, bayCount) {
    const state = states.get(room);
    if (!state) return;
    state.count = bayCount;
    state.apply(false);
}

export function focusBook(room, bookId) {
    room.querySelector(`.rotunda-spine[data-book-id="${bookId}"]`)?.focus();
}

export function dispose(room) {
    const state = states.get(room);
    if (!state) return;
    state.listeners.forEach((off) => off());
    if (state.frame) cancelAnimationFrame(state.frame);
    states.delete(room);
}
