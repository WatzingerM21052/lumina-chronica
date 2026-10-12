// Shelf style C "3D-Raum" (ShelfRoom, polish 2026-10-12): one cabinet as a
// real WebGL scene that stands on the page like any other element. The
// canvas is transparent and stays in view (sticky) while the camera shows
// exactly the part of the cabinet that lies under it on the page -- so the
// cabinet scrolls 1:1 with the page, without a frame and without tilting.
// Hover slides a book out; a click asks .NET to open it (BookSpread) from
// where it stands on screen. Wood, brass, light, decor and objects come
// from the theme.
import * as THREE from "../lib/three/three.module.min.js";

const rooms = new WeakMap();
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Scene units: 1 = 100 px of the classic shelf at full width; the page
// scale (room.px) fits the cabinet to the column.
const FRAME = 1.4; // posts and cornice overhang, both sides
const ROW_HEIGHT = 2.7;
const PLANK = 0.12;
const DEPTH = 1.35;
const GAP = 0.03;
const GROUP_GAP = 0.44;
const TOP_ROOM = 1.9; // above the cornice, for the decor
const FRONT = DEPTH / 2; // the plane that maps 1:1 to the page
const NEAR_ROWS = 4; // rows around the view whose spine textures exist

export function supported() {
    try {
        return !!(window.WebGL2RenderingContext && document.createElement("canvas").getContext("webgl2"));
    } catch {
        return false;
    }
}

export function init(container, dotNet, data) {
    const stage = container.querySelector(".shelf-room-stage");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    const woodMap = loader.load(new URL("../images/library/shelf-wood-texture.webp", import.meta.url).href);
    woodMap.colorSpace = THREE.SRGBColorSpace;
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
    const leatherMap = loader.load(new URL("../images/library/book-leather-texture.webp", import.meta.url).href);
    leatherMap.colorSpace = THREE.SRGBColorSpace;
    leatherMap.wrapS = leatherMap.wrapT = THREE.RepeatWrapping;

    const room = {
        container, stage, dotNet, renderer, woodMap, leatherMap, data,
        scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(30, 1, 0.1, 200),
        cabinet: null, books: [], rows: [], props: [], lights: {}, materials: {},
        inner: 10.4, px: 100, height: 0, pointer: null, hovered: null, focused: null, takenId: null,
        raf: 0, timer: 0, visible: true, disposed: false, listeners: [], ray: new THREE.Raycaster(),
    };
    rooms.set(container, room);

    buildLights(room);
    applyTheme(room, false);
    layout(room);
    build(room);

    const on = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        room.listeners.push(() => target.removeEventListener(type, handler, options));
    };

    const ro = new ResizeObserver(() => {
        if (layout(room)) build(room);
        sizeContainer(room);
        wake(room);
    });
    ro.observe(container);
    room.listeners.push(() => ro.disconnect());
    sizeContainer(room);

    on(window, "scroll", () => wake(room), { passive: true });
    on(window, "resize", () => wake(room));
    on(container, "pointermove", (e) => { room.pointer = { x: e.clientX, y: e.clientY }; wake(room); });
    on(container, "pointerleave", () => { room.pointer = null; wake(room); });
    on(container, "click", (e) => {
        if (e.target.closest(".shelf-room-index")) return;
        if (room.hovered) pick(room, room.hovered);
    });

    // The theme restyles the scene in place.
    const themeObserver = new MutationObserver(() => { applyTheme(room, true); wake(room); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    room.listeners.push(() => themeObserver.disconnect());

    // A taken book is out while the spread is open and returns with it.
    const spreadObserver = new MutationObserver(() => {
        if (room.takenId !== null && !document.querySelector(".book-spread")) {
            room.takenId = null;
            wake(room);
        }
    });
    spreadObserver.observe(document.body, { childList: true, subtree: true });
    room.listeners.push(() => spreadObserver.disconnect());

    const io = new IntersectionObserver(([entry]) => { room.visible = entry.isIntersecting; if (room.visible) wake(room); });
    io.observe(container);
    room.listeners.push(() => io.disconnect());
    on(document, "visibilitychange", () => { if (!document.hidden) wake(room); });

    wake(room);
}

export function update(container, data) {
    const room = rooms.get(container);
    if (!room) return;
    room.data = data;
    room.focused = null;
    build(room);
    sizeContainer(room);
    wake(room);
}

export function focusBook(container, id) {
    const room = rooms.get(container);
    const book = room?.books.find((b) => b.userData.id === id);
    if (!book) return;
    room.focused = book;
    // Bring its row into the middle of the window.
    const r = container.getBoundingClientRect();
    const y = r.top + window.scrollY + (TOP_ROOM - book.userData.base.y - book.userData.height / 2) * room.px - window.innerHeight / 2;
    window.scrollTo({ top: y, behavior: reduceMotion() ? "auto" : "smooth" });
    wake(room);
}

export function pickBook(container, id) {
    const room = rooms.get(container);
    const book = room?.books.find((b) => b.userData.id === id);
    if (book) pick(room, book);
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
        materials.forEach((m) => { if (m.map !== room.woodMap && m.map !== room.leatherMap) m.map?.dispose(); m.dispose(); });
    });
    room.woodMap.dispose();
    room.leatherMap.dispose();
    room.renderer.dispose();
    room.renderer.domElement.remove();
    container.style.height = "";
    rooms.delete(container);
}

