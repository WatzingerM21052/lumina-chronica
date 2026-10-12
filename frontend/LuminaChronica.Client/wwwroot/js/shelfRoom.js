// Shelf style C "3D-Raum" (ShelfRoom): one tall cabinet as a real WebGL
// scene. The canvas stays in view while the page scrolls past the
// component and scrolling moves the camera down the cabinet; the mouse
// tilts the view a little. Hover slides a book out, a click brings it
// forward with its cover (ShelfRoom.razor shows the card). Wood, brass,
// light and decor come from the theme's --shelf-* tokens.
import * as THREE from "../lib/three/three.module.min.js";

const rooms = new WeakMap();
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Scene units: 1 = 100 px of the classic shelf.
const INNER_WIDTH = 9.6;
const ROW_HEIGHT = 2.7;
const PLANK = 0.12;
const DEPTH = 1.35;
const GAP = 0.03;
const SCROLL_PER_ROW = 230; // px of page scroll per shelf row
const NEAR_ROWS = 3; // rows around the camera whose spine textures exist

export function supported() {
    try {
        const canvas = document.createElement("canvas");
        return !!(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
    } catch {
        return false;
    }
}

export function init(container, dotNet, data) {
    const stage = container.querySelector(".shelf-room-stage");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia("(max-width: 720px)").matches ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    stage.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    const loader = new THREE.TextureLoader();
    const woodMap = loader.load(new URL("../images/library/shelf-wood-texture.webp", import.meta.url).href);
    woodMap.colorSpace = THREE.SRGBColorSpace;
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
    const leatherMap = loader.load(new URL("../images/library/book-leather-texture.webp", import.meta.url).href);
    leatherMap.colorSpace = THREE.SRGBColorSpace;
    leatherMap.wrapS = leatherMap.wrapT = THREE.RepeatWrapping;

    const room = {
        container, stage, dotNet, renderer, scene, camera, woodMap, leatherMap,
        cabinet: null, books: [], rows: [], decor: [], lights: {},
        pointer: new THREE.Vector2(9, 9), mouse: { x: 0, y: 0 }, hovered: null, picked: null, raf: 0, timer: 0, distance: 8,
        camY: 0, camYTarget: 0, top: 0, bottom: 0, visible: true, disposed: false, listeners: [],
        ray: new THREE.Raycaster(), materials: {},
    };
    rooms.set(container, room);

    buildLights(room);
    build(room, data);
    applyTheme(room);

    const on = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        room.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const resize = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Pull back far enough that the whole cabinet width fits.
        const halfWidth = INNER_WIDTH / 2 + 0.9;
        const fitDistance = halfWidth / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.aspect;
        room.distance = Math.max(7.2, fitDistance + DEPTH);
        camera.far = room.distance + 40;
        if (room.scene.fog) { room.scene.fog.near = room.distance + 4; room.scene.fog.far = room.distance + 22; }
        camera.updateProjectionMatrix();
        wake(room);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    room.listeners.push(() => resizeObserver.disconnect());
    resize();

    // Scrolling the page moves the camera from the top shelf to the bottom.
    const onScroll = () => {
        const rect = container.getBoundingClientRect();
        const travel = Math.max(1, container.offsetHeight - stage.offsetHeight);
        const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
        const progress = THREE.MathUtils.clamp((stickyTop - rect.top) / travel, 0, 1);
        room.camYTarget = THREE.MathUtils.lerp(room.top, room.bottom, progress);
        if (reduceMotion()) room.camY = room.camYTarget;
        wake(room);
    };
    on(window, "scroll", onScroll, { passive: true });
    on(window, "resize", onScroll);
    room.onScroll = onScroll;
    onScroll();
    room.camY = room.camYTarget;

    on(stage, "pointermove", (e) => {
        const rect = stage.getBoundingClientRect();
        room.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
        room.mouse.x = room.pointer.x;
        room.mouse.y = room.pointer.y;
        wake(room);
    });
    on(stage, "pointerleave", () => { room.pointer.set(9, 9); wake(room); });
    on(stage, "click", (e) => {
        if (e.target !== renderer.domElement) return;
        if (room.hovered && room.hovered !== room.picked) pick(room, room.hovered);
        else if (room.picked) release(container);
    });

    // Theme switches restyle the scene in place.
    const themeObserver = new MutationObserver(() => applyTheme(room));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    room.listeners.push(() => themeObserver.disconnect());

    // Only animate while the stage is on screen and the tab is visible.
    const io = new IntersectionObserver(([entry]) => { room.visible = entry.isIntersecting; if (room.visible) wake(room); });
    io.observe(stage);
    room.listeners.push(() => io.disconnect());
    on(document, "visibilitychange", () => { if (!document.hidden) wake(room); });

    wake(room);
}

export function update(container, data) {
    const room = rooms.get(container);
    if (!room) return;
    release(container);
    build(room, data);
    applyTheme(room);
    room.onScroll();
    wake(room);
}

export function focusBook(container, id) {
    const room = rooms.get(container);
    if (!room) return;
    const book = room.books.find((b) => b.userData.id === id);
    if (!book) return;
    // Scroll the page so the book's row sits in the middle of the stage.
    const row = book.userData.row;
    const travel = Math.max(1, container.offsetHeight - room.stage.offsetHeight);
    const progress = room.bottom === room.top ? 0 : (book.userData.baseY - room.top) / (room.bottom - room.top);
    const stickyTop = parseFloat(getComputedStyle(room.stage).top) || 0;
    const y = container.getBoundingClientRect().top + window.scrollY - stickyTop + THREE.MathUtils.clamp(progress, 0, 1) * travel;
    window.scrollTo({ top: y, behavior: reduceMotion() ? "auto" : "smooth" });
    room.focused = book;
    ensureRowTextures(room, row);
    wake(room);
}

export function focusLink(container, id) {
    container.querySelector(`.shelf-room-index a[data-book-id="${id}"]`)?.focus({ preventScroll: true });
}

export function pickBook(container, id) {
    const room = rooms.get(container);
    const book = room?.books.find((b) => b.userData.id === id);
    if (book) pick(room, book);
}

export function release(container) {
    const room = rooms.get(container);
    if (!room || !room.picked) return;
    room.picked = null;
    wake(room);
    room.dotNet.invokeMethodAsync("OnReleased");
}

export function dispose(container) {
    const room = rooms.get(container);
    if (!room) return;
    room.disposed = true;
    if (room.raf > 0) cancelAnimationFrame(room.raf);
    clearTimeout(room.timer);
    room.listeners.forEach((off) => off());
    room.scene.traverse((o) => {
        o.geometry?.dispose();
        const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        materials.forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
    room.woodMap.dispose();
    room.leatherMap.dispose();
    room.renderer.dispose();
    room.renderer.domElement.remove();
    rooms.delete(container);
}

// ---------------------------------------------------------------- scene

function buildLights(room) {
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x3a2412, 1.1);
    const key = new THREE.DirectionalLight(0xffe2b8, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 0.5, far: 30 });
    key.shadow.bias = -0.0008;
    const candle = new THREE.PointLight(0xffb060, 9, 10, 1.4);
    room.scene.add(hemi, key, key.target, candle);
    room.lights = { hemi, key, candle };
}

function build(room, data) {
    if (room.cabinet) {
        room.scene.remove(room.cabinet);
        room.cabinet.traverse((o) => {
            o.geometry?.dispose();
            const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
            materials.forEach((m) => { if (m !== room.materials.wood && m !== room.materials.paper && m !== room.materials.brass) { m.map?.dispose(); m.dispose(); } });
        });
    }
    const m = room.materials;
    m.wood ??= new THREE.MeshStandardMaterial({ map: room.woodMap, roughness: 0.62, metalness: 0.04 });
    m.back ??= new THREE.MeshStandardMaterial({ map: room.woodMap, roughness: 0.9 });
    m.paper ??= new THREE.MeshStandardMaterial({ color: 0xe9dcbc, roughness: 0.92 });
    m.brass ??= new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.32, metalness: 0.9 });
    m.ribbon ??= new THREE.MeshStandardMaterial({ color: 0x9a1c26, roughness: 0.6 });

    const cabinet = new THREE.Group();
    room.cabinet = cabinet;
    room.books = [];
    room.rows = [];

    // Lines of books, top to bottom; a compartment starts a new line.
    const lines = [];
    for (const section of data.sections) {
        let line = null;
        for (const book of section.books) {
            const thickness = book.w / 100;
            if (!line || line.used + thickness > INNER_WIDTH - 0.4) {
                line = { section, books: [], used: 0, first: !line };
                lines.push(line);
            }
            line.books.push(book);
            line.used += thickness + GAP;
        }
    }

    const rowCount = Math.max(1, lines.length);
    const height = rowCount * ROW_HEIGHT;
    const box = (w, h, d, material, x, y, z, shadows = true) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = shadows;
        cabinet.add(mesh);
        return mesh;
    };

    // Carcass: back, sides, cornice with a gilt rule, plinth.
    box(INNER_WIDTH + 0.4, height + 0.4, 0.08, m.back, 0, -height / 2, -DEPTH / 2 - 0.04);
    box(0.24, height + 0.6, DEPTH + 0.2, m.wood, -INNER_WIDTH / 2 - 0.12, -height / 2, 0);
    box(0.24, height + 0.6, DEPTH + 0.2, m.wood, INNER_WIDTH / 2 + 0.12, -height / 2, 0);
    box(INNER_WIDTH + 1.0, 0.34, DEPTH + 0.45, m.wood, 0, 0.17, 0.05);
    box(INNER_WIDTH + 0.8, 0.03, 0.02, m.brass, 0, 0.11, DEPTH / 2 + 0.28, false);
    box(INNER_WIDTH + 0.7, 0.3, DEPTH + 0.3, m.wood, 0, -height - 0.3, 0.03);

    lines.forEach((line, index) => {
        const floor = -(index + 1) * ROW_HEIGHT;
        box(INNER_WIDTH, PLANK, DEPTH, m.wood, 0, floor - PLANK / 2, 0);
        const row = { index, floor, books: [], textured: false, label: line.first ? line.section.label : null };
        room.rows.push(row);
        if (line.first) addPlaque(room, cabinet, line.section.label, floor + ROW_HEIGHT - PLANK - 0.14);

        let x = -INNER_WIDTH / 2 + 0.2;
        for (const book of line.books) {
            const w = book.w / 100, h = book.h / 100;
            const cover = new THREE.MeshStandardMaterial({ color: new THREE.Color(book.colour).multiplyScalar(0.85), map: room.leatherMap, roughness: 0.68 });
            const spine = new THREE.MeshStandardMaterial({ color: new THREE.Color(book.colour), roughness: 0.55 });
            // Box faces: +x (front cover), -x, +y, -y, +z (spine), -z.
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH - 0.12), [cover, cover, m.paper, m.paper, spine, m.paper]);
            mesh.position.set(x + w / 2, floor + h / 2, 0.02);
            mesh.castShadow = mesh.receiveShadow = true;
            mesh.userData = { ...book, row: index, base: mesh.position.clone(), baseY: floor + ROW_HEIGHT / 2, out: 0, target: 0, spine, cover };
            if (book.progress != null) {
                const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.01), m.ribbon);
                ribbon.position.set(0, -h / 2 - 0.14, (DEPTH - 0.12) / 2 + 0.01);
                mesh.add(ribbon);
            }
            cabinet.add(mesh);
            room.books.push(mesh);
            row.books.push(mesh);
            x += w + GAP;
        }
    });

    room.scene.add(cabinet);
    room.top = -ROW_HEIGHT * 0.55;
    room.bottom = Math.min(room.top, -(rowCount - 0.5) * ROW_HEIGHT);
    room.height = height;
    room.container.style.setProperty("--shelf-room-travel", `${Math.max(0, rowCount - 1) * SCROLL_PER_ROW}px`);

    addDecor(room);
}

