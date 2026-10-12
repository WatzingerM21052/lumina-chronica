import * as THREE from "../../lib/three/three.module.min.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hover tips a book out by its top (foot stays on the board) and names it;
// a click (or the second tap on touch) takes it out and opens it.
export function attachPicking(room, getBooks) {
    const ray = new THREE.Raycaster();
    const tip = room.container.querySelector(".library-room-tip");
    let pointer = null, armed = null;
    room.hovered = null;
    room.takenId = null;

    const ndc = (x, y) => {
        const r = room.renderer.domElement.getBoundingClientRect();
        return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    };
    const hit = (x, y) => {
        ray.setFromCamera(ndc(x, y), room.camera);
        return ray.intersectObjects(getBooks().filter((b) => b.visible), false)[0]?.object ?? null;
    };
    const showTip = (book) => {
        if (!book) { tip.classList.remove("is-shown"); return; }
        const box = new THREE.Box3().setFromObject(book);
        const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(room.camera);
        const r = room.renderer.domElement.getBoundingClientRect(), c = room.container.getBoundingClientRect();
        tip.querySelector("strong").textContent = book.userData.title;
        tip.querySelector("span").textContent = book.userData.author ?? "";
        tip.style.left = `${r.left - c.left + (top.x + 1) / 2 * r.width}px`;
        tip.style.top = `${r.top - c.top + (1 - top.y) / 2 * r.height - 8}px`;
        tip.classList.add("is-shown");
    };
    const setHovered = (book) => {
        if (book === room.hovered) return;
        room.hovered = book;
        room.container.style.cursor = book ? "pointer" : "";
        showTip(book);
        room.wake(600);
    };

    room.on(room.container, "pointermove", (e) => {
        if (e.pointerType !== "mouse" || room.dragging) return;
        pointer = { x: e.clientX, y: e.clientY };
        setHovered(hit(e.clientX, e.clientY));
    });
    room.on(room.container, "pointerleave", () => { pointer = null; setHovered(null); });
    room.on(room.container, "click", (e) => {
        if (room.dragged || e.target.closest(".library-room-ui, .library-room-index")) return;
        const book = hit(e.clientX, e.clientY);
        if (!book) return;
        // touch: first tap shows it, the second opens it
        if (e.pointerType === "touch" && armed !== book) { armed = book; setHovered(book); return; }
        room.pickBook(book.userData.id);
    });

    room.pickBook = (id) => {
        const book = getBooks().find((b) => b.userData.id === id);
        if (!book) return;
        const box = new THREE.Box3().setFromObject(book);
        const r = room.renderer.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(), xs = [], ys = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            v.set(x, y, z).project(room.camera);
            xs.push(r.left + (v.x + 1) / 2 * r.width);
            ys.push(r.top + (1 - v.y) / 2 * r.height);
        }
        const left = Math.min(...xs), top = Math.min(...ys);
        room.takenId = id;
        setHovered(null);
        room.wake(300);
        room.dotNet.invokeMethodAsync("Open", id, left, top, Math.max(...xs) - left, Math.max(...ys) - top);
    };

    // The taken book comes back when the spread closes.
    const spreadObserver = new MutationObserver(() => {
        if (room.takenId !== null && !document.querySelector(".book-spread")) { room.takenId = null; room.wake(300); }
    });
    spreadObserver.observe(document.body, { childList: true, subtree: true });
    room.addCleanup(() => spreadObserver.disconnect());

    room.onFrame((now, dt) => {
        let moving = false;
        for (const book of getBooks()) {
            const u = book.userData;
            book.visible = u.id !== room.takenId;
            const target = book === room.hovered || u.id === room.focusedId ? 1 : 0;
            if (Math.abs(target - u.out) < 0.002) u.out = target;
            else { u.out += (target - u.out) * (reduceMotion() ? 1 : Math.min(1, dt * 10)); moving = true; }
            book.rotation.x = u.recent ? u.lean * (1 - u.out) : u.out * 0.2;
        }
        if (room.hovered && moving) showTip(room.hovered);
        return moving;
    });
}
