// The immersive Home for the Babylon and Alexandria themes (WorldJourney).
// Everything readable is in the markup and visible without this module;
// it only adds motion:
//  - the fixed stage behind the page changes its mood with the chapter in
//    view (data-amb on the chapter, .amb-<mood> in the stage),
//  - chapters fade and lift in as they arrive and fade out as they leave,
//  - [data-speed] elements drift at their own depth,
//  - the project picture opens from a framed window to the full width,
//  - one-shot entrances (.is-in) when a [data-enter] element first shows,
//  - running numbers ([data-count-to]) and self-drawing constellations,
//  - a hover/tap/focus card for every [data-tip-title] (stars, goal fields),
//  - dust motes drifting in the stage.
// Under prefers-reduced-motion only the cards and the mood switch remain.

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function start(root) {
    const still = reduceMotion();
    const cleanups = [];
    const on = (target, type, fn, options) => {
        target.addEventListener(type, fn, options);
        cleanups.push(() => target.removeEventListener(type, fn, options));
    };

    // ---------- Stage mood follows the chapter in view ----------
    const stage = root.querySelector(".journey-stage");
    const moods = new Map([...stage.querySelectorAll("[data-mood]")].map((el) => [el.dataset.mood, el]));
    const moodObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const mood = entry.target.dataset.amb;
            moods.forEach((el, key) => el.classList.toggle("is-on", key === mood));
        }
    }, { rootMargin: "-45% 0px -45% 0px" });
    root.querySelectorAll("[data-amb]").forEach((el) => moodObserver.observe(el));
    cleanups.push(() => moodObserver.disconnect());

    // ---------- Info cards ----------
    const tip = root.querySelector(".journey-tip");
    let tipOwner = null;
    const fillTip = (el) => {
        tip.replaceChildren();
        const title = document.createElement("b");
        title.textContent = el.dataset.tipTitle;
        tip.append(title);
        if (el.dataset.tipMain) {
            const main = document.createElement("strong");
            main.textContent = el.dataset.tipMain;
            tip.append(main);
        }
        if (el.dataset.tipText) {
            const text = document.createElement("span");
            text.textContent = el.dataset.tipText;
            tip.append(text);
        }
        if (el.dataset.tipNote) {
            const note = document.createElement("em");
            note.textContent = el.dataset.tipNote;
            tip.append(note);
        }
    };
    const placeTip = (x, y) => {
        const w = tip.offsetWidth, h = tip.offsetHeight;
        let left = x + 18, top = y - h / 2;
        if (left + w > window.innerWidth - 12) left = x - w - 18;
        top = Math.min(Math.max(12, top), window.innerHeight - h - 12);
        tip.style.left = `${Math.max(12, left)}px`;
        tip.style.top = `${top}px`;
    };
    const showTip = (el, x, y) => {
        if (tipOwner && tipOwner !== el) tipOwner.classList.remove("is-picked");
        tipOwner = el;
        el.classList.add("is-picked");
        fillTip(el);
        tip.classList.add("is-on");
        if (x === undefined) {
            const r = el.getBoundingClientRect();
            x = r.right; y = r.top + r.height / 2;
        }
        placeTip(x, y);
    };
    const hideTip = () => {
        tip.classList.remove("is-on");
        if (tipOwner) tipOwner.classList.remove("is-picked");
        tipOwner = null;
    };
    on(root, "pointerover", (e) => {
        const el = e.target.closest("[data-tip-title]");
        if (el && root.contains(el)) showTip(el, e.clientX, e.clientY);
    });
    on(root, "pointermove", (e) => {
        if (tipOwner && e.pointerType === "mouse" && tipOwner.contains(e.target)) placeTip(e.clientX, e.clientY);
    });
    on(root, "pointerout", (e) => {
        const el = e.target.closest("[data-tip-title]");
        if (el && e.pointerType === "mouse" && !el.contains(e.relatedTarget)) hideTip();
    });
    on(root, "click", (e) => {
        const el = e.target.closest("[data-tip-title]");
        if (el) showTip(el, e.clientX || undefined, e.clientY || undefined);
    });
    on(root, "focusin", (e) => {
        const el = e.target.closest("[data-tip-title]");
        if (el) showTip(el);
    });
    on(root, "focusout", (e) => {
        if (e.target.closest("[data-tip-title]")) hideTip();
    });
    on(window, "scroll", hideTip, { passive: true });
    root.querySelectorAll(".journey-sky-scroll").forEach((el) => on(el, "scroll", hideTip, { passive: true }));

    if (still) {
        root.classList.add("journey--still");
        return { dispose: () => cleanups.forEach((fn) => fn()) };
    }
    root.classList.add("journey--moving");

    // ---------- One-shot entrances ----------
    const enterObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            el.classList.add("is-in");
            enterObserver.unobserve(el);
            el.querySelectorAll("[data-count-to]").forEach(runCount);
            if (el.matches("[data-count-to]")) runCount(el);
        }
    }, { rootMargin: "0px 0px -18% 0px" });
    root.querySelectorAll("[data-enter]").forEach((el) => enterObserver.observe(el));
    cleanups.push(() => enterObserver.disconnect());

    function runCount(el) {
        const target = Number(el.dataset.countTo);
        if (!Number.isFinite(target) || target <= 0) return;
        const started = performance.now(), duration = 1500;
        const step = (now) => {
            const t = Math.min(1, (now - started) / duration);
            el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
            if (t < 1) requestAnimationFrame(step);
        };
        el.textContent = "0";
        requestAnimationFrame(step);
    }

    // ---------- The book leans toward the pointer (decoration, not a link) ----------
    root.querySelectorAll("[data-tilt]").forEach((area) => {
        const book = area.querySelector(".journey-book");
        if (!book) return;
        on(area, "pointermove", (e) => {
            const r = area.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
            book.style.setProperty("--tilt-y", `${(32 + nx * 14).toFixed(2)}deg`);
            book.style.setProperty("--tilt-x", `${(3 - ny * 6).toFixed(2)}deg`);
        });
        on(area, "pointerleave", () => {
            book.style.removeProperty("--tilt-y");
            book.style.removeProperty("--tilt-x");
        });
    });

    // ---------- Scroll-linked motion ----------
    const chapters = [...root.querySelectorAll(".journey-chapter")].map((chapter) => ({
        chapter,
        parts: [...chapter.children].filter((c) => !c.matches(".journey-deco")),
        last: chapter.matches(".journey-finale"),
    }));
    const drifters = [...root.querySelectorAll("[data-speed]")];
    const windowEl = root.querySelector(".journey-world-window");
    const windowImage = root.querySelector(".journey-world-image");
    const lines = [...root.querySelectorAll(".journey-constellation")];
    const chart = root.querySelector(".journey-sky-chart");
    lines.forEach((line) => {
        const len = Math.hypot(line.x2.baseVal.value - line.x1.baseVal.value, line.y2.baseVal.value - line.y1.baseVal.value);
        line.style.strokeDasharray = `${len}`;
        line.style.strokeDashoffset = `${len}`;
        line.dataset.len = `${len}`;
    });

    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    let frame = 0;
    const update = () => {
        frame = 0;
        const vh = window.innerHeight;
        for (const { chapter, parts, last } of chapters) {
            const r = chapter.getBoundingClientRect();
            // 0 when the chapter's top meets the bottom of the screen, 1 when
            // its bottom leaves the top.
            const p = clamp((vh - r.top) / (vh + r.height));
            const inT = ease(clamp(p / 0.26));
            const outT = last ? 0 : clamp((p - 0.8) / 0.2);
            const opacity = inT * (1 - outT);
            const y = (1 - inT) * 60 - outT * 40;
            for (const part of parts) {
                part.style.opacity = opacity.toFixed(3);
                part.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
            }
        }
        for (const el of drifters) {
            const r = el.getBoundingClientRect();
            const offset = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.speed);
            el.style.translate = `0 ${offset.toFixed(1)}px`;
        }
        if (windowEl) {
            const r = windowEl.getBoundingClientRect();
            const t = clamp((vh - r.top) / (vh * 0.75));
            windowEl.style.setProperty("--inset", `${((1 - t) * 7).toFixed(2)}%`);
            windowEl.style.setProperty("--round", `${((1 - t) * 28).toFixed(1)}px`);
            if (windowImage) {
                const q = clamp((vh - r.top) / (vh + r.height));
                windowImage.style.transform = `translate3d(0, ${((q - 0.5) * 12).toFixed(2)}%, 0) scale(${(1.08 - q * 0.08).toFixed(3)})`;
            }
        }
        if (chart && lines.length) {
            const r = chart.getBoundingClientRect();
            const t = clamp((vh * 0.9 - r.top) / (vh * 0.55));
            const n = lines.length;
            lines.forEach((line, i) => {
                const local = clamp(t * 1.6 - (i / n) * 0.6);
                line.style.strokeDashoffset = `${(Number(line.dataset.len) * (1 - local)).toFixed(1)}`;
            });
        }
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(update); };
    on(window, "scroll", request, { passive: true });
    on(window, "resize", request);
    update();
    cleanups.push(() => { if (frame) cancelAnimationFrame(frame); });

    // ---------- Dust in the stage ----------
    const canvas = stage.querySelector("canvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        let w = 0, h = 0, motes = [], raf = 0, lastY = window.scrollY, vel = 0;
        const tint = () => getComputedStyle(root).getPropertyValue("--j-dust").trim() || "220,183,94";
        let rgb = tint();
        const make = () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + 0.3, s: Math.random() * 0.2 + 0.05, a: Math.random() * 0.5 + 0.15, p: Math.random() * 6.28 });
        const resize = () => {
            const d = Math.min(window.devicePixelRatio || 1, 2);
            w = window.innerWidth; h = window.innerHeight;
            canvas.width = w * d; canvas.height = h * d;
            ctx.setTransform(d, 0, 0, d, 0, 0);
            motes = Array.from({ length: Math.round((w * h) / 12000) }, make);
            rgb = tint();
        };
        const tick = (t) => {
            raf = requestAnimationFrame(tick);
            if (document.hidden) return;
            const y = window.scrollY;
            vel = vel * 0.9 + (y - lastY) * 0.02;
            lastY = y;
            ctx.clearRect(0, 0, w, h);
            for (const m of motes) {
                m.y -= m.s + vel * m.r * 0.4;
                m.x += Math.sin(t / 2400 + m.p) * 0.2;
                if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
                if (m.y > h + 10) m.y = -10;
                ctx.beginPath();
                ctx.fillStyle = `rgba(${rgb},${(m.a * (0.6 + 0.4 * Math.sin(t / 900 + m.p))).toFixed(3)})`;
                ctx.arc(m.x, m.y, m.r, 0, 6.3);
                ctx.fill();
            }
        };
        resize();
        on(window, "resize", resize);
        raf = requestAnimationFrame(tick);
        cleanups.push(() => cancelAnimationFrame(raf));
    }

    return { dispose: () => cleanups.forEach((fn) => fn()) };
}

export function stop(handle) {
    handle?.dispose();
}