function addPlaque(room, cabinet, label, y) {
    // Plate size first; the texture keeps its proportions so the text
    // isn't stretched.
    const width = Math.min(2.6, 0.8 + label.length * 0.1), height = 0.26;
    const canvas = document.createElement("canvas");
    canvas.height = 96;
    canvas.width = Math.round(96 * width / height);
    const g = canvas.getContext("2d");
    const brass = room.tokens ?? readTokens();
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, brass.brassHi); grad.addColorStop(0.5, brass.brass); grad.addColorStop(1, brass.brassLo);
    g.fillStyle = grad; g.fillRect(0, 0, canvas.width, 96);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 4; g.strokeRect(2, 2, canvas.width - 4, 92);
    g.fillStyle = brass.brassLo;
    [18, canvas.width - 18].forEach((x) => { g.beginPath(); g.arc(x, 48, 7, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = brass.ink; g.font = '600 46px "Cinzel", Georgia, serif'; g.textAlign = "center"; g.textBaseline = "middle";
    const upper = label.toUpperCase();
    let text = upper;
    while (g.measureText(text).width > canvas.width - 70 && text.length > 4) text = text.slice(0, -2);
    if (text !== upper) text += "…";
    g.fillText(text, canvas.width / 2, 52);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03),
        [room.materials.brass, room.materials.brass, room.materials.brass, room.materials.brass, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.55 }), room.materials.brass]);
    plaque.position.set(-INNER_WIDTH / 2 + 0.3 + width / 2, y, DEPTH / 2 + 0.03);
    plaque.userData.plaque = true;
    cabinet.add(plaque);
}

