"""Search Commons for engraving candidates and build a numbered contact sheet.
python candidates.py <outdir> "query 1" "query 2" ...
Keeps files >= 2400 px on the long side with a PD/CC0 licence, skips PDFs/DjVu.
Writes <outdir>/candidates.json (index -> title, size, licence) and sheet_N.jpg."""
import io, json, os, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw
sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
UA = {"User-Agent": "LuminaChronicaAssetSearch/1.0 (luminachronica@gmx.at)"}
HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, sys.argv[1]); os.makedirs(out, exist_ok=True)
OK = ("Public domain", "CC0", "PDM", "No restrictions")

def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.loads(r.read())

cand_path = os.path.join(out, "candidates.json")
cands = json.load(open(cand_path, encoding="utf-8")) if os.path.exists(cand_path) else []
seen = {c["title"] for c in cands}
for q in sys.argv[2:]:
    d = api({"action": "query", "generator": "search", "gsrsearch": q, "gsrnamespace": 6, "gsrlimit": 14,
             "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 360})
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        t = p["title"]
        if t in seen or t.lower().endswith((".pdf", ".djvu", ".tif", ".tiff", ".svg")):
            continue
        ii = p["imageinfo"][0]
        lic = ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if max(ii["width"], ii["height"]) < int(os.environ.get("MINPX", "2400")) or not any(x in lic for x in OK) or (os.environ.get("WIDE") and ii["width"] < ii["height"] * 1.3):
            continue
        try:
            data = urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=60).read()
            Image.open(io.BytesIO(data)).convert("L").save(os.path.join(out, f"c{len(cands)}.jpg"), quality=80)
        except Exception as e:
            print("skip", t, e); continue
        seen.add(t)
        cands.append({"i": len(cands), "q": q, "title": t, "w": ii["width"], "h": ii["height"], "lic": lic})
json.dump(cands, open(cand_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# contact sheets, 24 per sheet
per, cw, ch = 24, 300, 250
for s in range(0, len(cands), per):
    chunk = cands[s:s + per]
    sheet = Image.new("L", (6 * cw, 4 * ch), 255); dr = ImageDraw.Draw(sheet)
    for k, c in enumerate(chunk):
        im = Image.open(os.path.join(out, f"c{c['i']}.jpg")); im.thumbnail((cw - 10, ch - 26))
        x, y = (k % 6) * cw, (k // 6) * ch
        sheet.paste(im, (x, y)); dr.text((x + 2, y + ch - 22), f"#{c['i']} {c['w']}x{c['h']}", fill=0)
    sheet.save(os.path.join(out, f"sheet_{s // per}.jpg"), quality=78)
print(len(cands), "candidates")
