// Babylon and Alexandria only: whether Home is the immersive journey (the
// default) or the calmer card dashboard. Per device, like the scroll-shelf
// switch in libraryPreferences.js. null = never chosen.
const IMMERSIVE_KEY = "lumina_world_immersive";

export function getImmersive() {
    try {
        const raw = localStorage.getItem(IMMERSIVE_KEY);
        return raw === null ? null : raw === "true";
    } catch {
        return null;
    }
}

export function setImmersive(value) {
    try {
        localStorage.setItem(IMMERSIVE_KEY, String(value));
    } catch {
        // Storage blocked: the choice lasts for this page only.
    }
}
