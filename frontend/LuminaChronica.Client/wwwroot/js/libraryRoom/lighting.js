import * as THREE from "../../lib/three/three.module.min.js";
import { WALL, TIER, slotAngle } from "./rotunda.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The room's light (spec 2026-10-12 library-room §4): daylight or moonlight
// falls through the oculus as a visible beam with drifting dust; candles in
// brass holders on the pilasters flicker (only the four nearest the camera
// burn, to keep the light count small); the oil lamp on the reading table
// glows; a soft light goes with the camera, and the case one stands before
// gets a reading light from its crown. Shadows follow the quality level.
export async function attachLighting(room) {
    const { scene, theme, architecture } = room;
    const group = new THREE.Group();
    group.name = "lighting";
    scene.add(group);

    // The image light only fills; the lamps make the mood.
    const fillOnly = (root) => root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial) m.envMapIntensity = theme.night ? 0.24 : 0.36;
    });
    fillOnly(scene);
    room.base.intensity = theme.night ? 0.1 : 0.16;

    // Oculus: a spot straight down, a beam, dust.
    const sky = new THREE.Color(theme.sky);
    const topY = architecture.oculusY + 0.3;
    const skylight = new THREE.SpotLight(sky, (theme.night ? 260 : 900) * theme.skyIntensity, 0, 0.42, 0.75, 1.6);
    skylight.position.set(0, topY, 0);
    skylight.target.position.set(0.6, 0, -0.4);
    group.add(skylight, skylight.target);

    const beamHeight = topY - 0.05;
    const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 2.6, beamHeight, 48, 1, true),
        new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            uniforms: { colour: { value: sky.clone() }, strength: { value: theme.night ? 0.05 : 0.085 } },
            vertexShader: "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
            fragmentShader: "uniform vec3 colour; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 1.5); float fade = smoothstep(0.0, 0.85, vY); gl_FragColor = vec4(colour * strength * (1.0 - edge) * fade, 1.0); }",
        }));
    beam.position.set(0.3, beamHeight / 2, -0.2);
    beam.rotation.z = 0.06;
    group.add(beam);

    const dustCount = 320;
    const dustGeo = new THREE.BufferGeometry();
    const seeds = new Float32Array(dustCount * 4);
    for (let i = 0; i < dustCount; i++) {
        seeds.set([Math.random(), Math.random(), Math.random() * Math.PI * 2, 0.4 + Math.random() * 0.6], i * 4);
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(dustCount * 3), 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
        color: sky.clone().lerp(new THREE.Color(0xffffff), 0.4), size: 0.018, transparent: true, opacity: theme.night ? 0.25 : 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    group.add(dust);
    const placeDust = (t) => {
        const p = dustGeo.attributes.position.array;
        for (let i = 0; i < dustCount; i++) {
            const [u, v, phase, speed] = seeds.subarray(i * 4, i * 4 + 4);
            const y = ((v + t * 0.012 * speed) % 1) * beamHeight;
            const r = (1.0 + (2.6 - 1.0) * (1 - y / beamHeight)) * Math.sqrt(u) * 0.9;
            const a = phase + t * 0.05 * speed;
            p[i * 3] = 0.3 + Math.cos(a) * r;
            p[i * 3 + 1] = beamHeight - y;
            p[i * 3 + 2] = -0.2 + Math.sin(a) * r;
        }
        dustGeo.attributes.position.needsUpdate = true;
    };
    placeDust(0);

    // Reading lamp on the table.
    const lamp = new THREE.PointLight(0xffb36a, 3.2, 6, 2);
    lamp.position.copy(architecture.lamp).add(new THREE.Vector3(0, 0.12, 0));
    group.add(lamp);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
    flame.position.copy(architecture.lamp);
    group.add(flame);

    // Candles on every second pilaster (floor tier), brass holders.
    const candles = [];
    const slots = architecture.slots;
    for (let i = 0; i < slots; i += 2) {
        const a = slotAngle(i + 0.5, slots);
        const r = WALL - 0.42;
        const pos = new THREE.Vector3(Math.sin(a) * r, TIER - 0.5, -Math.cos(a) * r);
        const holder = await room.assets.place("brass_candleholders", 0.34, "height");
        if (holder) {
            holder.position.copy(pos).setY(TIER - 0.82);
            holder.rotation.y = -a;
            group.add(holder);
        }
        // a wrought bracket from the pilaster to the holder
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.34), new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.brassLo), metalness: 1, roughness: 0.45 }));
        bracket.position.set(Math.sin(a) * (WALL - 0.3), TIER - 0.84, -Math.cos(a) * (WALL - 0.3));
        bracket.rotation.y = -a;
        group.add(bracket);
        const light = new THREE.PointLight(0xffa955, 0, 5.5, 2);
        light.position.copy(pos);
        group.add(light);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffcf8a, toneMapped: false }));
        glow.position.copy(pos);
        group.add(glow);
        candles.push({ light, glow, pos, phase: Math.random() * 10 });
    }
    fillOnly(group);

    // Goes with the camera; the case in front gets a reading light.
    const companion = new THREE.PointLight(0xffe2bd, 1.4, 4, 2);
    group.add(companion);
    const caseLight = new THREE.SpotLight(0xffd7a8, 0, 4.5, 0.9, 0.8, 1.6);
    group.add(caseLight, caseLight.target);

    const applyQuality = (q) => {
        room.renderer.shadowMap.enabled = q.shadowLights > 0;
        skylight.castShadow = q.shadowLights >= 1;
        skylight.shadow.mapSize.set(q.shadowSize || 512, q.shadowSize || 512);
        skylight.shadow.bias = -0.0004;
        skylight.shadow.radius = 4;
        lamp.castShadow = q.shadowLights >= 2;
        lamp.shadow.mapSize.set(512, 512);
        caseLight.castShadow = q.shadowLights >= 3;
        caseLight.shadow.mapSize.set(1024, 1024);
        caseLight.shadow.bias = -0.0006;
        dust.visible = q.level !== "low" && !reduceMotion();
        room.renderer.shadowMap.needsUpdate = true;
        scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
        room.wake(200);
    };
    room.applyQuality = applyQuality;
    applyQuality(room.quality);

    let lastCandle = 0;
    room.onFrame((now) => {
        const cam = room.camera.position;
        const still = reduceMotion();
        // companion light half a metre ahead of the eye
        const ahead = new THREE.Vector3(0, 0, -0.5).applyQuaternion(room.camera.quaternion);
        companion.position.copy(cam).add(ahead);
        const state = room.cameraState;
        const entry = state?.mode === "case" ? room.cases[state.caseIndex] : null;
        companion.intensity = entry ? 2.2 : 1.2;
        if (entry) {
            const top = entry.center.clone().addScaledVector(entry.normal, 0.55);
            top.y = entry.center.y + 1.45;
            caseLight.position.copy(top);
            caseLight.target.position.copy(entry.center).setY(entry.center.y - 0.2);
            caseLight.intensity += (5.5 - caseLight.intensity) * 0.15;
        } else {
            caseLight.intensity *= 0.85;
        }
        // candles: the four nearest burn, flicker at ~20 fps
        if (now - lastCandle > 50) {
            lastCandle = now;
            const t = now / 1000;
            const near = candles.map((c) => ({ c, d: c.pos.distanceToSquared(cam) })).sort((a, b) => a.d - b.d);
            near.forEach(({ c }, i) => {
                const on = i < 4;
                const flicker = still ? 1 : 1 + Math.sin(t * 9 + c.phase) * 0.08 + Math.sin(t * 23 + c.phase * 2) * 0.05 + Math.sin(t * 51 + c.phase) * 0.03;
                c.light.intensity = on ? (theme.night ? 3.4 : 2.6) * flicker : 0;
                c.glow.scale.setScalar(still ? 1 : flicker);
            });
            lamp.intensity = 3.2 * (still ? 1 : 1 + Math.sin(t * 7) * 0.03);
            if (dust.visible) placeDust(t);
        }
        return Math.abs(caseLight.intensity - (entry ? 5.5 : 0)) > 0.05;
    });

    room.disposeLighting = () => { scene.remove(group); };
}
