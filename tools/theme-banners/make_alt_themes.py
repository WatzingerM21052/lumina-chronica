"""Write the five alternative theme files (full token set + signature +
banner map) and copy their banner masks into the app."""
import json, os, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "..", "frontend", "LuminaChronica.Client", "wwwroot")
PAL = json.load(open(os.path.join(HERE, "configs", "palettes.json"), encoding="utf-8"))
PAGES = ["library", "shelves", "statistics", "discover", "projects", "settings", "profile", "offline", "upload", "impressum", "legal"]

def rgb(h): h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def hexc(c): return "#%02x%02x%02x" % tuple(max(0, min(255, round(v))) for v in c)
def mix(a, b, t): a, b = rgb(a), rgb(b); return hexc([a[i] * (1 - t) + b[i] * t for i in range(3)])
def lum(h):
    def ch(v):
        v /= 255; return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb(h)); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)

THEMES = {
    "skriptorium": {"dir": "skriptorium", "src": "alt_skriptorium", "font": '"Literata", Georgia, serif',
        "intro": "Skriptorium: a scribe's room by oil lamp -- cedar, copper and papyrus.\n   Signature: a cedar header closed by a double copper rule, warm lamplight\n   on the page.",
        "header": 'linear-gradient(180deg, #2a1d13, #1a120c)', "rule": "3px double var(--color-primary)",
        "glow": "radial-gradient(70% 45% at 85% 0%, rgba(207, 125, 67, 0.12), transparent 70%)"},
    "abendhafen": {"dir": "abendhafen", "src": "alt_abendhafen", "font": '"Cinzel", Georgia, serif',
        "intro": "Abendhafen: the harbour at dusk under the lighthouse's gold.\n   Signature: a dusk-blue header with a single beam of gold, the lamp's\n   glow over the page.",
        "header": 'linear-gradient(180deg, #16213a, #0a111e)', "rule": "1px solid var(--color-primary)",
        "glow": "radial-gradient(60% 50% at 90% 0%, rgba(230, 184, 92, 0.14), transparent 70%), radial-gradient(80% 50% at 0% 100%, rgba(111, 179, 217, 0.08), transparent 70%)"},
    "ischtar": {"dir": "ischtar", "src": "alt_ischtar", "font": '"Marcellus", Georgia, serif',
        "intro": "Ischtar-Tor: all in the gate's cobalt, with golden lions -- the Assyrian\n   and Babylonian engravings, not Babylon's photographs.\n   Signature: a cobalt header with a band of gold rosettes like the gate's.",
        "header": 'linear-gradient(180deg, #102256, #081025)', "rule": "0",
        "band": True,
        "glow": "radial-gradient(70% 45% at 50% 0%, rgba(53, 182, 200, 0.10), transparent 70%)"},
    "daemmergarten": {"dir": "daemmergarten", "src": "alt_garten", "font": '"Fraunces", Georgia, serif',
        "intro": "Gärten in der Dämmerung: sage, terracotta and warm sandstone -- garden\n   engravings. The one light alternative.\n   Signature: a sage header with a terracotta rule, evening light on the page.",
        "header": 'linear-gradient(180deg, #3a5242, #2f4336)', "rule": "3px solid var(--color-secondary)",
        "glow": "radial-gradient(70% 45% at 85% 0%, rgba(179, 93, 58, 0.10), transparent 70%)"},
    "nachtgarten": {"dir": "nachtgarten", "src": "alt_nacht", "font": '"Literata", Georgia, serif',
        "intro": "Nachtgarten: deep green, loam red and lantern gold -- botanical plates\n   of the flowers that open at night.\n   Signature: a deep green header with a lantern-gold rule and a faint\n   glow of lanterns on the page.",
        "header": 'linear-gradient(180deg, #13261b, #08100c)', "rule": "1px solid var(--color-primary)",
        "glow": "radial-gradient(40% 30% at 92% 4%, rgba(211, 169, 78, 0.14), transparent 70%), radial-gradient(30% 25% at 8% 30%, rgba(95, 179, 166, 0.06), transparent 70%)"},
}

