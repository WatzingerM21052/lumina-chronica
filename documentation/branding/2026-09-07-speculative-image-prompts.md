# Speculative image prompts (2026-09-07)

Written ahead of schedule because the user's image-generation subscription expires today. **None of these are committed/scoped assets yet** — Statistics is the only page whose rework is actually being scoped right now (still in progress), Library/Offline haven't been touched at all, and Alexandria/Babylon have no decided palette. Treat every section below as "generate now as a hedge, decide whether to use it later." If a page ends up not wanting a hero at all, the image is just unused — no harm done.

Two established style families already exist in this app, and everything below sticks to one or the other rather than inventing a third:

- **Photorealistic architectural style** — used for `hero-banner.png`/`home-hero.jpg` and the three Dashboard-hero parallax layers (`documentation/branding/dashboard-hero-parallax-brief.md`). Warm golden-amber grading, single-point perspective, no people.
- **"Lumina" character illustration style** — used for the five mascot loading illustrations (`wwwroot/images/mascot/lumina-*.png`). A recurring painted anime/manga-style character: long wavy blonde hair in a braided half-crown, pale cream/white Grecian toga dress, gold armlets/bracelets/necklace, soft sepia-toned vignette border, warm candlelit ancient-library settings, ink-and-watercolor painterly rendering. Every prompt below that needs this character describes her the same way, so a fresh generation stays consistent with the five that already exist.

---

## 1. Statistics hero — "The Reading Observatory"

Speculative: whether Statistics gets a hero at all is not decided yet (still mid-scoping). Photorealistic style, matching the Dashboard hero's single-flat-image approach (not multi-layer — that's a Dashboard-specific decision, not a default).

```
Cinematic photorealistic digital painting of an ancient astronomical
observatory built into a grand library, viewed from within a circular
domed chamber. A large brass and bronze armillary sphere and an ornate
astrolabe sit on a carved stone pedestal in the center, surrounded by
tall shelves of star-charts and scrolls. Warm candlelight and lantern
glow mix with cool moonlight streaming down through a circular oculus
opening in the domed ceiling above, illuminating drifting dust motes.
Polished brass instruments catch warm highlights against deep shadow.
Single-point perspective, eye-level camera looking toward the central
instrument. Warm golden-amber and deep midnight-blue color grading,
rich brass and aged-bronze textures, moody atmospheric depth,
matte-painting quality, ultra-detailed, high dynamic range. Wide
cinematic aspect ratio (21:9), minimum 3000x1300px, no people, no text,
no watermark, no signature, no logos.

Negative prompt (if supported): people, human figures, characters, text,
words, letters, watermark, signature, logo, modern objects, cartoon,
anime, line-art illustration
```

**Why brass/midnight-blue instead of pure gold-amber like Dashboard**: Statistics is "stark inszeniert, aber datenorientiert" per #358 — the brass-instrument/observatory framing is what the issue's own "Brass Reading Dial" language for the Goal Ring points at, so the hero should set up that same material language before the user even reaches the ring. The cool moonlight accent is the one deliberate departure from Dashboard's all-warm palette, to keep Statistics visually distinct rather than a re-skin of the same hall.

---

## 2. Library hero — "The Private Stacks"

Speculative, and lower-confidence than Statistics — #358 explicitly says Library must stay content-first ("Bücher müssen dominieren"), so a big showy hero is the least likely of the three to actually get used. Generate as a hedge, but expect this one is the most likely to sit unused.

```
Cinematic photorealistic digital painting of a narrow, intimate private
library alcove, viewed straight ahead down a short row of personal
bookshelves. Warm wood-paneled walls, a single comfortable reading
armchair with a worn leather cushion tucked into a window nook on the
left, soft late-afternoon light filtering through a tall arched window,
a small stack of personal books left open on a side table. Quieter and
more intimate in scale than a grand hall — this is one person's private
reading corner, not a public monument. Warm golden-amber color grading,
soft natural window light, cozy and lived-in rather than opulent,
matte-painting quality, ultra-detailed. Wide cinematic aspect ratio
(21:9), minimum 3000x1300px, no people, no text, no watermark, no
signature, no logos.

Negative prompt (if supported): people, human figures, characters, text,
words, letters, watermark, signature, logo, modern objects, cartoon,
anime, line-art illustration, grand hall, cathedral scale, columns
```

**Why intimate/small-scale instead of a grand hall**: this is the one deliberate content-first constraint from #358 baked directly into the prompt — a hero this quiet and small-scale is much less likely to compete with the book grid it sits above, if it ends up used at all.

---

## 3. Offline hero — "The Travelling Library"

Speculative. Lower-immersion page per #358 ("ruhig").

