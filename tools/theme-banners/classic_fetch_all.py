"""Fetch the classic banner sources (searched by a unique substring) and
write credits.json + a contact sheet. Usage: python classic_fetch_all.py"""
import json, os, sys, urllib.parse, urllib.request
from PIL import Image
sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
UA = {"User-Agent": "LuminaChronicaAssetSearch/1.0 (luminachronica@gmx.at)"}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else "classic")
os.makedirs(OUT, exist_ok=True)

# key: (search query, substring the title must contain)
WANT = json.load(open(os.path.join(HERE, sys.argv[2] if len(sys.argv) > 2 else "classic_want.json"), encoding="utf-8"))

def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.loads(r.read())

credits_path = os.path.join(OUT, "credits.json")
credits = json.load(open(credits_path, encoding="utf-8")) if os.path.exists(credits_path) else {}
for key, (query, must) in WANT.items():
    dest = os.path.join(OUT, key + ".jpg")
    if os.path.exists(dest):
        continue
    d = api({"action": "query", "generator": "search", "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": 20,
             "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 4000})
    pages = list((d.get("query", {}).get("pages", {}) or {}).values())
    hit = next((p for p in pages if must in p["title"]), None)
    if not hit:
        print("MISSING", key, query); continue
    ii = hit["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    lic = meta.get("LicenseShortName", {}).get("value", "")
    if not any(x in lic for x in ("Public domain", "CC0", "PDM", "No restrictions")):
        print("LICENSE?", key, lic); continue
    url = ii.get("thumburl") or ii["url"]
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
    im = Image.open(__import__("io").BytesIO(data)).convert("RGB")
    im.save(dest, quality=92)
    credits[key] = {"title": hit["title"], "license": lic, "page": ii.get("descriptionurl", ""),
                    "artist": meta.get("Artist", {}).get("value", ""), "size": [ii["width"], ii["height"]]}
    print(key, ii["width"], ii["height"], lic)
json.dump(credits, open(credits_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

files = sorted(f for f in os.listdir(OUT) if f.endswith(".jpg") and not f.startswith(("sheet", "uran_")))
th = []
for f in files:
    im = Image.open(os.path.join(OUT, f)).convert("L"); im.thumbnail((420, 300)); th.append((f, im))
cols = 4; rows = (len(th) + cols - 1) // cols
sheet = Image.new("L", (cols * 430, rows * 320), 255)
from PIL import ImageDraw
dr = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(th):
    x, y = (i % cols) * 430, (i // cols) * 320
    sheet.paste(im, (x, y)); dr.text((x + 2, y + 302), f[:60], fill=0)
sheet.save(os.path.join(OUT, "sheet.jpg"), quality=80)
print("sheet", len(th))
