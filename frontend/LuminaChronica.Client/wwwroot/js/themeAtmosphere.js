// Ambient particles for the Babylon (fireflies) and Alexandria (dust in the
// light) themes, drawn into one <canvas> on the Home hero. Runs only while
// one of those themes is active, the tab is visible and the user hasn't
// asked for reduced motion; a theme switch starts or stops it on its own.
const THEMED = new Set(["babylon", "alexandria"]);

export function start(canvas) {
    if (!canvas) return null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let seed = 31;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const parts = Array.from({ length: 36 }, () => ({ x: rnd(), y: rnd(), z: 0.3 + rnd() * 0.7, p: rnd() * 6.28, s: rnd() }));

    const theme = () => document.documentElement.getAttribute("data-theme");
    const size = () => {
        const b = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(b.width * devicePixelRatio));
        canvas.height = Math.max(1, Math.round(b.height * devicePixelRatio));
    };

    function frame(t) {
        const w = theme();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!THEMED.has(w) || document.hidden || reduce.matches) { raf = 0; return; }
        const dpr = devicePixelRatio;
        if (w === "babylon") {
            for (let i = 0; i < 16; i++) {
                const q = parts[i];
                const x = (q.x + Math.sin(t / 6000 + q.p) * 0.03) * canvas.width;
                const y = (0.4 + q.y * 0.55 + Math.cos(t / 5000 + q.p) * 0.03) * canvas.height;
                const a = 0.2 + 0.8 * Math.max(0, Math.sin(t / (1400 + q.s * 1600) + q.p));
                const r = (1.2 + q.z * 1.6) * dpr * 6;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(246,226,140,${a})`);
                g.addColorStop(1, "rgba(246,226,140,0)");
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
            }
        } else {
            for (let i = 0; i < 36; i++) {
                const q = parts[i];
                const x = (0.35 + q.x * 0.65 + Math.sin(t / 9000 + q.p) * 0.02) * canvas.width;
                const y = (((q.y - (t / 90000) * q.z) % 1) + 1) % 1 * canvas.height;
                ctx.fillStyle = `rgba(255,240,205,${0.25 + 0.5 * q.z})`;
                ctx.beginPath(); ctx.arc(x, y, (0.6 + q.z * 1.1) * dpr, 0, 6.283); ctx.fill();
            }
        }
        raf = requestAnimationFrame(frame);
    }

    const kick = () => { if (!raf) { size(); raf = requestAnimationFrame(frame); } };
    const observer = new MutationObserver(kick);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", kick);
    reduce.addEventListener("change", kick);
    window.addEventListener("resize", size);
    kick();

    return {
        stop() {
            cancelAnimationFrame(raf);
            raf = 0;
            observer.disconnect();
            document.removeEventListener("visibilitychange", kick);
            reduce.removeEventListener("change", kick);
            window.removeEventListener("resize", size);
        },
    };
}

export function stop(handle) {
    handle?.stop();
}
