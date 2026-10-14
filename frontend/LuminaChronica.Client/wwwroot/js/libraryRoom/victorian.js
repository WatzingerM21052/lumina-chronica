import * as THREE from "../../lib/three/three.module.min.js";

// The Victorian fittings of the rotunda, built from code where no CC0 model
// fits: gas sconces with tulip glass, pilaster capitals, a marble fireplace
// with a living fire, velvet curtains, a Persian rug, a stained-glass laylight.
// Colours follow the theme (drape colour, brass, wood).

const brassOf = (theme) => new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.brass), metalness: 1, roughness: 0.28 });

// ---------------------------------------------------------------- sconce

// A gas sconce: oval back plate, a curled arm, a tulip shade. Local space:
// the wall at z = 0, the room towards +z. Returns the group and where the
// flame is.
export function sconce(theme) {
    const group = new THREE.Group();
    const brass = brassOf(theme);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 32), brass);
    plate.rotation.x = Math.PI / 2;
    plate.scale.set(1, 1, 1.8);
    plate.position.z = 0.008;
    group.add(plate);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), brass);
    boss.position.z = 0.02;
    group.add(boss);
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, -0.07, 0.1), new THREE.Vector3(0, -0.04, 0.2),
        new THREE.Vector3(0, 0.04, 0.24), new THREE.Vector3(0, 0.1, 0.24),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.011, 8, false), brass));
    // a little scroll under the arm
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 24, Math.PI * 1.5), brass);
    scroll.position.set(0, -0.08, 0.08);
    scroll.rotation.y = Math.PI / 2;
    group.add(scroll);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.018, 0.03, 20), brass);
    cup.position.set(0, 0.115, 0.24);
    group.add(cup);
    // tulip shade: frosted, glowing, open at the top
    const profile = [[0.02, 0], [0.045, 0.02], [0.06, 0.06], [0.058, 0.1], [0.07, 0.14], [0.076, 0.15]].map(([x, y]) => new THREE.Vector2(x, y));
    const glass = new THREE.MeshStandardMaterial({
        color: 0xfff1d8, emissive: 0xffc88a, emissiveIntensity: 1.4, roughness: 0.4,
        transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), glass);
    shade.position.set(0, 0.13, 0.24);
    group.add(shade);
    group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group, flame: new THREE.Vector3(0, 0.2, 0.24), shade };
}

// ---------------------------------------------------------------- capital

// A simple Ionic-ish capital and base for a pilaster `w` wide, `d` deep.
export function capital(w, d, material, gilt) {
    const group = new THREE.Group();
    const add = (bw, bh, bd, y, m = material) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m);
        b.position.y = y;
        b.castShadow = b.receiveShadow = true;
        group.add(b);
    };
    add(w + 0.02, 0.05, d + 0.02, 0);            // necking
    add(w + 0.06, 0.03, d + 0.05, 0.04, gilt);    // gilt astragal
    add(w + 0.14, 0.09, d + 0.1, 0.1);            // echinus
    add(w + 0.2, 0.05, d + 0.14, 0.17);           // abacus
    // volutes
    for (const x of [-1, 1]) {
        const v = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 20), gilt);
        v.position.set(x * (w / 2 + 0.03), 0.09, d / 2 + 0.06);
        group.add(v);
    }
    return group;
}

// ---------------------------------------------------------------- marble

function marbleCanvas(base, vein) {
    const S = 512, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
        g.beginPath();
        let x = Math.random() * S, y = Math.random() * S;
        g.moveTo(x, y);
        for (let k = 0; k < 14; k++) {
            x += (Math.random() - 0.3) * 60; y += (Math.random() - 0.5) * 60;
            g.lineTo(x, y);
        }
        g.strokeStyle = vein; g.globalAlpha = 0.08 + Math.random() * 0.25; g.lineWidth = 0.5 + Math.random() * 2.5;
        g.stroke();
    }
    g.globalAlpha = 1;
    return c;
}

export function marbleMaterial(dark) {
    const t = new THREE.CanvasTexture(marbleCanvas(dark ? "#2a2f2c" : "#e9e3d6", dark ? "#c9c2b0" : "#6d6a63"));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 });
}

// ---------------------------------------------------------------- fire

function fireMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { time: { value: 0 }, seed: { value: Math.random() * 10 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
            uniform float time; uniform float seed; varying vec2 vUv;
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
                return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
            float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
            void main(){
                vec2 uv = vUv;
                float n = fbm(vec2(uv.x * 3.0 + seed, uv.y * 2.0 - time * 1.6));
                float shape = 1.0 - smoothstep(0.0, 0.5, abs(uv.x - 0.5) + uv.y * 0.35);
                float f = clamp(shape * (n * 1.6 - uv.y * 0.9), 0.0, 1.0);
                vec3 col = mix(vec3(0.9, 0.25, 0.02), vec3(1.0, 0.85, 0.45), f);
                gl_FragColor = vec4(col * f * 1.6, f);
            }`,
    });
}

// The fireplace, against the wall: marble surround, mantel, iron fire basket
// with logs and a fire. Local: the wall behind at z = 0, room towards +z.
export function fireplace(theme, { dark }) {
    const group = new THREE.Group();
    const marble = marbleMaterial(dark);
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1714, metalness: 0.6, roughness: 0.5 });
    const soot = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1 });
    const brass = brassOf(theme);
    const box = (w, h, d, m, x, y, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z);
        b.castShadow = b.receiveShadow = true;
        group.add(b);
        return b;
    };
    box(2.0, 0.06, 0.75, marble, 0, 0.03, 0.38);           // hearth
    box(1.2, 1.0, 0.04, soot, 0, 0.56, 0.06);               // back of the firebox
    box(0.04, 1.0, 0.4, soot, -0.6, 0.56, 0.25);
    box(0.04, 1.0, 0.4, soot, 0.6, 0.56, 0.25);
    for (const x of [-1, 1]) {
        box(0.32, 1.06, 0.48, marble, x * 0.76, 0.59, 0.24);  // jambs
        box(0.38, 0.08, 0.52, marble, x * 0.76, 0.1, 0.26);   // plinths
        box(0.36, 0.06, 0.5, marble, x * 0.76, 1.08, 0.25);   // corbel caps
    }
    box(1.22, 0.24, 0.44, marble, 0, 1.0, 0.22);           // frieze
    box(2.06, 0.08, 0.58, marble, 0, 1.18, 0.29);          // mantel shelf
    box(1.24, 0.016, 0.02, brass, 0, 0.885, 0.45);         // brass slip
    // fire basket and logs
    box(0.8, 0.05, 0.32, iron, 0, 0.16, 0.3);
    for (const x of [-0.38, 0.38]) box(0.04, 0.24, 0.04, iron, x, 0.26, 0.45);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2516, roughness: 0.95 });
    [[-0.12, 0.23, 0.32, 0.25], [0.14, 0.23, 0.3, -0.3], [0, 0.31, 0.33, 0.05]].forEach(([x, y, z, r]) => {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.62, 12), logMat);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = r;
        log.position.set(x, y, z);
        log.castShadow = true;
        group.add(log);
    });
    const embers = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.85, toneMapped: false }));
    embers.rotation.x = -Math.PI / 2;
    embers.position.set(0, 0.19, 0.3);
    group.add(embers);
    const flames = [];
    for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6), fireMaterial());
        f.position.set((i - 1.5) * 0.12, 0.5, 0.28 + (i % 2) * 0.05);
        f.rotation.y = (i - 1.5) * 0.35;
        group.add(f);
        flames.push(f);
    }
    return {
        group,
        light: new THREE.Vector3(0, 0.55, 0.6),
        mantelY: 1.22,
        tick: (t) => flames.forEach((f) => { f.material.uniforms.time.value = t; }),
    };
}

// ---------------------------------------------------------------- curtains

// Velvet drapes on both sides of a window, gathered by a tie-back, under a
// pelmet. Local: the window's centre at x = 0, the wall at z = 0.
export function curtains(theme, { width = 1.5, height = 3.85 } = {}) {
    const group = new THREE.Group();
    const colour = new THREE.Color(theme.drape ?? "#6b1f24");
    const velvet = new THREE.MeshPhysicalMaterial({
        color: colour, roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: colour.clone().lerp(new THREE.Color(0xffe0c0), 0.35),
        side: THREE.DoubleSide,
    });
    const tie = 1.15;
    for (const side of [-1, 1]) {
        const w = 0.62;
        const geo = new THREE.PlaneGeometry(w, height, 28, 60);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i) + height / 2;
            // gathered at the tie-back, falling free above and below
            const pinch = 0.32 + 0.68 * Math.min(1, Math.abs(y - tie) / 1.1);
            const u = (x / w + 0.5);
            const nx = side < 0 ? -w / 2 + u * w * pinch : w / 2 - (1 - u) * w * pinch;
            const folds = Math.sin(u * Math.PI * 7) * 0.035 * (0.6 + 0.4 * pinch);
            p.setXYZ(i, nx, y, folds + 0.03);
        }
        geo.computeVertexNormals();
        const drape = new THREE.Mesh(geo, velvet);
        drape.position.x = side * (width / 2 + 0.12);
        drape.castShadow = drape.receiveShadow = true;
        group.add(drape);
        const holder = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 24), brassOf(theme));
        holder.position.set(side * (width / 2 + 0.12 + (side < 0 ? -0.1 : 0.1)), tie, 0.08);
        group.add(holder);
    }
    const pelmet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.75, 0.3, 0.16), velvet);
    pelmet.position.set(0, height + 0.05, 0.08);
    pelmet.castShadow = true;
    group.add(pelmet);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.76, 0.04, 0.17), brassOf(theme));
    fringe.position.set(0, height - 0.11, 0.08);
    group.add(fringe);
    return group;
}

// ---------------------------------------------------------------- rug

export function persianRug(theme, w = 2.6, h = 1.8) {
    const W = 1024, H = Math.round(1024 * h / w), c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const field = new THREE.Color(theme.drape ?? "#6b1f24");
    const hex = (col) => `#${col.getHexString()}`;
    const navy = hex(new THREE.Color(0x1d2a44));
    const cream = "#e8dcc0";
    const gold = hex(new THREE.Color(theme.brass).lerp(new THREE.Color(0xc8a050), 0.5));
    g.fillStyle = navy; g.fillRect(0, 0, W, H);
    g.fillStyle = cream; g.fillRect(28, 28, W - 56, H - 56);
    g.fillStyle = navy; g.fillRect(44, 44, W - 88, H - 88);
    // border motifs
    g.fillStyle = gold;
    for (let x = 70; x < W - 60; x += 46) { g.beginPath(); g.arc(x, 66, 9, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x, H - 66, 9, 0, Math.PI * 2); g.fill(); }
    for (let y = 70; y < H - 60; y += 46) { g.beginPath(); g.arc(66, y, 9, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(W - 66, y, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = hex(field); g.fillRect(92, 92, W - 184, H - 184);
    // field lattice
    g.strokeStyle = hex(field.clone().multiplyScalar(0.6)); g.lineWidth = 3;
    for (let k = -H; k < W; k += 48) { g.beginPath(); g.moveTo(92 + k, 92); g.lineTo(92 + k + H, 92 + H); g.stroke(); g.beginPath(); g.moveTo(92 + k + H, 92); g.lineTo(92 + k, 92 + H); g.stroke(); }
    // central medallion
    g.save(); g.translate(W / 2, H / 2);
    g.fillStyle = navy; g.beginPath(); g.ellipse(0, 0, W * 0.2, H * 0.26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = cream; g.beginPath(); g.ellipse(0, 0, W * 0.15, H * 0.19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = hex(field); g.beginPath(); g.ellipse(0, 0, W * 0.11, H * 0.14, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillStyle = gold; g.beginPath(); g.ellipse(0, -H * 0.1, 10, 28, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    // wear
    for (let i = 0; i < 12000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, envMapIntensity: 0.1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    return rug;
}

// ---------------------------------------------------------------- laylight

// Stained glass for the oculus: radiating leaded panes in the theme's
// colours, a gilt star in the middle; lit from the sky behind.
export function stainedGlass(theme, radius) {
    const S = 1024, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const mid = S / 2;
    const palette = theme.glass ?? ["#b8d4f0", "#f2d58a", "#e8a070", "#9cc49a", "#d8c0e8"];
    const rings = [0.18, 0.42, 0.7, 1.0];
    for (let r = rings.length - 1; r >= 0; r--) {
        const count = 8 * (r + 1);
        for (let i = 0; i < count; i++) {
            const a0 = i / count * Math.PI * 2, a1 = (i + 1) / count * Math.PI * 2;
            g.beginPath();
            g.moveTo(mid + Math.cos(a0) * mid * (r ? rings[r - 1] : 0), mid + Math.sin(a0) * mid * (r ? rings[r - 1] : 0));
            g.arc(mid, mid, mid * rings[r], a0, a1);
            g.lineTo(mid + Math.cos(a1) * mid * (r ? rings[r - 1] : 0), mid + Math.sin(a1) * mid * (r ? rings[r - 1] : 0));
            g.closePath();
            g.fillStyle = palette[(i + r * 2) % palette.length];
            g.fill();
            g.lineWidth = 7; g.strokeStyle = "#2a2018"; g.stroke();
        }
    }
    // gilt star
    g.beginPath();
    for (let i = 0; i < 16; i++) {
        const r = i % 2 ? mid * 0.07 : mid * 0.16, a = i * Math.PI / 8;
        const x = mid + Math.cos(a) * r, y = mid + Math.sin(a) * r;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = theme.brassHi; g.fill(); g.lineWidth = 5; g.strokeStyle = "#2a2018"; g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), new THREE.MeshBasicMaterial({
        map: t, toneMapped: false, color: new THREE.Color(theme.night ? 0x7a86b0 : 0xffffff).multiplyScalar(theme.night ? 0.55 : 1.15), side: THREE.DoubleSide, fog: false,
    }));
    disc.rotation.x = Math.PI / 2;
    return disc;
}
