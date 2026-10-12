# render-decor

Renders the bookshelf decor (`frontend/LuminaChronica.Client/wwwroot/images/shelf-decor/`)
from CC0 Poly Haven models, so every object has the same camera and light.

1. `python dl.py <poly-haven-id>...` — downloads the 1k glTF and its textures.
2. `python pack.py <id>...` — packs each into one `<id>.glb` (textures embedded, 512 px).
3. Open `render.html` in a browser (Playwright: serve the folder, e.g. via `page.route`, a plain
   `python -m http.server` drops connections under load) and call
   `await renderDecor(id, { pick, rotY, elev })`, then screenshot the canvas with a transparent
   background as `raw-<name>.png`.
4. `python post.py` — crops to the object, scales to 520 px and writes `out/<name>.webp` plus
   `sheet.jpg` to compare them.

Add every new file to `shelf-decor/CREDITS.md`.
