import glob, os
from PIL import Image
os.makedirs('out', exist_ok=True)
tiles = []
for f in sorted(glob.glob('raw-*.png')):
    mid = f[4:-4]
    im = Image.open(f).convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bbox: print('empty', mid); continue
    im = im.crop(bbox)
    h = 520; w = round(im.width * h / im.height)
    if w > 520: w = 520; h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    im.save(f'out/{mid}.webp', 'WEBP', quality=84, method=6)
    tiles.append((mid, im))
    print(mid, im.size, os.path.getsize(f'out/{mid}.webp'))
cols = 5; tw, th = 260, 300
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (40, 26, 16))
for i, (mid, im) in enumerate(tiles):
    t = im.copy(); t.thumbnail((tw - 20, th - 30))
    x = (i % cols) * tw + (tw - t.width) // 2; y = (i // cols) * th + (th - 20 - t.height)
    sheet.paste(t, (x, y), t)
sheet.save('sheet.jpg', quality=85)
