import * as THREE from "../../lib/three/three.module.min.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const EYE = 1.62;

// The guided camera (spec 2026-10-12 library-room §4): it stands in the
// middle and turns freely; a case (clicked, or chosen in the list) brings it
// in front of that case in about a second, along an arc round the table;
// there one looks around a little and steps closer or back. "Back to the
// centre" (button, Esc) returns. Dragging never counts as a click.
export function attachCamera(room) {
    const { camera, container } = room;
    const state = {
        mode: "home",          // "home" | "case"
        caseIndex: -1,
        yaw: 0, pitch: -0.04,  // home: where one looks
        offYaw: 0, offPitch: 0, distance: 2.75, // case: looking around
        tween: null,
    };
    const target = new THREE.Vector3();

    const floorY = (tier) => room.architecture.floorY(tier);
    const homePose = () => {
        const pos = new THREE.Vector3(0, EYE, 0.9);
        const dir = new THREE.Vector3(Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
        return { pos, look: pos.clone().add(dir.multiplyScalar(5)) };
    };
    const casePose = (entry) => {
        const look = entry.center.clone();
        look.y = floorY(entry.tier) + 1.36;
        const n = entry.normal.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), state.offYaw);
        const pos = look.clone().addScaledVector(n, state.distance);
        pos.y = floorY(entry.tier) + EYE - 0.12 + Math.sin(state.offPitch) * state.distance;
        return { pos, look };
    };
    const pose = () => (state.mode === "case" ? casePose(room.cases[state.caseIndex]) : homePose());
    const apply = (p) => { camera.position.copy(p.pos); target.copy(p.look); camera.lookAt(target); };

    // A move from where we are to `to`, bending round the middle so the
    // camera never passes through the table or a case.
    const fly = (to, done) => {
        const from = { pos: camera.position.clone(), look: target.clone() };
        if (reduceMotion()) { apply(to); done?.(); room.wake(); return; }
        const via = from.pos.clone().add(to.pos).multiplyScalar(0.5);
        const r = Math.hypot(via.x, via.z);
        if (r < 2.2) { const k = r > 0.01 ? 2.2 / r : 0; via.x *= k; via.z *= k; if (k === 0) via.z = 2.2; }
        state.tween = { from, to, via, t: 0, duration: 1.05, done };
        room.wake(1200);
    };

    room.goTo = (index) => {
        const entry = room.cases[index];
        if (!entry) return;
        // a continued case: go to the first case of its compartment's run
        state.mode = "case";
        state.caseIndex = index;
        state.offYaw = 0; state.offPitch = 0; state.distance = 2.75;
        fly(casePose(entry), () => room.dotNet.invokeMethodAsync("CaseChanged", index));
    };
    room.goHome = () => {
        if (state.mode === "home") return;
        const from = room.cases[state.caseIndex];
        state.mode = "home";
        state.caseIndex = -1;
        // keep facing the case one comes from
        if (from) state.yaw = from.angle;
        state.pitch = -0.04;
        fly(homePose(), () => room.dotNet.invokeMethodAsync("CaseChanged", -1));
    };
    room.cameraState = state;

    // Drag to look around (pointer capture so it keeps working off-canvas).
    let drag = null;
    room.on(container, "pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".library-room-ui, .library-room-index")) return;
        drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch, offYaw: state.offYaw, offPitch: state.offPitch, moved: false };
        room.dragged = false;
    });
    room.on(window, "pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; room.dragging = true; }
        if (!drag.moved) return;
        if (state.mode === "home") {
            state.yaw = drag.yaw - dx * 0.0042;
            state.pitch = THREE.MathUtils.clamp(drag.pitch + dy * 0.0035, -0.35, 0.62);
        } else {
            state.offYaw = THREE.MathUtils.clamp(drag.offYaw - dx * 0.0032, -0.44, 0.44);
            state.offPitch = THREE.MathUtils.clamp(drag.offPitch + dy * 0.0028, -0.21, 0.21);
        }
        if (!state.tween) apply(pose());
        room.wake(100);
    });
    room.on(window, "pointerup", () => {
        if (!drag) return;
        room.dragged = drag.moved;
        drag = null;
        room.dragging = false;
        // the click after a drag is swallowed in pick.js, then reset
        setTimeout(() => { room.dragged = false; }, 0);
    });

    // Wheel / pinch: closer or further -- only in front of a case; in the
    // middle the page scrolls as usual.
    room.on(container, "wheel", (e) => {
        if (state.mode !== "case" || e.target.closest(".library-room-ui")) return;
        e.preventDefault();
        state.distance = THREE.MathUtils.clamp(state.distance + e.deltaY * 0.0015, 1.2, 3.4);
        if (!state.tween) apply(pose());
        room.wake(100);
    }, { passive: false });

    // Keys on the room: ← → next/previous case, Esc back to the middle.
    container.tabIndex = 0;
    room.on(container, "keydown", (e) => {
        if (e.target.closest("a, button")) return;
        if (e.key === "Escape" && !document.querySelector(".book-spread")) { room.goHome(); }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const n = room.cases.length;
            if (!n) return;
            const i = state.mode === "case" ? state.caseIndex : -1;
            room.goTo(((e.key === "ArrowRight" ? i + 1 : i - 1) + n) % n);
        }
    });
    room.on(document, "keydown", (e) => {
        if (e.key === "Escape" && state.mode === "case" && container.contains(document.activeElement) && !document.querySelector(".book-spread")) room.goHome();
    });

    room.onFrame((now, dt) => {
        const tw = state.tween;
        if (!tw) return false;
        tw.t = Math.min(1, tw.t + dt / tw.duration);
        const k = ease(tw.t);
        // quadratic bezier through `via` for the position, straight for the look
        const a = tw.from.pos.clone().lerp(tw.via, k), b = tw.via.clone().lerp(tw.to.pos, k);
        camera.position.copy(a.lerp(b, k));
        target.copy(tw.from.look).lerp(tw.to.look, k);
        camera.lookAt(target);
        if (tw.t >= 1) { state.tween = null; apply(tw.to); tw.done?.(); }
        return true;
    });

    apply(homePose());
}
