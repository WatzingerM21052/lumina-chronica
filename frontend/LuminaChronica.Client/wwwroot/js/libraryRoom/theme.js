// The room in the theme's dress (spec 2026-10-12 library-room §1: same
// architecture, the theme's materials, light and decor). Colours come from
// the --shelf-* tokens; the table picks textures, sky and props per theme.
const TABLE = {
    "classic-library": { floor: "herringbone_parquet", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffe2b0, skyIntensity: 1.0, night: false, props: ["vintage_grandfather_clock_01", "marble_bust_01", "brass_candleholders"] },
    "dark-library": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0x9fb4ff, skyIntensity: 0.55, night: true, props: ["marble_bust_01", "Lantern_01", "vintage_grandfather_clock_01"] },
    "skriptorium": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffd8a0, skyIntensity: 0.9, night: false, props: ["Lantern_01", "brass_candleholders", "vintage_grandfather_clock_01"] },
    "alexandria": { floor: "marble_tiles", wall: "white_stucco", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0xfff0d0, skyIntensity: 1.2, night: false, props: ["marble_bust_01", "brass_candleholders", "Lantern_01"] },
    "babylon": { floor: "blue_floor_tiles_01", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffd9a0, skyIntensity: 1.1, night: false, props: ["brass_candleholders", "Lantern_01", "marble_bust_01"] },
    "ischtar": { floor: "blue_floor_tiles_01", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0xa8b8ff, skyIntensity: 0.55, night: true, props: ["Lantern_01", "brass_candleholders", "marble_bust_01"] },
    "abendhafen": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffb27a, skyIntensity: 0.85, night: false, props: ["Lantern_01", "vintage_grandfather_clock_01", "brass_candleholders"] },
    "daemmergarten": { floor: "herringbone_parquet", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffc8a0, skyIntensity: 0.8, night: false, props: ["Lantern_01", "marble_bust_01", "brass_candleholders"] },
    "nachtgarten": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0x9fc4ff, skyIntensity: 0.5, night: true, props: ["Lantern_01", "marble_bust_01", "vintage_grandfather_clock_01"] },
    "modern-light": { floor: "herringbone_parquet", wall: "white_stucco", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xfff6e8, skyIntensity: 1.4, night: false, props: ["marble_bust_01", "brass_candleholders", "vintage_grandfather_clock_01"] },
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
