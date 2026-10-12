// The 3D library (LibraryRoom): the interface to Blazor. The scene lives in
// the neighbouring modules; this file only wires them to a container.
import { createScene } from "./scene.js";

const rooms = new WeakMap();

export function supported() {
    try {
        return !!(window.WebGL2RenderingContext && document.createElement("canvas").getContext("webgl2"));
    } catch {
        return false;
    }
}

export async function init(container, dotNet, data, restore) {
    try {
        const room = await createScene(container, dotNet, data, restore);
        rooms.set(container, room);
        room.onRetheme = () => retheme(container, dotNet);
        dotNet.invokeMethodAsync("Ready");
    } catch (error) {
        console.error("[library-room]", error);
        dotNet.invokeMethodAsync("Failed");
    }
}

// The theme changed: build the room again in the new theme's dress.
async function retheme(container, dotNet) {
    const old = rooms.get(container);
    if (!old || old.rebuilding) return;
    old.rebuilding = true;
    const data = old.data;
    const { mode, caseIndex, yaw, pitch } = old.cameraState;
    old.dispose();
    rooms.delete(container);
    await init(container, dotNet, data, { mode, caseIndex, yaw, pitch });
}

export function update(container, data) { rooms.get(container)?.update(data); }
export function focusBook(container, id) { rooms.get(container)?.focusBook(id); }
export function pickBook(container, id) { rooms.get(container)?.pickBook(id); }
export function goTo(container, caseIndex) { rooms.get(container)?.goTo(caseIndex); }
export function goHome(container) { rooms.get(container)?.goHome(); }

export function dispose(container) {
    rooms.get(container)?.dispose();
    rooms.delete(container);
}

// For measurements in browser checks only (not used by the app).
export function inspect(container) { return rooms.get(container); }