// ---------------------------------------------------------------- layout

// The cabinet keeps books at a readable size: full width (10.4 units) on a
// wide column, fewer units on a phone. True if the width changed.
function layout(room) {
    const width = room.container.clientWidth || 1000;
    const target = width < 720 ? 62 : 100; // px per unit wanted
    const inner = Math.max(3.4, Math.min(10.4, width / target - FRAME));
    room.px = width / (inner + FRAME);
    if (Math.abs(inner - room.inner) < 0.01 && room.cabinet) return false;
    room.inner = inner;
    return true;
}

function sizeContainer(room) {
    room.container.style.height = `${Math.round((TOP_ROOM + room.height + 0.5) * room.px)}px`;
}

// Rows of boards: a compartment joins the current row if it fits whole
// (as ShelfLineLayout.Pack does for the DOM styles); recent stands alone.
function packRows(sections, inner) {
    const usable = inner - 0.6;
    const rows = [];
    let used = 0, open = false;
    for (const section of sections) {
        const plaqueW = Math.min(usable, 3.2, 0.4 + section.label.length * 0.095);
        const lines = [];
        let line = null;
        for (const b of section.books) {
            const w = section.recent ? 1.32 : b.w / 100;
            if (!line || line.used + w > usable) { line = { books: [], used: 0 }; lines.push(line); }
            line.books.push(b);
            line.used += w + GAP;
        }
        lines.forEach((l, i) => {
            const width = Math.max(l.used, i === 0 ? plaqueW : 0);
            const join = i === 0 && open && !section.recent && lines.length === 1 && used + GROUP_GAP + width <= usable;
            const segment = { section, books: l.books, first: i === 0, width };
            if (join) { rows[rows.length - 1].push(segment); used += GROUP_GAP + width; }
            else { rows.push([segment]); used = width; }
        });
        open = !section.recent;
    }
    return rows;
}

// ---------------------------------------------------------------- scene

function buildLights(room) {
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a3a20, 1.5);
    const key = new THREE.DirectionalLight(0xffe2b8, 2.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 0.5, far: 40 });
    key.shadow.bias = -0.0008;
    // Fill from the reader's side, so the inside of the cabinet isn't a cave.
    const fill = new THREE.DirectionalLight(0xfff0dc, 1.3);
    const ambient = new THREE.AmbientLight(0xffe8cc, 0.55);
    const candle = new THREE.PointLight(0xffb060, 7, 9, 1.4);
    room.scene.add(hemi, key, key.target, fill, fill.target, ambient, candle);
    room.lights = { hemi, key, fill, candle };
}

function disposeGroup(room, group) {
    const shared = Object.values(room.materials);
    group.traverse((o) => {
        o.geometry?.dispose();
        const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        materials.forEach((m) => {
            if (shared.includes(m)) return;
            if (m.map !== room.leatherMap) m.map?.dispose();
            m.dispose();
        });
    });
}

