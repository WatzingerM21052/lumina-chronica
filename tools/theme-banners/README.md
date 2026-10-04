# Theme banners

How the page banners and journey pictures of every theme except Babylon and
Alexandria were made (2026-10-04, PRs #583–#594). The finished pictures live in
`frontend/LuminaChronica.Client/wwwroot/images/themes/<theme>/`, their sources
in `images/themes/CREDITS.md`. The source scans themselves are not in the repo
(several MB each); the scripts download them again.

Requirements: Python 3 with Pillow (`pip install pillow`). The scripts write
into their own folder; run them from here.

## The idea

A public-domain or CC0 engraving is turned into an **alpha mask of its lines**
(a high-pass: blur minus original, so dark hatching becomes opaque and both
paper and large dark areas become transparent). The app paints that mask in the
theme's ink colour (`--banner-mask` in `Styles/app.css`, colour
`color-mix(--color-text-secondary 65%, --color-primary)`), so one picture works
on light and dark themes alike.

Rules that came out of the user's feedback:

- **One wide engraving per banner**, across the full width. Rows of two or
  three narrow plates and single narrow motifs on the right looked cut off.
- **No picture twice** (not between pages, not between themes).
- **CC0 or public domain only**, with an entry in `CREDITS.md`.
- Sources at least about 2400 px wide; banners are 2400×560 WebP.

## Steps

1. **Find candidates** on Wikimedia Commons (licence and size filtered, numbered
   contact sheets):

   ```
   WIDE=1 python candidates.py <folder> "query 1" "query 2" ...
   ```

   `WIDE=1` keeps only landscape pictures (width ≥ 1.3 × height), `MINPX=1800`
   lowers the size limit. Look at `<folder>/sheet_N.jpg`; Rijksmuseum searches
   in Dutch (`"Interieur van een bibliotheek RP-P"`) give the best CC0 prints.

2. **Download the chosen ones** in full size (writes `src_<n>.jpg` and
   `credits.json`):

   ```
   python fetch_chosen.py <folder> 3 17 24
   ```

3. **Describe the banners** in a JSON config (see `configs/`), one entry per
   output file:

   ```json
   {"nachtgarten-settings": {"src": "src_2.jpg", "mode": "band", "trim": [0.08, 0, 0, 0.08], "cy": 0.45}}
   ```

   - `mode`: `band` (wide picture cropped to the banner, use this), `solo`
     (one picture with an oval vignette, for the journey decorations),
     `motif`/`row` (narrow plates; no longer used for banners).
   - `box`: crop as fractions `[x0, y0, x1, y1]`; leave it out for automatic
     plate detection. `trim`: cut more off inside the box (`[left, top, right,
     bottom]`, e.g. a caption at the bottom).
   - `cy`: vertical centre of the banner crop (0 = top, 1 = bottom).
   - `floor`, `gain`, `radius`: line extraction (defaults 6, 9, 6; lower
     `floor`/higher `gain` for faint prints).

4. **Render**:

   ```
   python make_banners.py <folder> <config.json> <folder>/out
   ```

   `out/preview.jpg` shows every banner on paper and on a dark ground; check
   it before copying the `.webp` files into `images/themes/<theme>/` and
   adding the credits.

## Other scripts

- `make_alt_themes.py` — generates the five alternative theme stylesheets
  (`Styles/themes/{skriptorium,abendhafen,ischtar,daemmergarten,nachtgarten}.css`)
  from `configs/palettes.json`: full token set, text contrast ≥ 4.5:1 on the
  card (asserted), header signature and banner map. Re-running it overwrites
  later hand edits in those files (e.g. the `--j-engr-*` block), so compare
  with git afterwards.
- `commons_search.py`, `classic_fetch_all.py` — the earlier, simpler search
  and download helpers of the first classic round.

## Configs

`configs/` holds the configs as used. Their `src_<n>.jpg` names refer to the
numbering of the candidate runs at the time and are only meaningful together
with the matching `credits.json` (see `CREDITS.md` for the actual source of
every published picture).
