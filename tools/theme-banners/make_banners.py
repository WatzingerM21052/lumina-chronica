"""Turn engravings into banner masks (alpha = line strength).
python make_banners.py <srcdir> <config.json> <outdir>
config: { outname: {"src": "file.jpg", "mode": "band"|"motif", "box": [x0,y0,x1,y1],
          "cy": 0.5 (band: vertical centre of the crop), "cx": 0.68 (motif position),
          "gain": 9, "floor": 6, "radius": 6, "scale": 0.98 (motif height) } }"""
import json, os, sys
from PIL import Image, ImageFilter, ImageChops, ImageDraw
Image.MAX_IMAGE_PIXELS = None
W, H = 2400, 560
src_dir, cfg_path, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)
cfg = json.load(open(cfg_path, encoding="utf-8"))

def feather(size, fx, fy):
    """Alpha multiplier fading the outer fx/fy fraction of each edge."""
    w, h = size
    col = [min(1, x / (fx * w), (w - 1 - x) / (fx * w)) if fx else 1 for x in range(w)]
    row = [min(1, y / (fy * h), (h - 1 - y) / (fy * h)) if fy else 1 for y in range(h)]
    m = Image.new("L", size)
    m.putdata([int(255 * max(0, c) * max(0, r)) for r in row for c in col])
    return m

def plate(im):
    """Fractional bbox of the printed plate: rows/columns with enough ink,
    pulled in a little so the plate's border line stays outside."""
    sm = im.copy(); sm.thumbnail((600, 600))
    px = sm.load(); W2, H2 = sm.size
    hist = sorted(sm.getdata()); paper = hist[int(len(hist) * 0.9)]
    dark = lambda v: v < paper - 40
    cols = [sum(dark(px[x, y]) for y in range(H2)) / H2 for x in range(W2)]
    rows = [sum(dark(px[x, y]) for x in range(W2)) / W2 for y in range(H2)]
    xs = [i for i, v in enumerate(cols) if v > 0.12]; ys = [i for i, v in enumerate(rows) if v > 0.12]
    x0, x1, y0, y1 = xs[0] / W2, (xs[-1] + 1) / W2, ys[0] / H2, (ys[-1] + 1) / H2
    ix, iy = (x1 - x0) * 0.02, (y1 - y0) * 0.02
    return x0 + ix, y0 + iy, x1 - ix, y1 - iy

def lines(im, radius, floor, gain):
    blur = im.filter(ImageFilter.GaussianBlur(radius))
    return ImageChops.subtract(blur, im).point(lambda v: min(255, int(max(0, v - floor) * gain)))

def prep(c):
    """Load one source, crop to its plate/box/trim; returns a grey image."""
    im = Image.open(os.path.join(src_dir, c["src"])).convert("L")
    w, h = im.size
    if c.get("box", "auto") == "auto":
        x0, y0, x1, y1 = plate(im)
    else:
        x0, y0, x1, y1 = c["box"]
    tl, tt, tr, tb = c.get("trim", [0, 0, 0, 0])
    bw, bh = x1 - x0, y1 - y0
    x0, y0, x1, y1 = x0 + tl * bw, y0 + tt * bh, x1 - tr * bw, y1 - tb * bh
    return im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))

def row(c):
    """Several plates side by side across the banner (a herbarium row):
    each scaled to the banner height, spread evenly from `start` to the
    right edge, every plate feathered on its own."""
    items = [prep(it) for it in c["items"]]
    mh = int(H * c.get("scale", 0.96))
    items = [im.resize((int(im.width * mh / im.height), mh), Image.LANCZOS) for im in items]
    start = int(W * c.get("start", 0.3))
    avail = W - start
    total = sum(im.width for im in items)
    if total > avail * 0.96:
        f = avail * 0.96 / total
        items = [im.resize((int(im.width * f), int(im.height * f)), Image.LANCZOS) for im in items]
        total = sum(im.width for im in items)
    gap = (avail - total) / (len(items) + 1)
    a = Image.new("L", (W, H), 0); x = start + gap
    for im in items:
        m = ImageChops.multiply(lines(im, c.get("radius", 6), c.get("floor", 6), c.get("gain", 9)), feather(im.size, 0.12, 0.08))
        a.paste(m, (int(x), H - im.height)); x += im.width + gap
    return a

def vignette(size, inner=0.55):
    """Elliptical alpha falloff: full inside `inner` of the radius, zero at
    the edge -- no straight edge anywhere."""
    w, h = size
    m = Image.new("L", size)
    px = []
    for y in range(h):
        dy = (y - h / 2) / (h / 2)
        for x in range(w):
            dx = (x - w / 2) / (w / 2)
            r = (dx * dx + dy * dy) ** 0.5
            v = 1 if r <= inner else max(0.0, 1 - (r - inner) / (1 - inner))
            px.append(int(255 * v * v * (3 - 2 * v)))
    m.putdata(px)
    return m