function build(room) {
    if (room.cabinet) { room.scene.remove(room.cabinet); disposeGroup(room, room.cabinet); }
    const m = room.materials;
    const inner = room.inner;
    const cabinet = new THREE.Group();
    room.cabinet = cabinet;
    room.books = [];
    room.rows = [];
    room.hovered = null;

    const rows = packRows(room.data.sections, inner);
    const height = Math.max(1, rows.length) * ROW_HEIGHT;
    room.height = height + 0.3;
    const box = (w, h, d, material, x, y, z, shadows = true) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = shadows;
        cabinet.add(mesh);
        return mesh;
    };

    // Carcass: back, sides, cornice with its gilt rule, plinth.
    box(inner + 0.4, height, 0.08, m.back, 0, -height / 2, -DEPTH / 2 - 0.04);
    box(0.24, height + 0.15, DEPTH + 0.2, m.wood, -inner / 2 - 0.12, -height / 2, 0);
    box(0.24, height + 0.15, DEPTH + 0.2, m.wood, inner / 2 + 0.12, -height / 2, 0);
    box(inner + 1.0, 0.34, DEPTH + 0.45, m.wood, 0, 0.17, 0.05);
    box(inner + 0.8, 0.03, 0.02, m.brass, 0, 0.11, DEPTH / 2 + 0.28, false);
    box(inner + 0.7, 0.3, DEPTH + 0.3, m.wood, 0, -height - 0.15, 0.03);

    rows.forEach((row, index) => {
        const floor = -(index + 1) * ROW_HEIGHT;
        box(inner, PLANK, DEPTH, m.wood, 0, floor - PLANK / 2, 0);
        const rowInfo = { index, floor, books: [], textured: false };
        room.rows.push(rowInfo);
        let x = -inner / 2 + 0.3;
        row.forEach((segment, s) => {
            if (s > 0) x += GROUP_GAP;
            const start = x;
            if (segment.first) addPlaque(room, cabinet, segment.section.label, start, floor + ROW_HEIGHT - PLANK - 0.2, Math.min(inner - 0.6, 3.2));
            for (const b of segment.books) {
                const recent = segment.section.recent;
                const w = recent ? 1.29 : b.w / 100, h = recent ? 1.86 : b.h / 100, d = recent ? 0.16 : DEPTH - 0.12;
                const cover = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour).multiplyScalar(0.85), map: room.leatherMap, roughness: 0.68 });
                const spine = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour), map: room.leatherMap, roughness: 0.55 });
                // Faces +x, -x, +y, -y, +z, -z: a shelved book shows its spine
                // (+z), a recent one leans against the back, cover out.
                const front = recent ? tooledCover(b, room.tokens) : spine;
                const faces = recent ? [m.paper, m.paper, m.paper, m.paper, front, cover] : [cover, cover, m.paper, m.paper, spine, m.paper];
                // Pivot on the bottom front edge: a book is tipped out by
                // its top, its foot stays on the board.
                const geometry = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, -d / 2);
                const mesh = new THREE.Mesh(geometry, faces);
                const lean = recent ? -0.1 : 0;
                mesh.position.set(x + w / 2, floor, recent ? -DEPTH / 2 + 0.42 : 0.02 + d / 2);
                mesh.rotation.x = lean;
                mesh.castShadow = mesh.receiveShadow = true;
                mesh.userData = { ...b, recent, row: index, base: mesh.position.clone(), height: h, lean, out: 0, spine };
                cabinet.add(mesh);
                room.books.push(mesh);
                rowInfo.books.push(mesh);
                x += w + GAP;
            }
            x = start + Math.max(x - start, segment.width);
        });
    });

    room.scene.add(cabinet);
    addProps(room);
}