for key, t in THEMES.items():
    p = PAL[key if key != "ischtar" else "ischtar"]
    dark = p["mode"] == "dark"
    card, paper = p["card"], p["paper"]
    for name in ("text", "text2", "muted"):
        cr = contrast(p[name], card)
        assert cr >= 4.5, (key, name, round(cr, 2))
    assert contrast(p["accentText"], card) >= 4.5, (key, "accent", contrast(p["accentText"], card))
    hover = mix(p["primary"], "#000000", 0.1); active = mix(p["primary"], "#000000", 0.2)
    sec_hover = mix(p["secondary"], "#000000", 0.12)
    status = ({"info": "#6fa8c9", "success": "#6fae6f", "warning": "#d9a441", "error": "#d9695c"} if dark else
              {"info": "#2f6f9a", "success": "#2f7d45", "warning": "#a8701a", "error": "#b0392b"})
    scrim = "rgba(0, 0, 0, 0.6)" if dark else "rgba(%d, %d, %d, 0.45)" % rgb(p["dark"])
    light = mix(card, "#ffffff" if not dark else "#ffffff", 0.04 if dark else 0.5)
    disabled = mix(p["muted"], card, 0.45)
    reader = mix(paper, card, 0.5)
    gold = p["primary"] if dark else p["secondary"]
    banners = "\n".join(
        f'html[data-theme="{key}"] .world-banner[data-page="{pg}"] {{\n    --banner-mask: url("../../images/themes/{t["dir"]}/{t["dir"]}-{pg}.webp");\n}}\n'
        for pg in PAGES)
    band = ""
    if t.get("band"):
        band = f'''
/* The gate's band: gold rosettes between two gold lines, drawn in CSS. */
html[data-theme="{key}"] .app-header::after {{
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -9px;
    height: 9px;
    pointer-events: none;
    background:
        radial-gradient(circle at 50% 50%, var(--color-primary) 0 2px, transparent 2.5px) 0 0 / 18px 9px repeat-x,
        linear-gradient(var(--color-primary), var(--color-primary)) top / 100% 1px no-repeat,
        linear-gradient(var(--color-primary), var(--color-primary)) bottom / 100% 1px no-repeat,
        #0b1838;
}}
'''
    css = f'''/*
  {t["intro"]}
  An alternative look (point 6, 2026-10-04): the world layout with the
  engraving banners of the classic themes (app.css), its own pictures in
  images/themes/{t["dir"]} (CREDITS.md) and its own colours. Text colours are
  checked for at least 4.5:1 on the card.
*/

[data-theme="{key}"] {{
    color-scheme: {"dark" if dark else "light"};
    --color-primary: {p["primary"]};
    --color-primary-hover: {hover};
    --color-primary-active: {active};

    --color-secondary: {p["secondary"]};
    --color-secondary-hover: {sec_hover};

    --color-gold-accent: {gold};
    --color-accent-text: {p["accentText"]};
    --color-info: {status["info"]};
    --color-success: {status["success"]};
    --color-chart-1: {p["chart"][0]};
    --color-chart-2: {p["chart"][1]};
    --color-chart-3: {p["chart"][2]};
    --color-chart-4: {p["chart"][3]};
    --color-warning: {status["warning"]};
    --color-error: {status["error"]};

    --color-bg-paper: {paper};
    --color-bg-light: {light};
    --color-bg-dark: {p["dark"]};
    --color-overlay-scrim: {scrim};
    --color-bg-card: {card};
    --color-bg-reader: {reader};

    --color-text-primary: {p["text"]};
    --color-text-secondary: {p["text2"]};
    --color-text-muted: {p["muted"]};
    --color-text-disabled: {disabled};
    --color-text-on-dark: {p["onDark"]};

    --color-border: {p["border"]};
}}

html[data-theme="{key}"] {{
    --font-family-display: {t["font"]};
    background: {t["glow"]}, var(--color-bg-paper);
    background-attachment: fixed;
}}

html[data-theme="{key}"] .app-header {{
    background: {t["header"]};
    border-bottom: {t["rule"]};
}}
{band}
/* ---------- Banners: one engraving per page ---------- */
{banners}'''
    open(os.path.join(APP, "Styles", "themes", f"{key}.css"), "w", encoding="utf-8", newline="\n").write(css)
    dst = os.path.join(APP, "images", "themes", t["dir"]); os.makedirs(dst, exist_ok=True)
    src = os.path.join(HERE, t["src"], "out")
    prefix = {"alt_garten": "garten", "alt_nacht": "nachtgarten"}.get(t["src"], t["dir"])
    for pg in PAGES:
        shutil.copy(os.path.join(src, f"{prefix}-{pg}.webp"), os.path.join(dst, f"{t['dir']}-{pg}.webp"))
    print(key, "ok", {n: round(contrast(p[n], card), 1) for n in ("text", "text2", "muted", "accentText")})
