import * as THREE from "../../lib/three/three.module.min.js";
import { chooseQuality, watchFps } from "./quality.js";
import { readTheme } from "./theme.js";
import { createAssets } from "./assets.js";
import { buildRotunda } from "./rotunda.js";
import { buildCase, caseMaterials, setSpineTextures } from "./shelf.js";
import { attachPicking } from "./pick.js";
import { attachCamera } from "./camera.js";
import { attachLighting } from "./lighting.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The room: renderer, camera and a render loop that only runs while
// something changes (the candles keep a throttled 20 fps; nothing at all
// with reduced motion), plus resizing, visibility and theme changes. The
// other modules hook in through room.onFrame and the room's methods.
export async function createScene(container, dotNet, data, restore) {
    const stage = container.querySelector(".library-room-stage");
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const quality = chooseQuality(renderer);
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = quality.shadowLights > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 80);
    const frameHooks = new Set();
    let last = performance.now();
    const listeners = [];
    const room = {
        container, stage, dotNet, data, restore, renderer, scene, camera, quality,
        theme: readTheme(), assets: createAssets(renderer), visible: true, disposed: false,
        raf: 0, timer: 0, busyUntil: 0,
        onFrame: (fn) => { frameHooks.add(fn); return () => frameHooks.delete(fn); },
        // Something changed: render now, and at full rate for `ms`.
        wake: (ms = 0) => { room.busyUntil = Math.max(room.busyUntil, performance.now() + ms); schedule(); },
        addCleanup: (fn) => listeners.push(fn),
        on: (target, type, fn, options) => {
            target.addEventListener(type, fn, options);
            listeners.push(() => target.removeEventListener(type, fn, options));
        },
    };

    // Image-based light from the theme's HDRI; the background stays dark --
    // the room itself is everything one sees.
    scene.environment = await room.assets.environment(room.theme.hdri);
    scene.background = new THREE.Color(room.theme.wood).multiplyScalar(0.12);
    room.base = new THREE.HemisphereLight(0xfff1dc, 0x2a1a10, 0.35);
    scene.add(room.base);

    room.architecture = await buildRotunda(room, data);
    scene.add(room.architecture.group);

    // The bookcases; spine textures only near the camera.
    room.materials = await caseMaterials(room);
    const buildCases = async (d) => {
        room.cases = await Promise.all(d.cases.map((c) => buildCase(room, c, room.materials)));
        room.cases.forEach((c) => scene.add(c.group));
    };
    await buildCases(data);
    room.books = () => room.cases.flatMap((c) => c.books);
    let lastSpineCheck = 0;
    const spineCheck = (now) => {
        if (now - lastSpineCheck < 400) return;
        lastSpineCheck = now;
        for (const c of room.cases) setSpineTextures(c, c.center.distanceTo(camera.position) < 5.2, room.theme);
    };
    room.onFrame(spineCheck);
    room.rebuild = async (next) => {
        for (const c of room.cases) {
            scene.remove(c.group);
            c.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => { if (!Object.values(room.materials).includes(m)) { m.map?.dispose(); m.dispose(); } }); } });
        }
        await buildCases(next);
        lastSpineCheck = 0;
        room.wake(300);
    };
    attachPicking(room, room.books);

    const resize = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        room.wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    listeners.push(() => ro.disconnect());
    resize();

    const io = new IntersectionObserver(([e]) => { room.visible = e.isIntersecting; if (room.visible) room.wake(); });
    io.observe(container);
    listeners.push(() => io.disconnect());
    room.on(document, "visibilitychange", () => { if (!document.hidden) room.wake(); });

    // A new theme rebuilds the room in its dress (index.js).
    const themeObserver = new MutationObserver(() => { if (readTheme().key !== room.theme.key) room.onRetheme?.(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    listeners.push(() => themeObserver.disconnect());

    watchFps(room, (next) => {
        room.quality = next;
        renderer.setPixelRatio(next.pixelRatio);
        room.applyQuality?.(next);
        resize();
    });

    function frame(now) {
        room.raf = 0;
        if (room.disposed || !room.visible || document.hidden) return;
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        let moving = false;
        for (const hook of frameHooks) moving = hook(now, dt) === true || moving;
        renderer.render(scene, camera);
        if (moving || now < room.busyUntil) room.raf = requestAnimationFrame(frame);
        else if (!reduceMotion()) { room.raf = -1; room.timer = setTimeout(() => { room.raf = requestAnimationFrame(frame); }, 50); }
    }
    function schedule() {
        if (room.disposed) return;
        if (room.raf === -1) { clearTimeout(room.timer); room.raf = 0; }
        if (!room.raf) { last = performance.now(); room.raf = requestAnimationFrame(frame); }
    }

    room.update = (next) => { room.data = next; room.rebuild?.(next); room.wake(); };
    room.dispose = () => {
        room.disposed = true;
        if (room.raf > 0) cancelAnimationFrame(room.raf);
        clearTimeout(room.timer);
        listeners.forEach((off) => off());
        scene.traverse((o) => {
            o.geometry?.dispose();
            [].concat(o.material ?? []).forEach((m) => m.dispose());
        });
        room.assets.dispose();
        renderer.dispose();
        renderer.domElement.remove();
    };
    // Filled in by shelf/pick/camera/lighting.
    attachCamera(room);
    await attachLighting(room);
    // Keyboard focus on a book in the list: walk to its case, lift it out.
    room.focusBook = (id) => {
        const entry = room.cases.find((c) => c.books.some((b) => b.userData.id === id));
        room.focusedId = id;
        if (entry && room.cameraState.caseIndex !== entry.index) room.goTo(entry.index);
        room.wake(600);
    };

    room.wake(800);
    return room;
}