function addPlaque(room, cabinet, label, x, y, maxWidth) {
    const tokens = room.tokens;
    const width = Math.min(maxWidth, 0.4 + label.length * 0.095), height = 0.24;
    const canvas = document.createElement("canvas");
    canvas.height = 96;
    canvas.width = Math.round(96 * width / height);
    const g = canvas.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, tokens.brassHi); grad.addColorStop(0.5, tokens.brass); grad.addColorStop(1, tokens.brassLo);
    g.fillStyle = grad; g.fillRect(0, 0, canvas.width, 96);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 4; g.strokeRect(2, 2, canvas.width - 4, 92);
    g.fillStyle = tokens.brassLo;
    [18, canvas.width - 18].forEach((cx) => { g.beginPath(); g.arc(cx, 48, 7, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = tokens.ink; g.font = '600 46px "Cinzel", Georgia, serif'; g.textAlign = "center"; g.textBaseline = "middle";
    const upper = label.toUpperCase();
    let text = upper;
    while (g.measureText(text).width > canvas.width - 70 && text.length > 4) text = text.slice(0, -2);
    if (text !== upper) text += "…";
    g.fillText(text, canvas.width / 2, 52);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const brass = room.materials.brass;
    const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.55 });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03), [brass, brass, brass, brass, face, brass]);
    plaque.position.set(x + width / 2, y, DEPTH / 2 + 0.03);
    cabinet.add(plaque);
}

// The theme's decor pictures on the cornice, read from
// the probe elements so they follow shelf-shared.css. Their contact shadow
// is in the picture.
function probe(room, selector, sizeVar) {
    const el = room.container.querySelector(selector);
    if (!el) return null;
    const style = getComputedStyle(el);
    const url = /url\(["']?([^"')]+)["']?\)/.exec(style.backgroundImage)?.[1];
    const px = parseFloat(style.getPropertyValue(sizeVar));
    return url && px ? { url, h: px / 100 } : null;
}

function addProps(room) {
    room.props.forEach((p) => { room.scene.remove(p); p.material.map?.dispose(); p.material.dispose(); p.geometry.dispose(); });
    room.props = [];
    const generation = (room.propGeneration = (room.propGeneration ?? 0) + 1);
    // anchor: the picture's left (align -1) or right (align 1) edge, its base
    const place = (pic, anchor, y, z, align, maxWidth = Infinity) => {
        if (!pic) return;
        new THREE.TextureLoader().load(pic.url, (texture) => {
            if (room.disposed || generation !== room.propGeneration) { texture.dispose(); return; }
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            let h = pic.h, w = h * texture.image.width / texture.image.height;
            if (w > maxWidth) { h *= maxWidth / w; w = maxWidth; }
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.02, roughness: 0.85 }));
            plane.position.set(align < 0 ? anchor + w / 2 : anchor - w / 2, y + h / 2, z);
            room.scene.add(plane);
            room.props.push(plane);
            wake(room);
        });
    };
    const edge = room.inner / 2 - 0.1;
    const narrow = room.inner < 6;
    const decorH = narrow ? 0.6 : 0.8;
    const scaled = (pic, k) => pic && { ...pic, h: pic.h * k };
    place(scaled(probe(room, ".shelf-decor--left.shelf-room-probe", "--decor-h"), decorH), -edge, 0.34, 0.1, -1, room.inner / 2 - 0.2);
    place(scaled(probe(room, ".shelf-decor--right.shelf-room-probe", "--decor-h"), decorH), edge, 0.34, 0.1, 1, room.inner / 2 - 0.2);
}

// Spine textures only exist for rows near the view (big libraries).
function ensureRowTextures(room, top, bottom) {
    room.rows.forEach((row) => {
        const rowTop = row.floor + ROW_HEIGHT;
        const near = rowTop > bottom - NEAR_ROWS * ROW_HEIGHT && row.floor < top + NEAR_ROWS * ROW_HEIGHT;
        if (near && !row.textured) {
            row.books.forEach((book) => {
                if (book.userData.recent) return;
                const texture = new THREE.CanvasTexture(spineCanvas(book.userData, room.tokens));
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = 4;
                book.userData.spine.map = texture;
                book.userData.spine.color.set(0xffffff);
                book.userData.spine.needsUpdate = true;
            });
            row.textured = true;
        } else if (!near && row.textured) {
            row.books.forEach((book) => {
                if (book.userData.recent) return;
                book.userData.spine.map?.dispose();
                book.userData.spine.map = room.leatherMap;
                book.userData.spine.color.set(book.userData.colour);
                book.userData.spine.needsUpdate = true;
            });
            row.textured = false;
        }
    });
}

