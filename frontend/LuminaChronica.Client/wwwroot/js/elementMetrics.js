// Blazor has no built-in way to read an element's rendered pixel size --
// used by the map pin placement UI to convert a click's OffsetX/OffsetY
// (already native to MouseEventArgs) into a 0-100 percentage of the map
// image's actual rendered dimensions.
export function getElementSize(el) {
    return { width: el.clientWidth, height: el.clientHeight };
}

// The map's own pixel size, so the page can size it to fill the width
// while a tall map still fits the screen (pins are % of the image, so the
// image itself must keep its aspect -- no object-fit letterboxing).
export function getNaturalSize(img) {
    return { width: img.naturalWidth, height: img.naturalHeight };
}