```
Cinematic photorealistic digital painting of an antique leather travel
trunk sitting open on a wooden train-compartment floor, packed with neatly
arranged old books, a folded wool blanket, and a small brass travel
lantern. Warm late-afternoon light streams in through a train window to
the side, motes of dust visible in the light shaft. A worn leather
travel strap and a pocket compass rest on top of the books. Cozy,
intimate, human-scale composition — nothing monumental. Warm amber and
soft brown color grading, soft directional window light, matte-painting
quality, ultra-detailed. Wide cinematic aspect ratio (21:9), minimum
3000x1300px, no people, no text, no watermark, no signature, no logos.

Negative prompt (if supported): people, human figures, characters, text,
words, letters, watermark, signature, logo, modern objects, cartoon,
anime, line-art illustration, grand hall, cathedral scale, columns
```

---

## 4. Profile Ex-Libris seal

Not a hero — a small decorative bookplate/crest graphic for the private Profile page ("persönlich/hochwertig wie ein Ex-Libris/Archivdossier"). Needs a **transparent background** so it can sit on any theme's paper color. Square-ish, not wide.

```
A hand-drawn antique ex-libris bookplate design, circular ornamental
border made of laurel leaves and a coiled ribbon, centered on an open
book with a single lit oil lamp resting on its pages, a quill crossed
behind it. Fine engraved linework in the style of a 19th-century copper
etching, sepia-brown ink on a transparent background — no paper texture,
no background color, isolated emblem only. Ornamental flourish border,
symmetrical composition, elegant serif-adjacent linework, no lettering
or monogram (the app inserts the username separately). Square canvas,
minimum 1200x1200px, transparent PNG background, no watermark, no
signature.

Negative prompt (if supported): text, words, letters, monogram, initials,
watermark, signature, logo, photorealistic, color background, paper
texture, people, human figures
```

**Why no lettering baked in**: the emblem needs to work as a reusable decorative frame regardless of which user is viewing their own profile — any name/initial goes in as real text from the app, not baked into the image.

---

## 5–6. Alexandria mood boards (2 directions — for picking a palette, not final assets)

Alexandria has no decided palette yet. These two directions are deliberately different from each other and from the existing warm-amber library look already used everywhere else in the app, so picking between them (or neither) actually narrows something down.

**Direction A — sun-bleached marble & lapis blue** (leans into "lost to time, rediscovered", cooler and more monumental):

```
Cinematic photorealistic digital painting of the ruined but re-illuminated
interior of the ancient Library of Alexandria, sun-bleached white marble
columns and shelving, deep lapis-lazuli blue and gold mosaic tilework
inlaid along the base of the walls, tall papyrus scrolls stacked in open
alcoves. Warm late-afternoon Mediterranean sunlight streams through a
partially collapsed ceiling, mixing with cool blue shadow. Sand and dust
drift in the light. Warm gold and deep lapis-blue color grading, ancient
Egyptian-Greek architectural details, matte-painting quality,
ultra-detailed. Wide cinematic aspect ratio (21:9), no people, no text,
no watermark, no signature, no logos.
```

