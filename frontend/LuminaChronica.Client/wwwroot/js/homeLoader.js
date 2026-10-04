// Home's loading veil (2026-10-04): resolves once the fonts and the
// pictures you see first are ready -- the <img>s of the hero and the
// journey's first chapters, and the CSS pictures (backgrounds and masks)
// of the hero, banners and engravings -- or after `timeoutMs`, whichever
// comes first, so the page never waits on a slow picture.
const PICTURE_SELECTORS = [
    ".home-hero-world-image",
    ".home-hero-layer",
    ".journey-engraving",
    ".journey-world-image",
    ".world-banner-image",
];

function cssUrls(el) {
    const style = getComputedStyle(el);
    const values = [style.backgroundImage, style.maskImage, style.webkitMaskImage];
    const urls = [];
    for (const value of values) {
        if (!value || value === "none") continue;
        for (const match of value.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
            urls.push(match[1]);
        }
    }
    return urls;
}

function decode(src) {
    const img = new Image();
    img.src = src;
    return img.decode().catch(() => {});
}

export function whenReady(root, timeoutMs) {
    const scope = root instanceof Element ? root : document;
    const waits = [];

    if (document.fonts && document.fonts.ready) {
        waits.push(document.fonts.ready.catch(() => {}));
    }

    // Only what is on or near the first screen; the rest loads as you scroll.
    const limit = window.innerHeight * 1.6;
    for (const img of scope.querySelectorAll("img")) {
        if (img.loading === "lazy") continue;
        if (img.getBoundingClientRect().top > limit) continue;
        waits.push(img.complete ? Promise.resolve() : img.decode().catch(() => {}));
    }

    const seen = new Set();
    for (const el of scope.querySelectorAll(PICTURE_SELECTORS.join(","))) {
        if (el.getBoundingClientRect().top > limit) continue;
        for (const url of cssUrls(el)) {
            if (seen.has(url)) continue;
            seen.add(url);
            waits.push(decode(url));
        }
    }

    const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return Promise.race([Promise.all(waits), timeout]).then(() => true);
}