function spineCanvas(book, tokens) {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 384;
    const g = c.getContext("2d");
    g.fillStyle = book.colour; g.fillRect(0, 0, 96, 384);
    const shade = g.createLinearGradient(0, 0, 96, 0);
    shade.addColorStop(0, "rgba(0,0,0,.55)"); shade.addColorStop(0.3, "rgba(255,240,215,.2)"); shade.addColorStop(0.7, "rgba(0,0,0,.08)"); shade.addColorStop(1, "rgba(0,0,0,.6)");
    g.fillStyle = shade; g.fillRect(0, 0, 96, 384);
    // headband
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#e8d6a4" : "#7a2a1e"; g.fillRect(i * 16, 0, 16, 4); }
    g.strokeStyle = tokens.brassHi; g.lineWidth = 2;
    [24, 34, 350, 360].forEach((y) => { g.beginPath(); g.moveTo(10, y); g.lineTo(86, y); g.stroke(); });
    g.fillStyle = "rgba(0,0,0,.42)"; g.fillRect(14, 80, 68, 176);
    g.lineWidth = 1.5; g.strokeRect(17, 83, 62, 170);
    g.save(); g.translate(48, 168); g.rotate(-Math.PI / 2);
    g.fillStyle = tokens.brassHi; g.font = '700 22px "Cormorant Garamond", Georgia, serif'; g.textAlign = "center"; g.textBaseline = "middle";
    let t = book.title;
    while (g.measureText(t).width > 156 && t.length > 3) t = t.slice(0, -2);
    if (t !== book.title) t += "…";
    g.fillText(t, 0, 0); g.restore();
    return c;
}

// A recent book faces out: tooled leather with its title.
function tooledCover(book, tokens) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 368;
    const g = c.getContext("2d");
    g.fillStyle = book.colour; g.fillRect(0, 0, 256, 368);
    const glow = g.createRadialGradient(100, 120, 20, 128, 184, 260);
    glow.addColorStop(0, "rgba(255,240,215,.16)"); glow.addColorStop(1, "rgba(0,0,0,.5)");
    g.fillStyle = glow; g.fillRect(0, 0, 256, 368);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, 14, 368);
    g.strokeStyle = tokens.brassHi; g.lineWidth = 2.5; g.strokeRect(24, 16, 218, 336);
    g.lineWidth = 1; g.strokeRect(31, 23, 204, 322);
    g.fillStyle = tokens.brassHi; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '700 26px "Cormorant Garamond", Georgia, serif';
    const lines = []; let line = "";
    for (const w of book.title.split(" ")) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 180 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    const shown = lines.slice(0, 4);
    shown.forEach((l, i) => g.fillText(l, 133, 130 + i * 32 - (shown.length - 1) * 16));
    g.beginPath(); g.arc(133, 270, 16, 0, Math.PI * 2); g.stroke();
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
}

// Where the book is on screen, for the spread to fly from.
function pick(room, book) {
    const box = new THREE.Box3().setFromObject(book);
    const r = room.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const xs = [], ys = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
        v.set(x, y, box.max.z).project(room.camera);
        xs.push(r.left + (v.x + 1) / 2 * r.width);
        ys.push(r.top + (1 - v.y) / 2 * r.height);
    }
    const left = Math.min(...xs), top = Math.min(...ys);
    room.takenId = book.userData.id;
    room.hovered = null;
    room.container.style.cursor = "";
    wake(room);
    room.dotNet.invokeMethodAsync("Open", book.userData.id, left, top, Math.max(...xs) - left, Math.max(...ys) - top);
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
    const m = /rgba?\(([^)]+)\)/.exec(css);
    if (m) { const [r, g, b] = m[1].split(",").map((v) => parseFloat(v)); return new THREE.Color(r / 255, g / 255, b / 255); }
    return new THREE.Color(css);
}

