import * as THREE from "../../lib/three/three.module.min.js";
import { CASE, slotFrame } from "./rotunda.js";

// One bookcase of the 3D library: a closed cupboard below, five open boards
// above, a crown with the compartment's brass plaque. Books stand on the
// boards (spines out; "Zuletzt gelesen" leans cover-out) with their pivot on
// the bottom front edge, so tipping one out never lifts its foot.
// Book sizes arrive in millimetres (ShelfLineLayout).
const PLINTH = 0.1;
const CUPBOARD = 0.72;
const CROWN = 0.2;
const SIDE = 0.045;
const BOARD = 0.03;
const INNER_W = CASE.width - SIDE * 2;
const OPEN_H = CASE.height - PLINTH - CUPBOARD - CROWN;
const BOARDS = 5;
const SPACING = OPEN_H / BOARDS;
const GAP = 0.003;

export async function buildCase(room, c, materials) {
    const { theme } = room;
    const frame = slotFrame(Math.round(c.angle / (360 / room.data.slots)), c.tier, room.data.slots);
    const group = new THREE.Group();
    group.position.copy(frame.position);
    group.rotation.y = frame.rotationY;
    group.userData.caseIndex = c.index;

    const { wood, back, brass, paper } = materials;
    const box = (w, h, d, material, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        m.position.set(x, y, z);
        m.castShadow = m.receiveShadow = true;
        m.userData.caseIndex = c.index;
        group.add(m);
        return m;
    };
    const D = CASE.depth;
    // carcass (front plane at z = 0, back at -D)
    box(SIDE, CASE.height, D, wood, -CASE.width / 2 + SIDE / 2, CASE.height / 2, -D / 2);
    box(SIDE, CASE.height, D, wood, CASE.width / 2 - SIDE / 2, CASE.height / 2, -D / 2);
    box(INNER_W, CASE.height - PLINTH, 0.02, back, 0, (CASE.height + PLINTH) / 2, -D + 0.01);
    box(CASE.width + 0.04, PLINTH, D + 0.03, wood, 0, PLINTH / 2, -D / 2 + 0.015);
    // cupboard with two panelled doors
    box(INNER_W, CUPBOARD, D - 0.02, wood, 0, PLINTH + CUPBOARD / 2, -D / 2 - 0.01);
    for (const x of [-INNER_W / 4, INNER_W / 4]) {
        box(INNER_W / 2 - 0.12, CUPBOARD - 0.16, 0.012, back, x, PLINTH + CUPBOARD / 2, 0.003);
        box(0.018, 0.05, 0.02, brass, x + (x < 0 ? INNER_W / 4 - 0.07 : -INNER_W / 4 + 0.07), PLINTH + CUPBOARD * 0.55, 0.02);
    }
    // boards (the cupboard top is the first)
    const floors = [];
    for (let i = 0; i < BOARDS; i++) {
        const y = PLINTH + CUPBOARD + i * SPACING;
        box(INNER_W, BOARD, D - 0.02, wood, 0, y + BOARD / 2, -D / 2 - 0.01);
        floors.push(y + BOARD);
    }
    // crown: frieze with the plaque, cornice above
    const crownY = CASE.height - CROWN;
    box(CASE.width, CROWN, D, wood, 0, crownY + CROWN / 2, -D / 2);
    box(CASE.width + 0.1, 0.05, D + 0.08, wood, 0, CASE.height + 0.025, -D / 2 + 0.03);
    box(CASE.width + 0.06, 0.012, 0.012, brass, 0, CASE.height - 0.01, 0.045);
    const plaque = plaqueMesh(c.continued ? `${c.label} ·` : c.label, theme, brass);
    plaque.position.set(0, crownY + CROWN / 2, 0.006);
    group.add(plaque);

    // books
    const books = [];
    c.boards.forEach((board, i) => {
        if (i >= BOARDS) return;
        let x = -INNER_W / 2 + 0.03;
        for (const b of board) {
            const book = c.recent ? recentBook(b, theme, paper) : spineBook(b, paper);
            const w = c.recent ? 0.15 : b.w / 1000;
            book.position.set(x + w / 2, floors[i], c.recent ? -D + 0.07 : -0.012);
            book.userData = { ...book.userData, id: b.id, title: b.title, author: b.author, recent: c.recent, out: 0, caseIndex: c.index };
            group.add(book);
            books.push(book);
            x += w + GAP;
        }
    });

    const center = frame.position.clone().add(new THREE.Vector3(0, CASE.height / 2, 0));
    return { index: c.index, tier: c.tier, group, books, center, normal: frame.normal.clone(), angle: frame.angle, textured: false };
}

