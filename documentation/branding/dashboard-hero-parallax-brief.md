# Dashboard Hero — three-layer parallax asset brief

Companion to `docs/superpowers/specs/2026-09-07-dashboard-rework-design.md`'s Phase 2 (gated on these assets existing). Three separate images — Background, Midground, Foreground — composited with CSS `transform`/`opacity` scroll-linked parallax behind the Dashboard's "Weiterlesen" section.

**Style: photorealistic, matching `wwwroot/images/hero-banner.png`** — not the anime/manga-painted style of the five Lumina mascot illustrations (`lumina-archivist.webp` etc.). That style was chosen deliberately: this is a pure architectural establishing shot with no character in it, and `hero-banner.png` is the asset the original design spec named as the reference point.

## Shared technical requirements (all three layers)

- **Aspect ratio**: 21:9 (or wider), minimum 3000×1300px per layer. The Dashboard hero container is full-width but short (`height: 38vh`), and parallax scrolling needs vertical bleed beyond what's visible at rest — generate wider/taller than the visible frame rather than exactly to it.
- **Consistent camera**: all three layers must share the same single-point perspective, vanishing point, and eye-level camera height — looking straight down the center aisle of the hall. If your tool supports image-to-image / "use as reference" (Midjourney `--cref`, ChatGPT image edit, SDXL img2img at low denoise), generate Background first and feed it in as the reference for Midground and Foreground so the perspective actually lines up. Three independent text-to-image generations will very likely NOT agree on perspective by chance.
- **Color grading**: warm golden-amber, matching `hero-banner.png`'s palette — no cool blues, no desaturated tones.
- **No people, no text, no watermark, no signature, no logos** in any layer.

## Layer 1 — Background

```
Cinematic photorealistic digital painting of the interior of a grand ancient
Alexandria-style library hall, viewed straight down the center aisle. Tall
carved stone columns and arched doorways recede into soft atmospheric haze,
rows of towering dark wood bookshelves lined with leather-bound books run
along both sides into the distance, faint warm golden light glows from
unseen windows beyond the far archway. Single-point perspective, vanishing
point centered horizontally, roughly two-thirds up the frame, eye-level
camera. Warm golden-amber color grading, rich dark wood and aged stone
textures, moody atmospheric depth, matte-painting quality, ultra-detailed,
high dynamic range. Wide cinematic aspect ratio (21:9), no people, no text,
no watermark, no signature.

Negative prompt (if supported): people, human figures, characters, text,
words, letters, watermark, signature, logo, modern objects, cartoon, anime,
line-art illustration
```

Leave the lower third and both side edges of the frame relatively open/dark — that's where Layer 3's silhouettes will sit on top.

## Layer 2 — Midground (light + dust only)

```
Soft golden light shafts streaming down from tall unseen clerestory windows
inside a grand ancient library hall, thick with slowly drifting dust motes
caught in the light, two or three ornate hanging brass lanterns suspended
at different depths along the aisle with a warm candle-like glow, faint
wisps of atmospheric haze. Same single-point perspective and vanishing
point as looking straight down a library aisle at eye level. Warm
golden-amber tones, photorealistic, cinematic volumetric lighting,
ultra-detailed.

IMPORTANT for compositing: render ONLY the light shafts, dust particles,
and lanterns — everything else (floor, walls, columns, shelves) must be
pure flat black (#000000), completely unlit and featureless, so this layer
can be composited over Layer 1 using a "Screen" or "Lighten" blend mode.
Wide cinematic aspect ratio (21:9), same canvas size as Layer 1. No people,
no text, no watermark, no signature.
```

If your tool doesn't reliably produce a true flat-black backdrop, a close approximation (near-black, unlit) still works — lift the black point in an image editor afterward (Levels/Curves) before applying the Screen blend, same fix used for any real photographic light-only plate.

## Layer 3 — Foreground silhouette

```
Close-up view as if standing between a carved stone column on the left and
a tall wooden library bookshelf on the right, both cropped tightly at the
outer edges of the frame, looking down the same library aisle beyond them.
Both the column and the bookshelf are rendered as dark, detailed silhouettes
with only faint warm rim-lighting catching their edges from the glow of the
hall beyond. Same single-point perspective and vanishing point as the
background aisle shot, eye-level camera. Warm golden-amber rim-light only,
photorealistic, cinematic, ultra-detailed.

IMPORTANT for compositing: the entire center two-thirds of the frame (where
the aisle beyond would be visible) must be rendered as one single flat solid
color — pure magenta (#FF00FF) — completely uniform, no gradient, no scene
detail, so it can be chroma-keyed out afterward, leaving only the left and
right silhouette edges opaque. Wide cinematic aspect ratio (21:9), same
canvas size as Layers 1-2. No people, no text, no watermark, no signature.
```

Pure magenta is deliberate — it's a color unlikely to appear anywhere else in a warm gold/amber/brown scene, which makes chroma-keying clean. Green would risk keying out real greenish shadow tones in the wood.

## After generation

1. Composite-check all three layers together in an image editor before calling them done — confirm the vanishing points actually align once stacked (Background bottom, Midground on Screen/Lighten, Foreground on top after chroma-keying out the magenta).
2. Export masters as PNG (kept untracked/local, same convention as the mascot masters — see `.gitignore` and `documentation/Architecture.md`'s asset-pipeline decision-log row).
3. Optimize to WebP the same way the mascot assets were (Pillow, similar quality target) before committing — suggested names: `dashboard-hero-background.webp`, `dashboard-hero-midground.webp`, `dashboard-hero-foreground.webp` in `wwwroot/images/` (or a new `wwwroot/images/hero/` subfolder, since this is a distinct asset family from `mascot/`).
4. Once all three exist, Phase 2 of the Dashboard Rework plan is unblocked.
