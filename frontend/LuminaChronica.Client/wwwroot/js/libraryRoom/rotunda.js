import * as THREE from "../../lib/three/three.module.min.js";
import { medallion, readingCorner } from "./furnishings.js";
import { buildDome } from "./dome.js";
import { buildWalls } from "./walls.js";

// The rotunda (spec 2026-10-12 library-room §3.2): a round reading room with
// a ring of twelve places per tier. Bookcases stand in the places the plan
// fills; the free places on the floor become tall arched windows with a
// piece of decor before them; a gallery with a brass railing carries the
// next tier; a coffered dome with an open oculus closes the room. In the
// middle an inlaid compass rose takes the light from the oculus; a reading
// corner stands to one side. Units: metres, y up, floor at 0,
// place 0 straight ahead (-z), clockwise seen from above.
export const R = 5.6;            // bookcase fronts stand on this circle
export const WALL = R + 0.45;    // the wall behind them
export const TIER = 3.3;         // height of one tier
export const CASE = { width: 1.7, height: 2.55, depth: 0.38 };
const GALLERY = 1.25;            // depth of a gallery walk
const OCULUS = 1.1;              // radius of the opening in the dome

export const slotAngle = (slot, slots) => slot * (Math.PI * 2 / slots);

// Where a place is and where it faces (towards the middle).
export function slotFrame(slot, tier, slots) {
    const a = slotAngle(slot, slots);
    const position = new THREE.Vector3(Math.sin(a) * R, tier * TIER, -Math.cos(a) * R);
    const normal = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    return { angle: a, position, normal, rotationY: -a };
}