// The theme's two decor pictures stand on the cornice as upright cards.
function addDecor(room) {
    room.decor.forEach((d) => { room.scene.remove(d); d.material.map?.dispose(); d.material.dispose(); d.geometry.dispose(); });
    room.decor = [];
    ["left", "right"].forEach((side, i) => {
        const probe = room.container.querySelector(`.shelf-room-decor-probe.shelf-decor--${side}`);
        if (!probe) return;
        const style = getComputedStyle(probe);
        const match = /url\(["']?([^"')]+)["']?\)/.exec(style.backgroundImage);
        if (!match) return;
        const heightPx = parseFloat(style.height) || 120;
        new THREE.TextureLoader().load(match[1], (texture) => {
            if (room.disposed) { texture.dispose(); return; }
            texture.colorSpace = THREE.SRGBColorSpace;
            const h = heightPx / 100, w = h * texture.image.width / texture.image.height;
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.04, roughness: 0.8 }));
            plane.position.set((i === 0 ? -1 : 1) * (INNER_WIDTH / 2 - 0.2 - w / 2), 0.34 + h / 2, 0.15);
            plane.castShadow = true;
            room.scene.add(plane);
            room.decor.push(plane);
            wake(room);
        });
    });
}

// Spine textures only exist for rows near the camera (big libraries).
function ensureRowTextures(room, rowIndex) {
    room.rows.forEach((row) => {
        const near = Math.abs(row.index - rowIndex) <= NEAR_ROWS;
        if (near && !row.textured) {
            row.books.forEach((book) => {
                const texture = new THREE.CanvasTexture(spineCanvas(book.userData, room.tokens));
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = 4;
                book.userData.spine.map = texture;
                book.userData.spine.color.set(0xffffff);
                book.userData.spine.needsUpdate = true;
            });
            row.textured = true;
        } else if (!near && row.textured && Math.abs(row.index - rowIndex) > NEAR_ROWS * 2) {
            row.books.forEach((book) => {
                book.userData.spine.map?.dispose();
                book.userData.spine.map = null;
                book.userData.spine.color.set(book.userData.colour);
                book.userData.spine.needsUpdate = true;
            });
            row.textured = false;
        }
    });
}