def solo(c):
    """One picture fitted into its own size with an elliptical vignette
    (the journey's decorations)."""
    w, h = c["size"]
    im = prep(c)
    f = min(w / im.width, h / im.height)
    im = im.resize((int(im.width * f), int(im.height * f)), Image.LANCZOS)
    # The vignette sits on the picture itself, so no edge of the plate shows.
    m = ImageChops.multiply(lines(im, c.get("radius", 6), c.get("floor", 6), c.get("gain", 9)), vignette(im.size, c.get("inner", 0.5)))
    a = Image.new("L", (w, h), 0)
    a.paste(m, ((w - im.width) // 2, (h - im.height) // 2))
    return a

previews = []
for name, c in cfg.items():
    if c["mode"] == "solo":
        a = solo(c)
        rgba = Image.new("RGBA", a.size, (0, 0, 0, 0)); rgba.putalpha(a)
        p = os.path.join(out_dir, name + ".webp")
        rgba.save(p, "WEBP", quality=70, alpha_quality=55, method=6)
        print(name, a.size, os.path.getsize(p) // 1024, "KB")
        continue
    if c["mode"] == "row":
        a = row(c)
        rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0)); rgba.putalpha(a)
        p = os.path.join(out_dir, name + ".webp")
        rgba.save(p, "WEBP", quality=70, alpha_quality=55, method=6)
        print(name, os.path.getsize(p) // 1024, "KB")
        sm = a.resize((960, 224))
        light = Image.composite(Image.new("RGB", sm.size, (110, 88, 60)), Image.new("RGB", sm.size, (242, 233, 216)), sm.point(lambda v: int(v * 0.6)))
        dark = Image.composite(Image.new("RGB", sm.size, (200, 165, 90)), Image.new("RGB", sm.size, (28, 22, 16)), sm.point(lambda v: int(v * 0.6)))
        previews.append((name, light, dark))
        continue
    im = Image.open(os.path.join(src_dir, c["src"])).convert("L")
    w, h = im.size
    if c.get("box", "auto") == "auto":
        x0, y0, x1, y1 = plate(im)
    else:
        x0, y0, x1, y1 = c["box"]
    # optional trim inside the box: [left, top, right, bottom] as fractions of it
    tl, tt, tr, tb = c.get("trim", [0, 0, 0, 0])
    bw, bh = x1 - x0, y1 - y0
    x0, y0, x1, y1 = x0 + tl * bw, y0 + tt * bh, x1 - tr * bw, y1 - tb * bh
    im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    r, fl, g = c.get("radius", 6), c.get("floor", 6), c.get("gain", 9)
    if c["mode"] == "band":
        im = im.resize((W, max(H, int(W * im.height / im.width))), Image.LANCZOS)
        cy = c.get("cy", 0.5)
        top = int(min(max(0, cy * im.height - H / 2), im.height - H))
        im = im.crop((0, top, W, top + H))
        a = ImageChops.multiply(lines(im, r, fl, g), feather((W, H), c.get("fx", 0.03), 0))
    else:
        mh = int(H * c.get("scale", 0.98))
        im = im.resize((int(im.width * mh / im.height), mh), Image.LANCZOS)
        m = ImageChops.multiply(lines(im, r, fl, g), feather(im.size, c.get("fx", 0.22), c.get("fy", 0.12)))
        a = Image.new("L", (W, H), 0)
        a.paste(m, (int(W * c.get("cx", 0.68) - m.width / 2), H - mh))
    rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0)); rgba.putalpha(a)
    p = os.path.join(out_dir, name + ".webp")
    rgba.save(p, "WEBP", quality=70, alpha_quality=55, method=6)
    print(name, os.path.getsize(p) // 1024, "KB")
    # preview: ink on paper (top) and brass on dark (bottom), small
    sm = a.resize((960, 224))
    light = Image.composite(Image.new("RGB", sm.size, (110, 88, 60)), Image.new("RGB", sm.size, (242, 233, 216)), sm.point(lambda v: int(v * 0.6)))
    dark = Image.composite(Image.new("RGB", sm.size, (200, 165, 90)), Image.new("RGB", sm.size, (28, 22, 16)), sm.point(lambda v: int(v * 0.6)))
    previews.append((name, light, dark))

sheet = Image.new("RGB", (1940, len(previews) * 244), (255, 255, 255))
d = ImageDraw.Draw(sheet)
for i, (n, l, k) in enumerate(previews):
    sheet.paste(l, (0, i * 244)); sheet.paste(k, (980, i * 244)); d.text((4, i * 244 + 226), n, fill=(0, 0, 0))
sheet.save(os.path.join(out_dir, "preview.jpg"), quality=80)