export async function buildRotunda(room, data) {
    const { assets, theme } = room;
    const tiers = Math.max(1, data.tiers);
    const slots = data.slots;
    const wallHeight = tiers * TIER + 0.7;
    const group = new THREE.Group();
    group.name = "rotunda";

    const woodTint = new THREE.Color(theme.wood).multiplyScalar(2.6);
    const wallTint = theme.key.includes("light") || theme.key === "alexandria"
        ? new THREE.Color(0xf2ece0)
        : new THREE.Color(theme.wood).lerp(new THREE.Color(0xe8dcc4), 0.55);
    const [floor, wall, rug, wood] = await Promise.all([
        assets.material(theme.floor, { repeat: [(R + 0.6) * 2 / 1.6, (R + 0.6) * 2 / 1.6] }),
        assets.material(theme.wall, { repeat: [Math.round(2 * Math.PI * WALL / 2.4), wallHeight / 2.4], tint: wallTint }),
        assets.material(theme.rug, { repeat: [3, 3], tint: new THREE.Color(theme.wood).lerp(new THREE.Color(0x5a2420), 0.55).multiplyScalar(0.5) }),
        assets.material("walnut_veneer", { repeat: [1, 2], tint: woodTint, roughness: 0.8 }),
    ]);
    const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.brass), metalness: 1, roughness: 0.32 });
    const add = (mesh, receive = true, cast = false) => {
        mesh.receiveShadow = receive;
        mesh.castShadow = cast;
        group.add(mesh);
        return mesh;
    };

    // Floor, with the compass rose in the middle.
    const floorMesh = add(new THREE.Mesh(new THREE.CircleGeometry(WALL + 0.1, 96), floor));
    floorMesh.rotation.x = -Math.PI / 2;
    group.add(medallion(theme, 1.0));

    // Wall, skirting and cornice.
    add(new THREE.Mesh(new THREE.CylinderGeometry(WALL, WALL, wallHeight, 96, 1, true), wall)).position.y = wallHeight / 2;
    group.children.at(-1).material.side = THREE.BackSide;
    const ring = (radius, tube, y, material) => {
        const m = add(new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 128), material), true, false);
        m.rotation.x = Math.PI / 2;
        m.position.y = y;
        return m;
    };
    ring(WALL - 0.02, 0.09, 0.09, wood);
    ring(WALL - 0.06, 0.16, wallHeight, wood);
    ring(WALL - 0.16, 0.035, wallHeight - 0.16, brass);

    // Pilasters between the places, up the full height.
    for (let i = 0; i < slots; i++) {
        const a = slotAngle(i + 0.5, slots);
        const p = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, wallHeight, 0.3), wood), true, true);
        p.position.set(Math.sin(a) * (WALL - 0.12), wallHeight / 2, -Math.cos(a) * (WALL - 0.12));
        p.rotation.y = -a;
        const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.36), brass));
        cap.position.set(p.position.x, TIER - 0.35, p.position.z);
        cap.rotation.y = -a;
    }

    // Galleries: a walk and a railing for every tier above the floor.
    const railMaterial = brass;
    for (let t = 1; t < tiers; t++) {
        const y = t * TIER;
        const inner = R - GALLERY;
        const deck = add(new THREE.Mesh(new THREE.RingGeometry(inner, WALL, 128, 1), wood), true, true);
        deck.rotation.x = -Math.PI / 2;
        deck.position.y = y;
        const edge = add(new THREE.Mesh(new THREE.CylinderGeometry(inner, inner, 0.22, 128, 1, true), wood), true, true);
        edge.position.y = y - 0.11;
        const rail = new THREE.TorusGeometry(inner + 0.05, 0.03, 8, 160);
        const top = add(new THREE.Mesh(rail, railMaterial));
        top.rotation.x = Math.PI / 2;
        top.position.y = y + 1.0;
        const count = Math.round(2 * Math.PI * inner / 0.2);
        const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6), railMaterial, count);
        const m = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
            const a = i / count * Math.PI * 2;
            m.makeTranslation(Math.sin(a) * (inner + 0.05), y + 0.5, -Math.cos(a) * (inner + 0.05));
            posts.setMatrixAt(i, m);
        }
        posts.castShadow = true;
        group.add(posts);
    }

    // Coffered dome with the open oculus and the sky above it.
    const caseSlots = new Set(data.cases.filter((c) => c.tier === 0).map((c) => Math.round(c.angle / (360 / slots))));
    const windowSlots = new Set([...Array(slots).keys()].filter((i) => !caseSlots.has(i)));
    const finish = buildWalls(room, { radius: WALL, slots, wallHeight, wood, brass, windowSlots });
    group.add(finish.group);
    const domeParts = buildDome(room, { radius: WALL, baseY: finish.domeBase, oculus: OCULUS, wallTint });
    group.add(domeParts.group);
    ring(OCULUS + 0.02, 0.06, domeParts.topY - 0.02, brass);
    const sky = new THREE.Color(theme.sky);

    // Free places on the floor: tall arched windows, decor before them.
    const used = new Set(data.cases.filter((c) => c.tier === 0).map((c) => Math.round(c.angle / (360 / slots))));
    // Glass: a soft sky -- brighter low (the light outside), leaded panes.
    const glassCanvas = document.createElement("canvas");
    glassCanvas.width = 128; glassCanvas.height = 256;
    {
        const g = glassCanvas.getContext("2d");
        // frosted panes: bright, a little brighter towards the sky, with
        // small leaded rectangles and a faint mottle
        const top = sky.clone().multiplyScalar(theme.night ? 0.4 : 1.05), low = sky.clone().multiplyScalar(theme.night ? 0.28 : 0.82);
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, `#${top.getHexString()}`); grad.addColorStop(1, `#${low.getHexString()}`);
        g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
        for (let i = 0; i < 900; i++) {
            g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
            g.fillRect(Math.random() * 128, Math.random() * 256, 3, 3);
        }
        g.strokeStyle = "rgba(60,45,30,.45)"; g.lineWidth = 1.2;
        for (let y = 0; y <= 256; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
        for (let x = 0; x <= 128; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    }
    const glassMap = new THREE.CanvasTexture(glassCanvas);
    glassMap.colorSpace = THREE.SRGBColorSpace;
    const glass = new THREE.MeshBasicMaterial({ map: glassMap, toneMapped: false });
    const frame = wood;
    const windows = [];
    let propIndex = 0;
    for (let slot = 0; slot < slots; slot++) {
        if (used.has(slot)) continue;
        const f = slotFrame(slot, 0, slots);
        const w = new THREE.Group();
        const pane = new THREE.Shape();
        pane.moveTo(-0.6, 0);
        pane.lineTo(0.6, 0);
        pane.lineTo(0.6, 2.3);
        pane.absarc(0, 2.3, 0.6, 0, Math.PI, false);
        pane.lineTo(-0.6, 0);
        const glassMesh = new THREE.Mesh(new THREE.ShapeGeometry(pane, 24), glass);
        w.add(glassMesh);
        // mullions and transom
        for (const x of [-0.2, 0.2]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.9, 0.05), frame);
            bar.position.set(x, 1.45, 0.02);
            w.add(bar);
        }
        const transom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), frame);
        transom.position.set(0, 2.3, 0.02);
        w.add(transom);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.32), wood);
        sill.position.set(0, -0.04, 0.12);
        sill.castShadow = sill.receiveShadow = true;
        w.add(sill);
        w.position.set(Math.sin(f.angle) * (WALL - 0.03), 0.9, -Math.cos(f.angle) * (WALL - 0.03));
        w.rotation.y = f.rotationY;
        group.add(w);
        windows.push({ slot, frame: f });
    }

    // Decor before the windows (on a small pedestal), cycling the theme's props.
    const decor = [];
    for (const { frame: f } of windows) {
        // the clock stands against a wall, not before glass
        const props = theme.props.filter((p) => p !== "vintage_grandfather_clock_01");
        const id = props[propIndex++ % props.length];
        const tall = id === "vintage_grandfather_clock_01";
        decor.push((async () => {
            const object = await assets.place(id, tall ? 2.1 : id === "marble_bust_01" ? 0.62 : 0.45, "height");
            if (!object) return;
            let base = 0;
            if (!tall) {
                const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.0, 32), wood);
                pedestal.position.y = 0.5;
                pedestal.castShadow = pedestal.receiveShadow = true;
                const holder = new THREE.Group();
                holder.add(pedestal);
                object.position.y += 1.0;
                holder.add(object);
                base = 1.0;
                holder.position.copy(f.position).addScaledVector(f.normal, -0.05);
                holder.rotation.y = f.rotationY;
                group.add(holder);
                return;
            }
            object.position.copy(f.position).addScaledVector(f.normal, -0.1);
            object.position.y = base;
            object.rotation.y = f.rotationY;
            group.add(object);
        })());
    }

    // The reading corner behind where one starts (one turns round to it),
    // between two places and inside the circle the camera keeps to before
    // a case.
    const corner = readingCorner(room, { angle: Math.PI * 165 / 180, radius: 1.95, rugMaterial: rug }).then((c) => { group.add(c.group); return c; });

    const [table] = await Promise.all([corner, ...decor]);
    return {
        group,
        tiers,
        slots,
        wallHeight,
        oculusY: domeParts.topY,
        sky: domeParts,
        lamp: table.lamp,
        candle: table.candle,
        windows,
        floorY: (tier) => tier * TIER,
    };
}
