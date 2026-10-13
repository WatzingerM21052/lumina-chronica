import * as THREE from "../../lib/three/three.module.min.js";

// The dome: coffers in rings that shrink towards the top (as on the
// Pantheon), each with a gilt rosette, and the open oculus with the sky
// above it -- drifting clouds by day, stars by night.

function cofferCanvas(theme, wallTint) {
    const S = 256, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const base = `#${wallTint.getHexString()}`;
    const deep = `#${wallTint.clone().multiplyScalar(0.62).getHexString()}`;
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    // stepped recess: three frames, each a little darker
    const steps = [[18, 0.88], [34, 0.76], [50, 0.66]];
    for (const [inset, k] of steps) {
        g.fillStyle = `#${wallTint.clone().multiplyScalar(k).getHexString()}`;
        g.fillRect(inset, inset, S - inset * 2, S - inset * 2);
    }
    // light from below: the lower edges of each step catch it
    g.fillStyle = "rgba(255,240,215,.18)";
    for (const [inset] of steps) g.fillRect(inset, S - inset - 4, S - inset * 2, 4);
    g.fillStyle = deep; g.fillRect(64, 64, S - 128, S - 128);
    // rosette
    g.save(); g.translate(S / 2, S / 2);
    for (let i = 0; i < 8; i++) {
        g.rotate(Math.PI / 4);
        g.beginPath(); g.ellipse(0, -16, 6, 16, 0, 0, Math.PI * 2);
        g.fillStyle = theme.brass; g.fill();
    }
    g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fillStyle = theme.brassHi; g.fill();
    g.restore();
    return c;
}

export function buildDome({ theme, renderer }, { radius, baseY, oculus, wallTint, rows = 5, perRow = 24 }) {
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
        new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.5, roughness: 0.85, side: THREE.BackSide }));
    dome.position.y = baseY;
    dome.receiveShadow = true;
    group.add(dome);

    // Sky above the oculus.
    const topY = baseY + Math.sqrt(radius * radius - oculus * oculus);
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

    // a short drum round the oculus (the light shaft's throat)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(oculus + 0.02, oculus + 0.02, 0.45, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: wallTint.clone().multiplyScalar(0.8), roughness: 0.9, side: THREE.BackSide }));
    drum.position.y = topY + 0.2;
    group.add(drum);

    return { group, topY, tick: (t) => { sky.material.uniforms.time.value = t; } };
}
