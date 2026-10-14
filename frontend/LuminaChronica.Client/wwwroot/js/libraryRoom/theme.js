// The room in the theme's dress (spec 2026-10-12 library-room §1: same
// architecture, the theme's materials, light and decor). Colours come from
// the --shelf-* tokens; the table picks textures, sky and props per theme.
const TABLE = {
    "classic-library": { floor: "herringbone_parquet", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffe2b0, skyIntensity: 1.0, night: false, props: ["vintage_grandfather_clock_01", "marble_bust_01", "fern_02"], drape: "#6b1f24", glass: ["#c9dcef", "#f0d58c", "#d98a5a", "#8fb38c", "#e6cfa0"] },
    "dark-library": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0x9fb4ff, skyIntensity: 0.55, night: true, props: ["marble_bust_01", "Lantern_01", "vintage_grandfather_clock_01"], drape: "#3a1420", glass: ["#5b6fa8", "#c9a64a", "#8a3a3a", "#3f6b5a", "#b8a0d0"] },
    "skriptorium": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffd8a0, skyIntensity: 0.9, night: false, props: ["Lantern_01", "fern_02", "vintage_grandfather_clock_01"], drape: "#5a3a1e", glass: ["#e6cf8a", "#c9874a", "#9cb07a", "#f0e2b8", "#b86a3a"] },
    "alexandria": { floor: "marble_tiles", wall: "white_stucco", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0xfff0d0, skyIntensity: 1.2, night: false, props: ["marble_bust_01", "fern_02", "Lantern_01"], drape: "#8a6a2a", glass: ["#f2e2b0", "#d9b46a", "#9cc0d8", "#e8c890", "#c88a5a"] },
    "babylon": { floor: "blue_floor_tiles_01", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffd9a0, skyIntensity: 1.1, night: false, props: ["fern_02", "Lantern_01", "marble_bust_01"], drape: "#1f3a6b", glass: ["#3a6ab8", "#f0c060", "#2a9a9a", "#e8d8a8", "#5a8ad8"] },
    "ischtar": { floor: "blue_floor_tiles_01", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0xa8b8ff, skyIntensity: 0.55, night: true, props: ["Lantern_01", "fern_02", "marble_bust_01"], drape: "#2a2050", glass: ["#4a5ab8", "#d8b050", "#7a4aa8", "#3a8a9a", "#c0c8f0"] },
    "abendhafen": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffb27a, skyIntensity: 0.85, night: false, props: ["Lantern_01", "vintage_grandfather_clock_01", "fern_02"], drape: "#6a3a20", glass: ["#f0b070", "#d87a4a", "#7aa0c0", "#f0d8a0", "#b85a3a"] },
    "daemmergarten": { floor: "herringbone_parquet", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffc8a0, skyIntensity: 0.8, night: false, props: ["Lantern_01", "marble_bust_01", "fern_02"], drape: "#2d4a2b", glass: ["#9cc48a", "#e8c880", "#d89070", "#bcd8a8", "#c8a0c8"] },
    "nachtgarten": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0x9fc4ff, skyIntensity: 0.5, night: true, props: ["Lantern_01", "marble_bust_01", "vintage_grandfather_clock_01"], drape: "#1d3b2a", glass: ["#4a7a5a", "#c0a050", "#3a5a8a", "#8ab0a0", "#b8c8e8"] },
    "modern-light": { floor: "herringbone_parquet", wall: "white_stucco", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xfff6e8, skyIntensity: 1.4, night: false, props: ["marble_bust_01", "fern_02", "vintage_grandfather_clock_01"], drape: "#8a7a6a", glass: ["#dce8f0", "#f0e0b0", "#e8c8a8", "#c8dcc8", "#f4f0e8"] },
};
TABLE["system-light"] = TABLE["modern-light"];
TABLE["system-dark"] = TABLE["dark-library"];

export function themeKey() {
    let key = document.documentElement.dataset.theme || "classic-library";
    if (key === "system") key = matchMedia("(prefers-color-scheme: dark)").matches ? "system-dark" : "system-light";
    return TABLE[key] ? key : "classic-library";
}

export function readTheme() {
    const key = themeKey();
    const s = getComputedStyle(document.documentElement);
    const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    return {
        key,
        ...TABLE[key],
        wood: get("--shelf-wood", "#3a2315"),
        brass: get("--shelf-brass", "#d2ab52"),
        brassHi: get("--shelf-brass-hi", "#f1d995"),
        brassLo: get("--shelf-brass-lo", "#9c7428"),
        ink: get("--shelf-plaque-ink", "#2b1a08"),
        light: get("--shelf-light", "rgba(255,190,110,.22)"),
    };
}
