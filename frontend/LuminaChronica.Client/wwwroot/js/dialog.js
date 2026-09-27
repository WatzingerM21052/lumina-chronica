// Body scroll lock for Components/Dialog. Ref-counted at module scope (not
// per-instance) so nested/stacked dialogs don't unlock the page the moment
// the *inner* one closes while an outer one is still open -- ES modules are
// singletons per URL, so every Dialog instance importing this file shares
// the same lockCount.
let lockCount = 0;

export function lockScroll() {
    lockCount++;
    if (lockCount === 1) {
        document.documentElement.style.overflow = "hidden";
    }
}

export function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
        document.documentElement.style.overflow = "";
    }
}
