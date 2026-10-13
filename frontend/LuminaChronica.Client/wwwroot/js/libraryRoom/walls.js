import * as THREE from "../../lib/three/three.module.min.js";

// The wall's finish: panelled wainscot with a chair rail below, framed
// stucco fields between the pilasters above the cases, and the drum under
// the dome -- a frieze with a running key pattern and small round windows.

function panelCanvas(wood) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const g = c.getContext("2d");
    const base = new THREE.Color(wood).multiplyScalar(2.2);
    const hex = (k) => `#${base.clone().multiplyScalar(k).getHexString()}`;
    g.fillStyle = hex(1); g.fillRect(0, 0, 256, 256);
    // stile and rail, then a raised field with bevels lit from above
    g.fillStyle = hex(0.86); g.fillRect(28, 28, 200, 200);
    g.fillStyle = hex(1.18); g.fillRect(28, 28, 200, 8); g.fillRect(28, 28, 8, 200);
    g.fillStyle = hex(0.62); g.fillRect(28, 220, 200, 8); g.fillRect(220, 28, 8, 200);
    g.fillStyle = hex(1.04); g.fillRect(52, 52, 152, 152);
    for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 1, 4 + Math.random() * 14);
    }
    return c;
}

function friezeCanvas(theme, tint) {
    const W = 512, H = 128, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = `#${tint.getHexString()}`; g.fillRect(0, 0, W, H);
    g.fillStyle = `#${tint.clone().multiplyScalar(0.72).getHexString()}`; g.fillRect(0, 34, W, 60);
    // running key (meander), gilt
    g.strokeStyle = theme.brass; g.lineWidth = 5; g.lineJoin = "miter";
    const step = 64;
    for (let x = 0; x < W; x += step) {
        g.beginPath();
        g.moveTo(x, 86); g.lineTo(x, 42); g.lineTo(x + 46, 42); g.lineTo(x + 46, 74);
        g.lineTo(x + 18, 74); g.lineTo(x + 18, 56); g.lineTo(x + 32, 56);
        g.moveTo(x, 86); g.lineTo(x + step, 86);
        g.stroke();
    }
    g.fillStyle = theme.brass; g.fillRect(0, 26, W, 4); g.fillRect(0, 98, W, 4);
    return c;
}

export function buildWalls(room, { radius, slots, wallHeight, wood, brass, windowSlots = new Set() }) {
    const { theme, renderer } = room;
    const group = new THREE.Group();
    const aniso = renderer.capabilities.getMaxAnisotropy();

    // wainscot, 1 m high, two panels per place
    const panelMap = new THREE.CanvasTexture(panelCanvas(theme.wood));
    panelMap.colorSpace = THREE.SRGBColorSpace;
    panelMap.wrapS = THREE.RepeatWrapping;
    panelMap.repeat.set(slots * 3, 1);
    panelMap.anisotropy = aniso;
    const wainscot = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.025, radius - 0.025, 1.0, 144, 1, true),
        new THREE.MeshStandardMaterial({ map: panelMap, bumpMap: panelMap, bumpScale: 1.5, roughness: 0.7, side: THREE.BackSide }));
    wainscot.position.y = 0.5;
    wainscot.receiveShadow = true;
    group.add(wainscot);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.04, 0.035, 8, 160), wood);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1.02;
    group.add(rail);

    // framed fields between the pilasters, above the cases
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.brassLo).lerp(new THREE.Color(0xe8dcc4), 0.35), roughness: 0.5, metalness: 0.35 });
    const per = Math.PI * 2 / slots;
    const top = wallHeight - 0.45, bottom = 2.85;
    if (top - bottom > 0.4) {
        for (let i = 0; i < slots; i++) {
            if (windowSlots.has(i)) continue; // the arch fills that bay
            const a0 = i * per - per / 2 + 0.07, len = per - 0.14;
            for (const y of [bottom, top]) {
                // three.js' cylinder angle θ puts a point at (sin θ, cos θ); ours
                // at (sin a, -cos a), so θ = π - a and the arc runs backwards
                const bar = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.02, radius - 0.02, 0.05, 24, 1, true, Math.PI - (a0 + len), len), frameMat);
                bar.material.side = THREE.DoubleSide;
                bar.position.y = y;
                group.add(bar);
            }
            for (const a of [a0, a0 + len]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, top - bottom, 0.03), frameMat);
                post.position.set(Math.sin(a) * (radius - 0.02), (top + bottom) / 2, -Math.cos(a) * (radius - 0.02));
                post.rotation.y = -a;
                group.add(post);
            }
        }
    }

    // the drum: frieze band with round windows
    const drumH = 1.0;
    const tint = new THREE.Color(0xe8dcc4).lerp(new THREE.Color(theme.wood), 0.3);
    const friezeMap = new THREE.CanvasTexture(friezeCanvas(theme, tint));
    friezeMap.colorSpace = THREE.SRGBColorSpace;
    friezeMap.wrapS = THREE.RepeatWrapping;
    friezeMap.repeat.set(slots * 4, 1);
    friezeMap.anisotropy = aniso;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, drumH, 144, 1, true),
        new THREE.MeshStandardMaterial({ map: friezeMap, bumpMap: friezeMap, bumpScale: 1.2, roughness: 0.75, side: THREE.BackSide }));
    drum.position.y = wallHeight + drumH / 2 + 0.08;
    group.add(drum);
    const sky = new THREE.Color(theme.sky);
    const glass = new THREE.MeshBasicMaterial({ color: sky.clone().multiplyScalar(theme.night ? 0.35 : 1.0), toneMapped: false });
    for (let i = 0; i < slots; i++) {
        const a = i * per;
        const pos = new THREE.Vector3(Math.sin(a) * (radius - 0.03), wallHeight + 0.62, -Math.cos(a) * (radius - 0.03));
        const pane = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), glass);
        pane.position.copy(pos);
        pane.lookAt(0, pos.y, 0);
        group.add(pane);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 32), brass);
        rim.position.copy(pos);
        rim.lookAt(0, pos.y, 0);
        group.add(rim);
    }
    const capRing = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.05, 0.07, 8, 160), wood);
    capRing.rotation.x = Math.PI / 2;
    capRing.position.y = wallHeight + drumH + 0.08;
    group.add(capRing);
    const gilt = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.12, 0.025, 8, 160), brass);
    gilt.rotation.x = Math.PI / 2;
    gilt.position.y = wallHeight + drumH + 0.16;
    group.add(gilt);

    return { group, domeBase: wallHeight + drumH + 0.1 };
}