function spineCanvas(book, tokens) {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = book.colour; g.fillRect(0, 0, 64, 256);
    const shade = g.createLinearGradient(0, 0, 64, 0);
    shade.addColorStop(0, "rgba(0,0,0,.55)"); shade.addColorStop(0.3, "rgba(255,240,215,.18)"); shade.addColorStop(0.7, "rgba(0,0,0,.1)"); shade.addColorStop(1, "rgba(0,0,0,.6)");
    g.fillStyle = shade; g.fillRect(0, 0, 64, 256);
    g.strokeStyle = tokens?.brassHi ?? "#f1d995"; g.lineWidth = 1.5;
    [18, 26, 230, 238].forEach((y) => { g.beginPath(); g.moveTo(8, y); g.lineTo(56, y); g.stroke(); });
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(9, 52, 46, 118);
    g.strokeRect(11, 54, 42, 114);
    g.save(); g.translate(32, 111); g.rotate(-Math.PI / 2);
    g.fillStyle = tokens?.brassHi ?? "#f1d995"; g.font = '700 15px "Cormorant Garamond", Georgia, serif'; g.textAlign = "center"; g.textBaseline = "middle";
    let t = book.title;
    while (g.measureText(t).width > 104 && t.length > 3) t = t.slice(0, -2);
    if (t !== book.title) t += "…";
    g.fillText(t, 0, 0); g.restore();
    return c;
}

