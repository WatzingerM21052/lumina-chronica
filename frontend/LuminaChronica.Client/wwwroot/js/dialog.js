// Body scroll lock + focus management for Components/Dialog. Module state is
// shared by every Dialog instance (ES modules are singletons per URL), which
// is what the ref-counted lock and the stack of open dialogs rely on.
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

// --- Focus management (review M-3) -----------------------------------------
// Open dialogs, innermost last. Only the topmost one traps Tab / catches
// Escape, so a ConfirmDialog stacked over an edit dialog behaves correctly.
const stack = [];

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

function focusables(el) {
    return Array.from(el.querySelectorAll(FOCUSABLE)).filter((node) => node.offsetParent !== null || node === document.activeElement);
}

// First form field in the body if there is one (forms), else the card itself
// so screen readers still land inside the dialog.
export function focusFirst(el) {
    if (!el) return;
    const field = el.querySelector(".dialog-body " + FIELDS) ?? el.querySelector(FIELDS);
    (field ?? el).focus();
}

function onKeyDown(e) {
    const top = stack[stack.length - 1];
    if (!top) return;
    const { el, dotNetRef } = top;
    const focusInside = el.contains(document.activeElement);

    if (e.key === "Escape" && focusInside && document.activeElement.matches(FIELDS)) {
        // Blazor's InputText/InputTextArea only update their model on
        // "change" (i.e. on blur). Without this, typing and pressing Escape
        // straight away closes the dialog before the dirty-state guard ever
        // sees the typed text. Dispatched before the card's own keydown
        // handler runs, and Blazor processes the two events in order.
        document.activeElement.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (e.key === "Escape" && !focusInside) {
        // Focus fell out of the card (e.g. the clicked button was removed by
        // a step change), so the card's own @onkeydown never sees this key.
        e.preventDefault();
        dotNetRef.invokeMethodAsync("OnEscapeFromOutside");
        return;
    }

    if (e.key !== "Tab") return;
    const items = focusables(el);
    if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (!focusInside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

// Dialogs are identified by a per-instance id, not the element: by the time
// Blazor reports a dialog closed, its element is already gone from the DOM.
export function activate(id, el, dotNetRef, initialFocusSelector) {
    if (stack.length === 0) {
        document.addEventListener("keydown", onKeyDown, true);
    }
    stack.push({ id, el, dotNetRef, opener: document.activeElement });

    const initial = initialFocusSelector ? el.querySelector(initialFocusSelector) : null;
    if (initial) {
        initial.focus();
    } else {
        focusFirst(el);
    }
}

export function deactivate(id) {
    const index = stack.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = stack.splice(index, 1);
    if (stack.length === 0) {
        document.removeEventListener("keydown", onKeyDown, true);
    }

    if (index < stack.length) {
        // Not the topmost one: an outer dialog closing in the same render as
        // the confirm stacked on it (e.g. "discard" closes both). The entry
        // above was opened from inside this dialog, so it inherits this
        // dialog's opener and restores focus there when it closes itself.
        stack[index].opener = entry.opener;
        return;
    }

    const opener = entry.opener;
    const top = stack[stack.length - 1];
    const openerUsable = opener && opener.isConnected && opener !== document.body && typeof opener.focus === "function";
    if (top && top.el.isConnected && !(openerUsable && top.el.contains(opener))) {
        // A dialog is still open underneath (e.g. a discard-confirm over an
        // edit form): focus belongs back in it, even when the confirm was
        // opened from a scrim click that had left focus on <body>.
        focusFirst(top.el);
    } else if (openerUsable) {
        opener.focus();
    }
}
