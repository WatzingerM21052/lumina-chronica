import * as THREE from "../../lib/three/three.module.min.js";
import { stainedGlass } from "./victorian.js";

// The dome: coffers in rings that shrink towards the top (as on the
// Pantheon), each with a gilt rosette, and the open oculus with the sky
// above it -- drifting clouds by day, stars by night.

function cofferCanvas(theme, wallTint) {
    // one coffer at 512 px: gilt fillet round it, an egg-and-dart moulding,
    // three stepped recesses with a bead row, a layered gilt rosette
    const S = 512, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const col = (k) => `#${wallTint.clone().multiplyScalar(k).getHexString()}`;
    const gold = theme.brass, goldHi = theme.brassHi, goldLo = theme.brassLo;
    g.fillStyle = col(1); g.fillRect(0, 0, S, S);
    g.fillStyle = gold; g.fillRect(0, 0, S, 6); g.fillRect(0, 0, 6, S);
    // egg-and-dart
    g.fillStyle = col(0.82); g.fillRect(26, 26, S - 52, 34); g.fillRect(26, 26, 34, S - 52); g.fillRect(26, S - 60, S - 52, 34); g.fillRect(S - 60, 26, 34, S - 52);
    const egg = (x, y, rot) => {
        g.save(); g.translate(x, y); g.rotate(rot);
        g.fillStyle = col(1.08); g.beginPath(); g.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = goldLo; g.beginPath(); g.moveTo(14, -10); g.lineTo(17, 0); g.lineTo(14, 10); g.fill();
        g.restore();
    };
    for (let p = 48; p < S - 40; p += 34) { egg(p, 43, 0); egg(p, S - 43, Math.PI); egg(43, p, -Math.PI / 2); egg(S - 43, p, Math.PI / 2); }
    // stepped recesses
    [[64, 0.9], [84, 0.8], [104, 0.7]].forEach(([inset, k]) => { g.fillStyle = col(k); g.fillRect(inset, inset, S - inset * 2, S - inset * 2); });
    g.fillStyle = "rgba(255,240,215,.22)"; g.fillRect(64, S - 70, S - 128, 6); g.fillRect(84, S - 90, S - 168, 5);
    // bead row
    g.fillStyle = gold;
    for (let p = 118; p < S - 112; p += 14) { for (const [x, y] of [[p, 112], [p, S - 112], [112, p], [S - 112, p]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); } }
    g.fillStyle = col(0.6); g.fillRect(124, 124, S - 248, S - 248);
    // rosette: two rings of petals, a boss
    g.save(); g.translate(S / 2, S / 2);
    for (const [n, len, wid, fill] of [[12, 62, 15, goldLo], [8, 44, 13, gold], [8, 26, 9, goldHi]]) {
        for (let i = 0; i < n; i++) {
            g.rotate(Math.PI * 2 / n);
            g.beginPath(); g.ellipse(0, -len / 2, wid, len / 2, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
        }
        g.rotate(Math.PI / n);
    }
    g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fillStyle = goldHi; g.fill();
    g.restore();
    return c;
}

// `flat` < 1 makes a shallower dome than a half sphere (a saucer dome over
// a drum reads more like a reading room than a tall bell).
export function buildDome({ theme, renderer }, { radius, baseY, oculus, wallTint, flat = 0.55, rows = 6, perRow = 24 }) {
    const group = new THREE.Group();
    const thetaStart = Math.asin(oculus / radius);
    const canvas = cofferCanvas(theme, wallTint);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(perRow, rows);
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bump = new THREE.CanvasTexture(canvas);
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(perRow, rows);
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 128, 48, 0, Math.PI * 2, thetaStart, Math.PI / 2 - thetaStart),
        new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.6, side: THREE.BackSide }));
    dome.position.y = baseY;
    dome.scale.y = flat;
    dome.receiveShadow = true;
    group.add(dome);

    // gilt rings: at the springing and a third of the way up
    const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.brass), metalness: 1, roughness: 0.3 });
    for (const k of [0.04, 0.42]) {
        const y = Math.sin(k * Math.PI / 2) * radius;
        const r = Math.cos(k * Math.PI / 2) * radius - 0.06;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 160), gold);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = baseY + y * flat;
        group.add(ring);
    }

    // Sky above the oculus.
    const topY = baseY + Math.sqrt(radius * radius - oculus * oculus) * flat;
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(oculus * 3, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, fog: false,
            uniforms: {
                zenith: { value: new THREE.Color(theme.night ? 0x070b1c : 0x9cbfe4) },
                horizon: { value: new THREE.Color(theme.night ? 0x1b2340 : 0xe9dcc4) },
                night: { value: theme.night ? 1 : 0 },
                time: { value: 0 },
            },
            vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
            fragmentShader: `
                uniform vec3 zenith; uniform vec3 horizon; uniform float night; uniform float time; varying vec3 vDir;
                float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
                float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
                void main(){
                    float h = clamp(vDir.y, 0.0, 1.0);
                    vec3 col = mix(horizon, zenith, pow(h, 0.6));
                    vec2 uv = vDir.xz / max(vDir.y, 0.15) * 3.2;
                    if (night < 0.5) {
                        float cl = smoothstep(0.4, 0.75, fbm(uv + vec2(time * 0.02, time * 0.007)));
                        col = mix(col, vec3(1.0, 0.98, 0.95), cl * 0.9);
                    } else {
                        float s = step(0.9965, hash(floor(uv * 90.0)));
                        float tw = 0.6 + 0.4 * sin(time * 2.0 + hash(floor(uv * 90.0)) * 40.0);
                        col += vec3(s * tw * 0.9);
                        float mist = fbm(uv * 0.7 + time * 0.003) * 0.12;
                        col += vec3(0.15, 0.18, 0.3) * mist;
                    }
                    gl_FragColor = vec4(col * 1.25, 1.0);
                }`,
        }));
    sky.position.y = topY - 0.05;
    group.add(sky);

    // a stained-glass laylight in the oculus, lit by the sky above
    const glass = stainedGlass(theme, oculus + 0.02);
    glass.position.y = topY + 0.02;
    group.add(glass);

    // a short drum round the oculus (the light shaft's throat)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(oculus + 0.02, oculus + 0.02, 0.45, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: wallTint.clone().multiplyScalar(0.8), roughness: 0.9, side: THREE.BackSide }));
    drum.position.y = topY + 0.2;
    group.add(drum);

    return { group, topY, tick: (t) => { sky.material.uniforms.time.value = t; } };
}