// The shared materials of all bookcases (in the theme's wood).
export async function caseMaterials(room) {
    const tint = new THREE.Color(room.theme.wood).multiplyScalar(2.4);
    const wood = await room.assets.material("walnut_veneer", { repeat: [1, 1.5], tint, roughness: 0.75 });
    const back = await room.assets.material("walnut_veneer", { repeat: [2, 3], tint: tint.clone().multiplyScalar(0.8), roughness: 0.9 });
    const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(room.theme.brass), metalness: 1, roughness: 0.3 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xeadfc2, roughness: 0.95 });
    return { wood, back, brass, paper };
}

// A shelved book: box with its pivot on the bottom front edge (y = 0, z = 0).
function spineBook(b, paper) {
    const w = b.w / 1000, h = b.h / 1000, d = 0.13 + (b.h - 176) / 1000 * 0.5;
    const geometry = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, -d / 2);
    const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour), roughness: 0.62 });
    const spine = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour), roughness: 0.55 });
    // faces: +x, -x, +y, -y, +z (spine), -z
    const mesh = new THREE.Mesh(geometry, [leather, leather, paper, paper, spine, paper]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { spine, colour: b.colour, w: b.w, h: b.h, lean: 0 };
    return mesh;
}

// "Zuletzt gelesen": leans against the back with its tooled cover out.
function recentBook(b, theme, paper) {
    const w = 0.145, h = 0.21, d = 0.035;
    const geometry = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, -d / 2);
    const cover = new THREE.CanvasTexture(tooledCover(b, theme));
    cover.colorSpace = THREE.SRGBColorSpace;
    cover.anisotropy = 8;
    const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(b.colour), roughness: 0.62 });
    const front = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.55 });
    const mesh = new THREE.Mesh(geometry, [paper, leather, paper, paper, front, leather]);
    mesh.castShadow = mesh.receiveShadow = true;
    // leaning back against the wall of the case
    mesh.userData = { lean: -0.16, colour: b.colour };
    mesh.rotation.x = -0.16;
    return mesh;
}

// Spine textures exist only for the cases near the camera (memory).
export function setSpineTextures(entry, on, theme) {
    if (entry.textured === on) return;
    entry.textured = on;
    for (const book of entry.books) {
        const u = book.userData;
        if (u.recent || !u.spine) continue;
        if (on) {
            const t = new THREE.CanvasTexture(spineCanvas(u, theme));
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 8;
            u.spine.map = t;
            u.spine.color.set(0xffffff);
        } else {
            u.spine.map?.dispose();
            u.spine.map = null;
            u.spine.color.set(u.colour);
        }
        u.spine.needsUpdate = true;
    }
}