function applyTheme(room, rebuild) {
    const tokens = readTokens();
    const changed = JSON.stringify(room.tokens) !== JSON.stringify(tokens);
    room.tokens = tokens;
    const m = room.materials;
    m.wood ??= new THREE.MeshStandardMaterial({ map: room.woodMap, roughness: 0.62, metalness: 0.04 });
    m.back ??= new THREE.MeshStandardMaterial({ map: room.woodMap, roughness: 0.9 });
    m.paper ??= new THREE.MeshStandardMaterial({ color: 0xe9dcbc, roughness: 0.92 });
    m.brass ??= new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.32, metalness: 0.9 });
    // The texture carries the grain; the token tints it.
    const wood = new THREE.Color(tokens.wood);
    m.wood.color.copy(wood).multiplyScalar(2.6);
    m.back.color.copy(wood).multiplyScalar(2.6);
    m.brass.color.set(tokens.brass);
    room.lights.candle.color.copy(rgb(tokens.light)).lerp(new THREE.Color(0xffb060), 0.5);
    // Plaques, spines and pictures carry theme colours and pictures.
    if (rebuild && room.cabinet) {
        if (changed) build(room);
        else addProps(room);
    }
}

// ---------------------------------------------------------------- loop

// Something changed: render now (the loop may be idle or throttled).
function wake(room) {
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
        const { camera, renderer, stage, container, lights, px } = room;

        // The canvas covers the stage; the camera shows the stage's pixels
        // of the cabinet's front plane at the page scale, wherever the page
        // has scrolled to -- so the cabinet moves exactly like the page.
        const s = stage.getBoundingClientRect(), r = container.getBoundingClientRect();
        if (s.width < 1 || s.height < 1) return;
        const w = Math.round(s.width), h = Math.round(s.height);
        if (room.size !== `${w}x${h}`) { renderer.setSize(w, h, false); room.size = `${w}x${h}`; }
        camera.aspect = s.width / s.height;
        const dist = (s.height / px) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const cx = (s.left + s.width / 2 - (r.left + r.width / 2)) / px;
        const cy = (r.top + TOP_ROOM * px - (s.top + s.height / 2)) / px;
        camera.position.set(cx, cy, FRONT + dist);
        camera.lookAt(cx, cy, FRONT);
        camera.near = Math.max(0.1, dist - 8);
        camera.far = dist + 12;
        camera.updateProjectionMatrix();

        lights.key.position.set(cx - 4, cy + 5, 7);
        lights.key.target.position.set(cx, cy, 0);
        lights.fill.position.set(cx + 2, cy - 1, 12);
        lights.fill.target.position.set(cx, cy, 0);
        lights.candle.position.set(room.inner / 2 - 0.9, 1.6, 1.4);
        if (!still) {
            const t = now / 1000;
            lights.candle.intensity = 7 + Math.sin(t * 11) * 0.7 + Math.sin(t * 27) * 0.4 + Math.sin(t * 53) * 0.25;
        }
        const half = s.height / px / 2;
        ensureRowTextures(room, cy + half, cy - half);

        // hover: ray from the pointer
        let hovered = null;
        if (room.pointer) {
            const ndc = new THREE.Vector2(((room.pointer.x - s.left) / s.width) * 2 - 1, -(((room.pointer.y - s.top) / s.height) * 2 - 1));
            room.ray.setFromCamera(ndc, camera);
            hovered = room.ray.intersectObjects(room.books.filter((b) => b.visible), false)[0]?.object ?? null;
        }
        if (hovered !== room.hovered) { room.hovered = hovered; container.style.cursor = hovered ? "pointer" : ""; }

        let moving = false;
        for (const book of room.books) {
            const u = book.userData;
            book.visible = u.id !== room.takenId;
            const target = book === room.hovered || book === room.focused ? 1 : 0;
            if (Math.abs(target - u.out) < 0.002) u.out = target;
            else { u.out += (target - u.out) * (still ? 1 : Math.min(1, dt * 10)); moving = true; }
            // The top tips towards the reader (about 9 degrees) while the foot
            // stays on the board; a recent book stands up off the back wall.
            book.rotation.x = u.recent ? u.lean * (1 - u.out) + u.out * 0.04 : u.out * 0.16;
        }

        renderer.render(room.scene, camera);
        // Full speed while something moves; 20 fps for the candle alone;
        // nothing with reduced motion until wake().
        if (moving) room.raf = requestAnimationFrame(frame);
        else if (!still) { room.raf = -1; room.timer = setTimeout(() => { room.raf = requestAnimationFrame(frame); }, 50); }
    };
    room.raf = requestAnimationFrame(frame);
}