**Direction B — candlelit scriptorium, warmer and more intimate** (closer to the existing warm-amber look, but with distinctly Egyptian/Hellenistic material details so it doesn't just read as "the same hall again"):

```
Cinematic photorealistic digital painting of a candlelit ancient
scriptorium inside the Library of Alexandria, rows of scribes' desks with
papyrus scrolls, reed pens, and clay ink pots, carved sandstone columns
with hieroglyph-adjacent Hellenistic reliefs, warm terracotta and sand
tones throughout. Golden candlelight glow, deep warm shadow, richly
textured papyrus and sandstone surfaces, matte-painting quality,
ultra-detailed. Wide cinematic aspect ratio (21:9), no people, no text,
no watermark, no signature, no logos.
```

## 7–8. Babylon mood boards (2 directions)

Babylon has no decided palette yet either. Both directions lean into the real historical Ishtar-Gate glazed-tile palette (blue/turquoise + gold), which is the single most distinct departure available from the app's existing all-brown/gold look — worth deciding early since it's the biggest visual swing of anything in this batch.

**Direction A — glazed blue-tile hall, lush and vivid:**

```
Cinematic photorealistic digital painting of a grand hall inspired by the
Hanging Gardens of Babylon, walls covered in glazed turquoise-blue
ceramic tile with gold relief patterns of lions and flowers (Ishtar
Gate style), tall terraced stone balconies overflowing with lush
cascading green vines and blooming flowers, warm sunlight filtering
through the greenery. Vivid turquoise-blue and gold color grading,
lush saturated greens, richly glazed tile textures, matte-painting
quality, ultra-detailed. Wide cinematic aspect ratio (21:9), no people,
no text, no watermark, no signature, no logos.
```

**Direction B — dusk terrace, quieter and more atmospheric:**

```
Cinematic photorealistic digital painting of a quiet terraced garden
library at dusk, inspired by the Hanging Gardens of Babylon, stone
reading nooks built into a hillside of cascading greenery and trailing
vines, small bronze oil lamps glowing warmly among the plants, a
turquoise-blue glazed-tile mosaic path winding through. Deep dusk-blue
sky fading to warm amber at the horizon, soft lamp glow, lush but
softly lit greenery, matte-painting quality, ultra-detailed. Wide
cinematic aspect ratio (21:9), no people, no text, no watermark, no
signature, no logos.
```

---

## 9–12. Missing mascot illustrations — Search, Writing, Save, Ai

Fills a gap that already existed before today's #358 work (Roadmap Phase G: 4 of 9 `LoadingIndicatorType` values still render the plain spinner ring, no illustration). Not part of #358 — a standing opportunity, included because the subscription window is closing.

**Character, identical in every prompt below** (copy this block into whichever generator you use, exactly as written, the same way `lumina-archivist.png`/`lumina-scribe.png` etc. were generated): *a young woman with long wavy golden-blonde hair styled in a braided half-crown, fair skin, soft warm blush, wearing a pale cream/white sleeveless Grecian toga-style dress cinched with a tasseled gold cord belt, gold armlets on both upper arms, a delicate gold necklace and earrings.* Painted anime/manga illustration style, soft ink-and-watercolor rendering, warm candlelit ancient-library setting, soft sepia-toned vignette border around the whole image (matching the existing four mascot illustrations' framing exactly), no other people, no text, no watermark, no signature.

**Search** — actively searching, distinct from Archivist's calm shelving pose:

```
[character block above], crouched slightly beside a low shelf of stacked
scrolls in a dim library aisle, holding up a small brass oil lantern in
one hand to read the faded labels on the scroll-ends, her other hand
reaching toward one half-hidden scroll, an intent, searching expression,
a small stack of already-checked scrolls set aside on the floor beside
her. Warm golden lantern-light as the main light source against deep
surrounding shadow, painted anime/manga illustration style, soft
ink-and-watercolor rendering, sepia-toned vignette border. Portrait
orientation, minimum 1000x1200px, no text, no watermark, no signature.
```

**Writing** — composing/journaling, distinct from Scribe's formal transcription-desk pose:

```
[character block above], sitting cross-legged in a sunlit window nook
with a small lap-desk, a fresh blank scroll unrolled across her knees,
quill raised mid-thought just above the page as though pausing to
choose the next word, a faraway thoughtful expression, soft daylight
from the window mixing with warm interior candle-glow. Painted
anime/manga illustration style, soft ink-and-watercolor rendering,
sepia-toned vignette border. Portrait orientation, minimum 1000x1200px,
no text, no watermark, no signature.
```

**Save** — a clear preserving/securing visual metaphor:

```
[character block above], carefully pressing a wax seal stamp onto a
rolled and ribbon-tied scroll resting on a wooden desk, a small stick of
melted red sealing wax and a lit candle beside her hand, a satisfied
gentle smile, warm candlelight catching the wax and gold ribbon. Painted
anime/manga illustration style, soft ink-and-watercolor rendering,
sepia-toned vignette border. Portrait orientation, minimum 1000x1200px,
no text, no watermark, no signature.
```

**Ai** — the trickiest one: no modern robot/AI imagery (would break the ancient aesthetic entirely). Framed instead as an "oracle of knowledge" moment, tying into the app's own name (Lumina = light):

```
[character block above], standing before a large open book resting on
an ornate pedestal, its pages glowing softly with warm inner light that
illuminates her face from below, faint luminous golden motes rising up
from the pages like light catching dust, her expression calm and
attentive as though listening to the book. No visible text or symbols
on the glowing pages — the glow itself is the only effect, not readable
writing. Warm golden magical glow as the dominant light source against
dim library shadow, painted anime/manga illustration style, soft
ink-and-watercolor rendering, sepia-toned vignette border. Portrait
orientation, minimum 1000x1200px, no text, no watermark, no signature.

Negative prompt (if supported): robot, technology, computer, screen,
circuitry, futuristic, sci-fi, readable text, glyphs, runes
```

---

## After generating

Same pipeline as every other asset in this repo: drop PNG masters into the relevant `wwwroot/images/...` folder (gitignored, per `.gitignore`'s raster-masters section), optimize to WebP via Pillow (existing pattern: mascots ~1000px wide @ q82, hero layers ~2400px wide @ q82), commit only the optimized WebP. Nothing here is wired into any component yet — that happens when each page/theme actually gets scoped and planned.
