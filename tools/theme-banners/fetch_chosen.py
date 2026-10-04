"""Download chosen candidates in full (4000 px) and record credits.
python fetch_chosen.py <dir> 1 6 17 ...   -> <dir>/src_<i>.jpg, <dir>/credits.json"""
import io, json, os, re, sys, urllib.parse, urllib.request
from PIL import Image
sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
UA = {"User-Agent": "LuminaChronicaAssetSearch/1.0 (luminachronica@gmx.at)"}
HERE = os.path.dirname(os.path.abspath(__file__))
d = os.path.join(HERE, sys.argv[1])
cands = {c["i"]: c for c in json.load(open(os.path.join(d, "candidates.json"), encoding="utf-8"))}
cred_path = os.path.join(d, "credits.json")
credits = json.load(open(cred_path, encoding="utf-8")) if os.path.exists(cred_path) else {}
for i in map(int, sys.argv[2:]):
    dest = os.path.join(d, f"src_{i}.jpg")
    if os.path.exists(dest):
        continue
    c = cands[i]
    q = {"action": "query", "titles": c["title"], "prop": "imageinfo", "iiprop": "url|size|extmetadata",
         "iiurlwidth": 4000, "format": "json"}
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(q), headers=UA), timeout=60).read())
    ii = next(iter(r["query"]["pages"].values()))["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    url = ii.get("thumburl") or ii["url"]
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=240).read()
    Image.open(io.BytesIO(data)).convert("RGB").save(dest, quality=92)
    credits[str(i)] = {"title": c["title"], "license": c["lic"], "page": ii.get("descriptionurl", ""),
                       "artist": re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", ""))[:120],
                       "object": re.sub("<[^>]+>", "", meta.get("ObjectName", {}).get("value", ""))[:160]}
    print(i, c["title"][:90])
json.dump(credits, open(cred_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