function spineCanvas(book, theme) {
    const W = 96, H = Math.round(96 * book.h / book.w);
    const c = document.createElement("canvas");
    c.width = W; c.height = Math.min(1024, H);
    const g = c.getContext("2d");
    const h = c.height;
    g.fillStyle = book.colour; g.fillRect(0, 0, W, h);
    // leather grain and the rounded spine's light
    for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
        g.fillRect(Math.random() * W, Math.random() * h, 2, 2);
    }
    const shade = g.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, "rgba(0,0,0,.55)"); shade.addColorStop(0.28, "rgba(255,240,215,.16)");
    shade.addColorStop(0.55, "rgba(0,0,0,.04)"); shade.addColorStop(1, "rgba(0,0,0,.6)");
    g.fillStyle = shade; g.fillRect(0, 0, W, h);
    // raised bands
    g.strokeStyle = theme.brassHi; g.lineWidth = 2;
    for (const y of [0.07, 0.1, 0.86, 0.89]) { g.beginPath(); g.moveTo(8, y * h); g.lineTo(W - 8, y * h); g.stroke(); }
    // title piece and title, sized to fit (like ShelfBookBase.TitleFit)
    const top = 0.16 * h, len = 0.62 * h;
    g.fillStyle = "rgba(0,0,0,.42)"; g.fillRect(14, top, W - 28, len);
    g.lineWidth = 1.5; g.strokeRect(17, top + 3, W - 34, len - 6);
    g.save(); g.translate(W / 2, top + len / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = theme.brassHi; g.textAlign = "center"; g.textBaseline = "middle";
    let size = 30;
    g.font = `700 ${size}px "Cormorant Garamond", Georgia, serif`;
    const room = len - 24;
    while (size > 18 && g.measureText(book.title).width > room) { size -= 1; g.font = `700 ${size}px "Cormorant Garamond", Georgia, serif`; }
    let title = book.title;
    if (g.measureText(title).width > room) {
        // two lines, then cut
        const words = title.split(" "); let a = "", rest = "";
        for (const w of words) { if (!rest && g.measureText(a ? `${a} ${w}` : w).width <= room) a = a ? `${a} ${w}` : w; else rest = rest ? `${rest} ${w}` : w; }
        let b = rest;
        while (b && g.measureText(b).width > room) b = b.slice(0, -2);
        if (b !== rest) b += "…";
        g.fillText(a, 0, -size * 0.55); g.fillText(b, 0, size * 0.55);
    } else {
        g.fillText(title, 0, 0);
    }
    g.restore();
    return c;
}

function tooledCover(book, theme) {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 464;
    const g = c.getContext("2d");
    g.fillStyle = book.colour; g.fillRect(0, 0, 320, 464);
    const glow = g.createRadialGradient(120, 150, 20, 160, 232, 330);
    glow.addColorStop(0, "rgba(255,240,215,.16)"); glow.addColorStop(1, "rgba(0,0,0,.5)");
    g.fillStyle = glow; g.fillRect(0, 0, 320, 464);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, 16, 464);
    g.strokeStyle = theme.brassHi; g.lineWidth = 3; g.strokeRect(30, 20, 272, 424);
    g.lineWidth = 1.2; g.strokeRect(39, 29, 254, 406);
    g.fillStyle = theme.brassHi; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '700 32px "Cormorant Garamond", Georgia, serif';
    const lines = []; let line = "";
    for (const w of book.title.split(" ")) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 230 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    const shown = lines.slice(0, 4);
    shown.forEach((l, i) => g.fillText(l, 166, 160 + i * 40 - (shown.length - 1) * 20));
    if (book.author) { g.font = "600 15px system-ui, sans-serif"; g.fillText(book.author.toUpperCase(), 166, 330); }
    if (book.progress != null) {
        g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(60, 400, 212, 6);
        g.fillStyle = theme.brassHi; g.fillRect(60, 400, 212 * Math.max(0, Math.min(1, book.progress / 100)), 6);
    }
    return c;
}

function plaqueMesh(label, theme, brass) {
    const width = Math.min(1.1, 0.22 + label.length * 0.045), height = 0.1;
    const canvas = document.createElement("canvas");
    canvas.height = 96;
    canvas.width = Math.round(96 * width / height);
    const g = canvas.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, theme.brassHi); grad.addColorStop(0.5, theme.brass); grad.addColorStop(1, theme.brassLo);
    g.fillStyle = grad; g.fillRect(0, 0, canvas.width, 96);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 4; g.strokeRect(2, 2, canvas.width - 4, 92);
    g.fillStyle = theme.brassLo;
    [18, canvas.width - 18].forEach((cx) => { g.beginPath(); g.arc(cx, 48, 7, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = theme.ink; g.font = '600 50px "Cinzel", Georgia, serif'; g.textAlign = "center"; g.textBaseline = "middle";
    let text = label.toUpperCase();
    while (g.measureText(text).width > canvas.width - 70 && text.length > 4) text = text.slice(0, -2);
    if (text !== label.toUpperCase()) text += "…";
    g.fillText(text, canvas.width / 2, 52);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const face = new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.35 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.012), [brass, brass, brass, brass, face, brass]);
    mesh.castShadow = true;
    return mesh;
}
