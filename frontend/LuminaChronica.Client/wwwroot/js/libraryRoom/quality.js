// Picks how much the scene may cost on this device and lowers it when the
// frame rate stays low (spec §3.2).
export function chooseQuality(renderer) {
    const gl = renderer.getContext();
    const mobile = matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/.test(navigator.userAgent);
    const memory = navigator.deviceMemory ?? 4;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const level = mobile || memory <= 2 || maxTex < 8192 ? "low" : memory <= 4 ? "medium" : "high";
    return settings(level);
}

export function settings(level) {
    return {
        level,
        pixelRatio: Math.min(window.devicePixelRatio || 1, level === "high" ? 2 : level === "medium" ? 1.5 : 1),
        shadowSize: level === "high" ? 2048 : level === "medium" ? 1024 : 0,
        shadowLights: level === "high" ? 3 : level === "medium" ? 1 : 0,
        antialias: level !== "low",
    };
}

// Average over ~2 s of continuous rendering; below 40 fps step down once
// per 4 s, never below "low".
export function watchFps(room, onDowngrade) {
    let frames = 0, since = performance.now(), last = 0;
    room.onFrame((now) => {
        frames++;
        if (now - since < 2000) return;
        const fps = frames * 1000 / (now - since);
        frames = 0; since = now;
        if (fps < 40 && room.quality.level !== "low" && now - last > 4000) {
            last = now;
            onDowngrade(settings(room.quality.level === "high" ? "medium" : "low"));
        }
    });
}
