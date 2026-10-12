import * as THREE from "../../lib/three/three.module.min.js";
import { GLTFLoader } from "../../lib/three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "../../lib/three/addons/loaders/RGBELoader.js";

const BASE = new URL("../../assets/library-room/", import.meta.url).href;

// Loads the room's CC0 assets (tools/library-room) once per room. A failure
// yields a plain stand-in (null model, colour-only material) and a single
// warning -- never a broken room.
export function createAssets(renderer) {
    const cache = new Map();
    const textures = new THREE.TextureLoader();
    const gltf = new GLTFLoader();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const owned = new Set();
    const warned = new Set();
    const warn = (what, error) => {
        if (warned.has(what)) return;
        warned.add(what);
        console.warn("[library-room] asset", what, error ?? "");
    };
    const once = (key, load) => {
        if (!cache.has(key)) cache.set(key, load());
        return cache.get(key);
    };
    const image = (url) => once(`i:${url}`, () => new Promise((resolve) =>
        textures.load(url, resolve, undefined, () => resolve(null))));

    // A texture set with its own repeat (each call gets its own texture
    // objects; the image is shared).
    async function texture(url, repeat, srgb) {
        const base = await image(url);
        if (!base) return null;
        const t = base.clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat[0], repeat[1]);
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.needsUpdate = true;
        owned.add(t);
        return t;
    }

    return {
        model: (id) => once(`m:${id}`, () => gltf.loadAsync(`${BASE}models/${id}.glb`)
            .then((g) => {
                g.scene.traverse((o) => {
                    if (!o.isMesh) return;
                    o.castShadow = o.receiveShadow = true;
                });
                return g.scene;
            })
            .catch((e) => { warn(id, e); return null; })),
        // A copy of a model, scaled so its largest horizontal side or its
        // height (`fit: "height"`) is `size` metres, standing on y = 0.
        place: async function (id, size, fit = "width") {
            const source = await this.model(id);
            if (!source) return null;
            const object = source.clone(true);
            const box = new THREE.Box3().setFromObject(object);
            const dims = box.getSize(new THREE.Vector3());
            const k = size / (fit === "height" ? dims.y : Math.max(dims.x, dims.z));
            object.scale.setScalar(k);
            object.position.y = -box.min.y * k;
            const wrapper = new THREE.Group();
            wrapper.add(object);
            return wrapper;
        },
        material: async (id, { repeat = [1, 1], tint, roughness = 1 } = {}) => {
            const [map, normalMap, arm] = await Promise.all([
                texture(`${BASE}textures/${id}_diff.webp`, repeat, true),
                texture(`${BASE}textures/${id}_nor.webp`, repeat, false),
                texture(`${BASE}textures/${id}_arm.webp`, repeat, false),
            ]);
            if (!map) warn(id, "missing texture");
            return new THREE.MeshStandardMaterial({
                map, normalMap, roughnessMap: arm, aoMap: arm,
                roughness, metalness: 0,
                color: tint ? new THREE.Color(tint) : new THREE.Color(0xffffff),
            });
        },
        environment: (id) => once(`h:${id}`, () => new RGBELoader().loadAsync(`${BASE}hdri/${id}_1k.hdr`)
            .then((hdr) => {
                const env = pmrem.fromEquirectangular(hdr).texture;
                hdr.dispose();
                owned.add(env);
                return env;
            })
            .catch((e) => { warn(id, e); return null; })),
        dispose: () => {
            owned.forEach((t) => t.dispose());
            pmrem.dispose();
            cache.clear();
        },
    };
}
