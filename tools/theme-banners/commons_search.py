import json, sys, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
UA = {"User-Agent": "LuminaChronicaAssetSearch/1.0 (luminachronica@gmx.at)"}

def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read())

for q in sys.argv[1:]:
    print(f"== {q}")
    d = api({"action": "query", "generator": "search", "gsrsearch": q, "gsrnamespace": 6, "gsrlimit": 12,
             "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 1600})
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        ii = p["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        print(f"{p['title'][:90]} | {ii['width']}x{ii['height']} | {lic} | {ii.get('thumburl','')}")
