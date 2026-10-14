import * as THREE from "../../lib/three/three.module.min.js";
import { persianRug } from "./victorian.js";

// What furnishes the rotunda besides its cases: the inlaid compass rose in
// the middle of the floor (where the light from the oculus falls) and a
// reading corner -- a round table with an open book, a stack of books, a
// candle and the oil lamp, an armchair and a small rug.

// The floor medallion: concentric bands of two woods with brass lines and an
// eight-point star, drawn once on a canvas.
export function medallion(theme, radius = 1.45) {
    const size = 1024, c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const mid = size / 2;
    const wood = new THREE.Color(theme.wood);
    const dark = `#${wood.clone().multiplyScalar(1.3).getHexString()}`;
    const light = `#${wood.clone().lerp(new THREE.Color(0xd9b98a), 0.65).getHexString()}`;
    const brass = theme.brass;
    const ring = (r, fill) => { g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
    const line = (r, w) => { g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = brass; g.stroke(); };
    ring(mid, dark);
    ring(mid * 0.94, light);
    ring(mid * 0.86, dark);
    // a band of small diamonds
    for (let i = 0; i < 48; i++) {
        const a = i / 48 * Math.PI * 2, r = mid * 0.9;
        g.save(); g.translate(mid + Math.cos(a) * r, mid + Math.sin(a) * r); g.rotate(a);
        g.fillStyle = light; g.beginPath(); g.moveTo(-10, 0); g.lineTo(0, -7); g.lineTo(10, 0); g.lineTo(0, 7); g.closePath(); g.fill();
        g.restore();
    }
    ring(mid * 0.8, light);
    // eight-point star in two woods, brass edged
    const star = (points, outer, inner, fill, rot) => {
        g.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 ? inner : outer, a = rot + i * Math.PI / points;
            const x = mid + Math.cos(a) * r, y = mid + Math.sin(a) * r;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = brass; g.stroke();
    };
    star(8, mid * 0.76, mid * 0.3, dark, -Math.PI / 2 + Math.PI / 8);
    star(4, mid * 0.78, mid * 0.18, light, -Math.PI / 2);
    ring(mid * 0.14, dark);
    line(mid * 0.14, 5);
    line(mid * 0.8, 6);
    line(mid * 0.86, 4);
    line(mid * 0.94, 4);
    line(mid * 0.995, 8);
    // fine grain
    for (let i = 0; i < 6000; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
        g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 1);
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0.05 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.004;
    mesh.receiveShadow = true;
    return mesh;
}

// The reading corner, facing the middle from `angle` at `radius`.
export async function readingCorner(room, { angle, radius, rugMaterial }) {
    const { assets, theme } = room;
    const group = new THREE.Group();
    group.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    group.rotation.y = -angle;

    const rug = persianRug(theme, 2.7, 1.9);
    rug.position.y = 0.006;
    group.add(rug);

    const table = await assets.place("round_wooden_table_01", 1.05);
    let top = 0.76;
    if (table) {
        group.add(table);
        top = new THREE.Box3().setFromObject(table).max.y - group.position.y;
    }
    const lamp = await assets.place("vintage_oil_lamp", 0.48, "height");
    if (lamp) {
        lamp.position.set(-0.3, top, -0.12);
        group.add(lamp);
    }
    const chair = await assets.place("ArmChair_01", 0.85);
    if (chair) {
        // behind the table, facing the room (and whoever turns to it)
        chair.position.set(0.15, 0, -0.95);
        chair.rotation.y = 0.25;
        group.add(chair);
    }

    // a side table with tea, a footstool, a plant
    const side = await assets.place("round_wooden_table_01", 0.5);
    if (side) {
        side.scale.y *= 0.82;
        side.position.set(0.95, 0, -0.55);
        group.add(side);
        const sideTop = new THREE.Box3().setFromObject(side).max.y;
        const tea = await assets.place("tea_set_01", 0.36);
        if (tea) { tea.position.set(0.95, sideTop, -0.55); tea.rotation.y = 0.6; group.add(tea); }
    }
    const stool = await assets.place("Ottoman_01", 0.5);
    if (stool) { stool.position.set(0.55, 0, 0.55); stool.rotation.y = 0.3; group.add(stool); }
    const plant = await assets.place("potted_plant_04", 1.1, "height");
    if (plant) { plant.position.set(-1.05, 0, -0.6); group.add(plant); }

    // an open book, a stack, a candle
    const leather = (hex) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.6 });
    const pages = new THREE.MeshStandardMaterial({ map: pageTexture(), roughness: 0.9 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xeee2c4, roughness: 0.95 });
    const open = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.008, 0.31), leather("#5b1f2a"));
    cover.position.y = 0.004;
    open.add(cover);
    for (const side of [-1, 1]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.022, 0.29), [paper, paper, pages, paper, paper, paper]);
        block.position.set(side * 0.112, 0.019, 0);
        block.rotation.z = side * -0.07;
        if (side > 0) block.material = [paper, paper, pages.clone(), paper, paper, paper];
        open.add(block);
    }
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.2), new THREE.MeshStandardMaterial({ color: 0x8c1d22, roughness: 0.5 }));
    ribbon.position.set(0.02, 0.031, 0.15);
    open.add(ribbon);
    open.position.set(0.12, top, 0.12);
    open.rotation.y = 0.25;
    group.add(open);

    const stack = new THREE.Group();
    [["#1f3a4d", 0.26, 0.05], ["#6b3a1e", 0.24, 0.045], ["#2d4a2b", 0.22, 0.04]].reduce((y, [hex, w, h], i) => {
        const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.72), [leather(hex), leather(hex), paper, leather(hex), paper, leather(hex)]);
        book.position.y = y + h / 2;
        book.rotation.y = (i - 1) * 0.18;
        book.castShadow = book.receiveShadow = true;
        stack.add(book);
        return y + h;
    }, 0);
    stack.position.set(0.28, top, -0.2);
    group.add(stack);

    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.17, 16), new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.7 }));
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 24), new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.brass), metalness: 1, roughness: 0.35 }));
    holder.position.set(-0.05, top + 0.01, -0.3);
    candle.position.set(-0.05, top + 0.105, -0.3);
    group.add(holder, candle);
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    room.scene.updateMatrixWorld(true);
    group.updateMatrixWorld(true);
    return {
        group,
        lamp: group.localToWorld(new THREE.Vector3(-0.3, top + 0.42, -0.12)),
        candle: group.localToWorld(new THREE.Vector3(-0.05, top + 0.205, -0.3)),
    };
}

function pageTexture() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 340;
    const g = c.getContext("2d");
    g.fillStyle = "#efe4c6"; g.fillRect(0, 0, 256, 340);
    const shade = g.createLinearGradient(0, 0, 256, 0);
    shade.addColorStop(0, "rgba(120,90,40,.25)"); shade.addColorStop(0.12, "rgba(0,0,0,0)");
    g.fillStyle = shade; g.fillRect(0, 0, 256, 340);
    g.fillStyle = "rgba(60,40,20,.55)";
    for (let y = 40; y < 310; y += 11) {
        const w = 150 + Math.random() * 40;
        g.fillRect(40, y, y > 290 ? w * 0.5 : w, 3);
    }
    g.fillStyle = "rgba(120,30,30,.8)"; g.fillRect(40, 26, 26, 22);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
