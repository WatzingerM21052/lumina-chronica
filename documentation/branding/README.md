# Logo/Favicon candidates (issue #140)

Five candidates were generated for the "Licht + Chronik" (light + chronicle) mark: a
handgefertigtes SVG (A) and four AI-generated variants via Canva (B–E), all combining
a candle flame with an open book.

**Chosen: D — Konturlinie** (pure line-art contour style). The other four (A, B, C, E)
are kept here as reference/backup per an explicit request, not because they're expected
to be used — nothing outside this folder references them.

`candidate-D-konturlinie-original-ai.png` is the raw AI-generated raster. It was not
shipped directly — a raster favicon blurs at 16/32px, and freehand-redrawing it by eye
(the first attempt) lost too much of the actual linework detail. The shipped asset
(`candidate-D-konturlinie-shipped-vector.svg`, same file as `wwwroot/favicon.svg`) is
instead a faithful vector trace of the real PNG: bilinear-upscaled 4x, lightly blurred
to bridge 1px antialiasing gaps in the thin flame stroke (fixes fragmentation seen when
tracing the original resolution directly), then traced with `potrace` at a high
`optTolerance` to smooth the resulting curves. A real bug was caught mid-process:
potrace emits `fill-rule="evenodd"` on its `<path>`, separate from the `d` attribute —
dropping it (an early version of the trace script did, extracting only `d`) silently
fills in every hole, turning the hollow line art solid.

Shipped, in `wwwroot/`:
- `favicon.svg` — the mark on its own dark medallion background (works standalone in a
  browser tab regardless of the browser's own light/dark chrome).
- `favicon-32.png` / `favicon-16.png` / `apple-touch-icon.png` — raster fallbacks.
- `branding/logo-mark.svg` — the same mark without the medallion background, used
  inline in the header next to the Fraunces wordmark (the header is already
  `--color-bg-dark`, so a second dark circle behind it would be redundant).