function coverCanvas(book, tokens) {
    const c = document.createElement("canvas");
    c.width = 384; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = book.colour; g.fillRect(0, 0, 384, 512);
    const glow = g.createRadialGradient(150, 180, 40, 192, 256, 380);
    glow.addColorStop(0, "rgba(255,240,215,.14)"); glow.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = glow; g.fillRect(0, 0, 384, 512);
    g.strokeStyle = tokens?.brassHi ?? "#f1d995"; g.lineWidth = 3; g.strokeRect(22, 22, 340, 468);
    g.lineWidth = 1.2; g.strokeRect(32, 32, 320, 448);
    g.fillStyle = tokens?.brassHi ?? "#f1d995"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '700 34px "Cormorant Garamond", Georgia, serif';
    const words = book.title.split(" "); const lines = []; let line = "";
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 290 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.slice(0, 4).forEach((l, i) => g.fillText(l, 192, 150 + i * 42 - (Math.min(4, lines.length) - 1) * 21));
    if (book.author) { g.font = "600 16px system-ui, sans-serif"; g.fillText(book.author.toUpperCase(), 192, 440); }
    return c;
}

async function pick(room, book) {
    room.picked = book;
    wake(room);
    const data = book.userData;
    if (!data.coverLoaded) {
        data.coverLoaded = true;
        let texture = null;
        try {
            const url = await room.dotNet.invokeMethodAsync("CoverUrl", data.id);
            if (url) texture = await new THREE.TextureLoader().loadAsync(url);
        } catch { texture = null; }
        if (!texture) texture = new THREE.CanvasTexture(coverCanvas(data, room.tokens));
        texture.colorSpace = THREE.SRGBColorSpace;
        const front = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
        book.material = [front, data.cover, room.materials.paper, room.materials.paper, data.spine, room.materials.paper];
        wake(room);
    }
    room.dotNet.invokeMethodAsync("OnPicked", data.id);
}

// ---------------------------------------------------------------- theme

function readTokens() {
    const s = getComputedStyle(document.documentElement);
    const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    return {
        wood: get("--shelf-wood", "#3a2315"),
        brassHi: get("--shelf-brass-hi", "#f1d995"),
        brass: get("--shelf-brass", "#d2ab52"),
        brassLo: get("--shelf-brass-lo", "#9c7428"),
        ink: get("--shelf-plaque-ink", "#2b1a08"),
        light: get("--shelf-light", "rgba(255,190,110,.22)"),
    };
}

function rgb(css) {
    // rgba()/hex -> THREE.Color (alpha dropped)
    const m = /rgba?\(([^)]+)\)/.exec(css);
    if (m) { const [r, g, b] = m[1].split(",").map((v) => parseFloat(v)); return new THREE.Color(r / 255, g / 255, b / 255); }
    return new THREE.Color(css);
}

function applyTheme(room) {
    const tokens = readTokens();
    const themeChanged = room.tokens && JSON.stringify(room.tokens) !== JSON.stringify(tokens);
    room.tokens = tokens;
    const wood = new THREE.Color(tokens.wood);
    // The texture carries the grain; the token tints it (x2.2 keeps it from going muddy).
    room.materials.wood.color.copy(wood).multiplyScalar(2.6);
    room.materials.back.color.copy(wood).multiplyScalar(1.7);
    room.materials.brass.color.set(tokens.brass);
    const light = rgb(tokens.light);
    room.lights.candle.color.copy(light).lerp(new THREE.Color(0xffb060), 0.5);
    room.scene.background = new THREE.Color(tokens.wood).multiplyScalar(0.28);
    // Fog only softens what lies behind the cabinet, wherever the camera is.
    room.scene.fog = new THREE.Fog(room.scene.background, room.distance + 4, room.distance + 22);
    if (themeChanged) {
        room.rows.forEach((row) => {
            if (!row.textured) return;
            row.books.forEach((b) => { b.userData.spine.map?.dispose(); b.userData.spine.map = null; });
            row.textured = false;
        });
        room.cabinet.children.filter((c) => c.userData.plaque).forEach((p) => { room.cabinet.remove(p); p.geometry.dispose(); p.material[4].map.dispose(); p.material[4].dispose(); });
        room.rows.forEach((row) => { if (row.label) addPlaque(room, room.cabinet, row.label, row.floor + ROW_HEIGHT - PLANK - 0.14); });
        addDecor(room);
    }
    if (room.raf !== undefined) wake(room);
}

