import json, os, sys, urllib.request, ssl
ids = sys.argv[1:]
ctx = ssl.create_default_context()
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "lumina-chronica-decor/1.0"})
    return urllib.request.urlopen(req, context=ctx, timeout=120).read()
for mid in ids:
    try:
        files = json.loads(get(f"https://api.polyhaven.com/files/{mid}"))
        g = files["gltf"]["1k"]["gltf"]
        os.makedirs(f"{mid}/textures", exist_ok=True)
        open(f"{mid}/{mid}.gltf", "wb").write(get(g["url"]))
        for rel, v in g["include"].items():
            p = f"{mid}/{rel}"; os.makedirs(os.path.dirname(p), exist_ok=True)
            if not os.path.exists(p): open(p, "wb").write(get(v["url"]))
        info = json.loads(get(f"https://api.polyhaven.com/info/{mid}"))
        open(f"{mid}/info.json", "w").write(json.dumps({"name": info.get("name"), "authors": info.get("authors")}))
        print("ok", mid)
    except Exception as e:
        print("FAIL", mid, e)
