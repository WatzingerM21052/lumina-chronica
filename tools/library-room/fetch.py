# Fetches the 3D library's CC0 assets from Poly Haven (api.polyhaven.com)
# and packs them for the web: models as one .glb with 1K WebP textures,
# texture sets as 1K WebP, HDRIs as 1K .hdr. Writes CREDITS.md.
import io, json, os, struct, sys, urllib.request
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'frontend/LuminaChronica.Client/wwwroot/assets/library-room'
MODELS = ['round_wooden_table_01', 'vintage_oil_lamp', 'Chandelier_01', 'ArmChair_01', 'brass_candleholders',
          'marble_bust_01', 'vintage_grandfather_clock_01', 'Lantern_01',
          'ornate_mirror_01', 'fancy_picture_frame_01', 'mantel_clock_01', 'fern_02', 'potted_plant_04',
          'Ottoman_01', 'tea_set_01', 'antique_ceramic_vase_01']
TEXTURES = ['herringbone_parquet', 'dark_wooden_planks', 'walnut_veneer', 'white_stucco', 'plastered_wall_04',
            'marble_tiles', 'blue_floor_tiles_01', 'quatrefoil_jacquard_fabric']
HDRIS = ['reading_room', 'sepulchral_chapel_rotunda']
UA = {'User-Agent': 'LuminaChronica-asset-fetch/1.0'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

def info(asset):
    return json.loads(get(f'https://api.polyhaven.com/info/{asset}'))

def webp(data, size=1024, alpha=False):
    im = Image.open(io.BytesIO(data)); im.thumbnail((size, size))
    out = io.BytesIO(); im.save(out, 'WEBP', quality=86)
    return out.getvalue()

def pad(b, c=b'\0'):
    return b + c * ((4 - len(b) % 4) % 4)

def model(asset):
    allres = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))['gltf']
    files = (allres.get('1k') or allres[sorted(allres, key=lambda k: int(k[:-1]))[0]])['gltf']
    g = json.loads(get(files['url']))
    blob = bytearray(get(files['include'][g['buffers'][0]['uri']]['url']))
    for img in g.get('images', []):
        uri = img.pop('uri')
        data = webp(get(files['include'][uri]['url']))
        while len(blob) % 4: blob += b'\0'
        g['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob += data
        img['bufferView'] = len(g['bufferViews']) - 1; img['mimeType'] = 'image/webp'
    g.setdefault('extensionsUsed', [])
    while len(blob) % 4: blob += b'\0'
    g['buffers'] = [{'byteLength': len(blob)}]
    js = pad(json.dumps(g).encode(), b' ')
    glb = struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(f'{OUT}/models/{asset}.glb', 'wb').write(glb)

def texture(asset):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    for key, name in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')]:
        if key in files:
            open(f'{OUT}/textures/{asset}_{name}.webp', 'wb').write(webp(get(files[key]['1k']['jpg']['url'])))

def hdri(asset):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    open(f'{OUT}/hdri/{asset}_1k.hdr', 'wb').write(get(files['hdri']['1k']['hdr']['url']))

for d in ('models', 'textures', 'hdri'):
    os.makedirs(f'{OUT}/{d}', exist_ok=True)
rows = []
for kind, assets, fn in [('Modell', MODELS, model), ('Textur', TEXTURES, texture), ('HDRI', HDRIS, hdri)]:
    for a in assets:
        done = any(f.startswith(a) for d in ('models', 'textures', 'hdri') for f in os.listdir(f'{OUT}/{d}'))
        if not done: fn(a)
        meta = info(a)
        rows.append(f"| {kind} | `{a}` | {meta['name']} | {', '.join(meta.get('authors', {}).keys())} |")
        print('ok', a)
open(f'{OUT}/CREDITS.md', 'w', encoding='utf-8').write(
    '# 3D-Bibliothek – Assets\n\nAlle Assets von [Poly Haven](https://polyhaven.com), Lizenz **CC0** (gemeinfrei). '
    'Gepackt mit `tools/library-room/fetch.py` (1K, WebP).\n\n| Art | Datei | Name | Autor:innen |\n|---|---|---|---|\n' + '\n'.join(rows) + '\n')
total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs)
print('total', round(total / 1048576, 1), 'MB')