// ---------------------------------------------------------------- loop

// Something changed: render now (the loop may be idle or throttled).
function wake(room) {
    room.dirty = true;
    if (room.raf === -1) { clearTimeout(room.timer); room.raf = 0; }
    if (!room.raf) loop(room);
}

function loop(room) {
    if (room.disposed || room.raf) return;
    let last = performance.now();
    const frame = (now) => {
        room.raf = 0;
        if (room.disposed || !room.visible || document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const still = reduceMotion();
        const { camera, lights } = room;

        // camera: follows scroll, leans a little towards the mouse
        room.camY += (room.camYTarget - room.camY) * (still ? 1 : Math.min(1, dt * 6));
        const mx = room.pointer.x > 2 ? 0 : room.mouse.x, my = room.pointer.x > 2 ? 0 : room.mouse.y;
        const tx = still ? 0 : mx * 0.6, ty = still ? 0 : my * 0.25;
        camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 4);
        camera.position.y = room.camY + 0.35 + ty;
        camera.position.z = room.distance;
        camera.lookAt(0, room.camY, 0);

        lights.key.position.set(-4, room.camY + 4, 6);
        lights.key.target.position.set(0, room.camY - 0.5, 0);
        lights.candle.position.set(INNER_WIDTH / 2 - 0.6, room.camY + 1.4, 1.6);
        if (!still) {
            const t = now / 1000;
            lights.candle.intensity = 8.2 + Math.sin(t * 11) * 0.8 + Math.sin(t * 27) * 0.5 + Math.sin(t * 53) * 0.3;
        }

        ensureRowTextures(room, Math.round(-room.camY / ROW_HEIGHT - 0.5));

        // hover: ray from the pointer
        room.ray.setFromCamera(room.pointer, camera);
        const hit = room.pointer.x > 2 ? null : room.ray.intersectObjects(room.books, false)[0];
        const hovered = hit ? hit.object : null;
        if (hovered !== room.hovered) { room.hovered = hovered; room.stage.style.cursor = hovered ? "pointer" : ""; }

        let moving = false;
        for (const book of room.books) {
            const u = book.userData;
            u.target = book === room.picked ? 2 : (book === room.hovered || book === room.focused) ? 1 : 0;
            if (Math.abs(u.target - u.out) < 0.001) { u.out = u.target; } else { u.out += (u.target - u.out) * (still ? 1 : Math.min(1, dt * 7)); moving = true; }
            if (u.out === 0 && book.position.equals(u.base) && book.rotation.y === 0) continue;
            const o = u.out, slide = Math.min(o, 1), fly = Math.max(0, o - 1);
            // A picked book stands about 5 units before the camera -- whole
            // in view, left of the card on wide stages, higher on phones.
            const wide = camera.aspect > 1.2;
            book.position.set(
                u.base.x + (camera.position.x + (wide ? -1.4 : 0) - u.base.x) * fly,
                u.base.y + slide * 0.08 + (room.camY + (wide ? 0.25 : 1.1) - u.base.y) * fly,
                u.base.z + slide * 0.35 + (room.distance - (wide ? 5.4 : 8.5) - u.base.z) * fly);
            book.rotation.y = -slide * 0.3 - (Math.PI / 2 - 0.3) * fly;
        }

        const settled = !moving && Math.abs(room.camYTarget - room.camY) < 0.001 && Math.abs(tx - camera.position.x) < 0.001;
        room.renderer.render(room.scene, camera);
        room.dirty = false;
        // Full speed while something moves; 20 fps for the candle alone;
        // nothing at all with reduced motion until wake().
        if (!settled) room.raf = requestAnimationFrame(frame);
        else if (!still) { room.raf = -1; room.timer = setTimeout(() => { room.raf = requestAnimationFrame(frame); }, 50); }
    };
    room.raf = requestAnimationFrame(frame);
}
