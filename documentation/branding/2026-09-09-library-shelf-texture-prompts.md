# Library shelf texture prompts (2026-09-09)

Asset dependency for **Library Rework Phase 3** (`docs/superpowers/specs/2026-09-08-library-shelf-design.md`), which replaces Phase 1's gradient-only shelf/book materials with real texture images composited via low-opacity blend, the same established technique already used for `wwwroot/images/statistics/brass-texture.webp` (Goal Ring, Statistics calendar panel). Phase 1 and 2 do not need these — the shelf renders correctly with gradients alone in the meantime, per the design spec's explicit "ship with a documented known-limitation, close the gap later" pattern (same as how the Statistics hero shipped one phase ahead of its own texture asset).

Two assets, both **seamless/tileable**, unlike the Dashboard/Statistics hero images (which are single large fixed-composition scenes) — `.shelf-compartment` spans a variable-width row and `.shelf-book`'s spine/cover faces are small (roughly 44×150px in the current CSS), so both textures need to repeat cleanly at `background-repeat: repeat` rather than being generated as one large non-repeating image.

Style family: follows the existing **photorealistic architectural style** already established for the Dashboard/Statistics hero images (`documentation/branding/2026-09-07-speculative-image-prompts.md`'s framing) — warm golden-amber grading, matte-painting quality, no people, no text, no watermark, no signature, no logos, nothing that would look like a "material swatch" stock photo. Both will sit at low opacity (roughly 0.12–0.2, matching `brass-texture.webp`'s existing `opacity: 0.15` precedent in the codebase) blended under/over gradient fills, so contrast and detail should be **subtle and restrained**, not a bold, high-contrast texture that would fight the gradient sitting beneath or above it.

---

## 1. `shelf-wood-texture.webp` — aged dark wood grain

Used on `.shelf-compartment`'s recessed back-wall/interior (`app.css`, `.shelf-compartment` rule) — a dark, gradient-shaded box that currently reads as flat color; this texture adds the "decades-old private library shelf" wood-grain detail the design spec calls for, without looking rustic or cabin-style.

```
Seamless tileable texture of aged dark walnut or mahogany wood grain,
close-up macro photograph, viewed straight-on (no perspective, no
vanishing point, flat orthographic framing suitable for a repeating
background pattern). Deep warm brown tones with subtle reddish undertones,
fine natural grain lines running mostly in one consistent direction,
occasional small natural knots or grain irregularities, a worn/aged
patina with faint scuffs and soft sheen from decades of handling --
NOT rustic, NOT distressed/cracked, NOT a barn-wood or cabin aesthetic.
Reads as a section of a well-kept antique library shelf or fine wood
furniture, not raw lumber. Warm, low-contrast, evenly diffused lighting
with no strong directional shadows or highlights (this will be blended
at low opacity under other content, so avoid anything that reads as a
bright hotspot or a hard shadow when tiled edge-to-edge).

Must tile seamlessly: left edge must match right edge, top edge must
match bottom edge, no visible seam when repeated in a grid. Square
canvas, minimum 1024x1024px (2048x2048px preferred for higher-density
displays). Photorealistic macro-photography quality, matte finish, no
glossy/lacquered reflections. No people, no text, no watermark, no
signature, no logos, no visible edges/borders/frame -- texture must
fill the entire canvas edge-to-edge.

Negative prompt (if supported): people, human figures, text, words,
letters, watermark, signature, logo, furniture silhouette, visible
seams, hard shadows, glossy reflections, rustic/barn wood, painted
wood, cartoon, illustration
```

## 2. `book-leather-texture.webp` — subtle leather grain

Used on each `ShelfBook`'s spine/cover faces (`app.css`, `.shelf-book-spine`/`.shelf-book-cover`, layered under the per-book palette color via `color-mix()`/gradient) — gives the "Lederoptik" (leather look) the design spec calls for on book bindings, without obscuring the palette color or the embossed spine title text sitting on top of it.

```
Seamless tileable texture of fine aged leather grain, close-up macro
photograph, viewed straight-on (no perspective, flat orthographic
framing suitable for a repeating background pattern). Neutral warm
mid-brown leather tone (the texture will be color-tinted afterward via
CSS blend modes, so favor natural leather grain detail and subtle tonal
variation over a strong base color of its own). Fine natural leather
grain -- small irregular creases and a soft pebbled surface typical of
a bound book cover, NOT a large-scale cowhide/saddle-leather pattern,
NOT distressed or heavily worn, NOT patent/glossy leather. Reads as a
well-kept antique book binding, restrained and refined rather than
rugged. Very even, soft, diffused lighting -- low contrast throughout,
no strong highlights or shadows (this layer sits at low opacity under
book-cover text and UI elements, so it must stay subtle and never
create a bright or dark patch that could reduce text legibility when
tiled behind it).

Must tile seamlessly: left edge must match right edge, top edge must
match bottom edge, no visible seam when repeated in a grid. Square
canvas, minimum 1024x1024px (2048x2048px preferred). Photorealistic
macro-photography quality, matte/suede-adjacent finish rather than
glossy. No people, no text, no watermark, no signature, no logos, no
visible edges/borders/frame -- texture must fill the entire canvas
edge-to-edge.

Negative prompt (if supported): people, human figures, text, words,
letters, watermark, signature, logo, visible seams, hard shadows,
glossy/patent leather reflections, large cowhide pattern, distressed/
cracked leather, cartoon, illustration
```

---

## Notes for whoever generates these

- **Test the seamless tiling before committing the asset.** Not every generator guarantees true edge-matching even when asked — if the tool doesn't have a dedicated "seamless/tileable" mode, generate at 2x the target canvas size and crop/offset-wrap the result to hide the seam, or use an image editor's offset filter to check for a visible seam line before finalizing.
- **Check the opacity at actual size before finalizing**, not just at full-canvas preview — both textures render tiny in practice (a `.shelf-book` face is roughly 44×150px), so grain that looks good zoomed-in on the generated 1024px+ tile can turn into visual noise once tiled at that scale. If it reads as noisy/busy at real size, a coarser/larger-grain variant will tile better at this element size than a very fine-grained one.
- Neither asset is a hard dependency for Phase 1/2 — both already shipped and render correctly with gradients-only fallback per the design spec's own explicit fallback requirement. These textures are additive polish for Phase 3, not a blocker.
- File paths, once generated: `frontend/LuminaChronica.Client/wwwroot/images/library/shelf-wood-texture.webp` and `frontend/LuminaChronica.Client/wwwroot/images/library/book-leather-texture.webp` (directory doesn't exist yet — create it alongside adding the files).
