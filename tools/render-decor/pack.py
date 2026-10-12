# Packs a .gltf + .bin + texture files into one .glb with embedded images
# (textures downscaled to 512 px for fast offline rendering).
import json, struct, sys, os, io
from PIL import Image
def pad(b, c=b'\0'):
    return b + c * ((4 - len(b) % 4) % 4)
for mid in sys.argv[1:]:
    g = json.load(open(f'{mid}/{mid}.gltf', encoding='utf-8'))
    blob = bytearray()
    old = open(f"{mid}/{g['buffers'][0]['uri']}", 'rb').read()
    blob += old
    for img in g.get('images', []):
        uri = img.pop('uri')
        im = Image.open(f'{mid}/{uri}'); im.thumbnail((512, 512))
        out = io.BytesIO()
        if im.mode in ('RGBA', 'LA'):
            im.save(out, 'PNG'); mime = 'image/png'
        else:
            im.convert('RGB').save(out, 'JPEG', quality=88); mime = 'image/jpeg'
        while len(blob) % 4: blob += b'\0'
        off = len(blob); data = out.getvalue(); blob += data
        g['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        img['bufferView'] = len(g['bufferViews']) - 1; img['mimeType'] = mime
    while len(blob) % 4: blob += b'\0'
    g['buffers'] = [{'byteLength': len(blob)}]
    js = pad(json.dumps(g).encode(), b' ')
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(f'{mid}.glb', 'wb').write(glb)
    print(mid, len(glb) // 1024, 'KB')
