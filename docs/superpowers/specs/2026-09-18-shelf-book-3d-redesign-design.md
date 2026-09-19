# Shelf Book 3D Redesign

## Overview

Follow-up to PR #447 (Library Shelf Rework, "book realism + animation polish"), which the user rejected after living with it: *"ja aber irgendwie ists noch immer ein komisches T anstatt ein 3d buch"* (see `documentation/Roadmap.md` and `docs/superpowers/specs/2026-09-16-library-shelf-cabinet-design.md`'s revision history for the prior attempt). This phase replaces the shelf book's geometry itself, not just its surface decoration.

Reference material: the user's own curated `bookshelf ideas/` folder (repo root, gitignored) — two real hardcover-book CSS demos (`dark-academia-bookshelf`, `bookshelf`) confirmed the "roundness via shading on a flat plane" technique used elsewhere for spines, but that alone does not fix a two-face object read as flat; general CSS-cube research (`scastiel.dev/animated-3d-book-css/`, standard CSS-cube tutorials) confirmed the correct multi-face box construction. All geometry below was interactively verified in a browser (color-coded debug faces at stepped rotation angles, then the real textured faces at multiple angles including a 160° back-check) before being written here — this spec's numbers are not theoretical.

## Problem

`.shelf-book-spine` and `.shelf-book-cover` (`ShelfBook.razor`, `app.css`) are two flat, independently-rotated faces meeting at a shared edge with no true box geometry connecting them: the cover face is positioned as if hinged off the spine's edge (`rotateY(90deg) translateZ(1.6rem)`) rather than as an opposite face of a real box sharing a common center, so the two faces slightly interpenetrate at the seam instead of meeting exactly. PR #447's attempt to add a third rotated "pages" face on top of this inherited geometry z-fought intermittently — recorded in project memory as "a genuine CSS limitation." Re-deriving the box math this session shows that conclusion was very likely wrong (the same class of unquestioned-plausible-story mistake this project has hit before, e.g. PR #442's transform-order theory): a correctly-centered box, where every face's `translateZ` is exactly half of the *other* pair's own dimension, has faces that share edges exactly with zero overlap and does not z-fight. Verified live with a 6-face color-coded debug model swept through -180° to 180° — no ghosting at any angle.

## Goal

Replace the 2-face hinge construction with a true 6-face rigid box (cover, back, spine, fore-edge/pages, top-edge, bottom-edge), dimensioned from the app's own already-established sizes — no new arbitrary numbers:

- **T (thickness/depth) = 3.25rem** — the existing `.shelf-book` width, i.e. the spine's on-screen size at rest.
- **W (cover width) = 6.3rem** — the existing revealed-cover width.
- **H (height) = 9.5rem** — unchanged, constant across all faces.

Plus period-appropriate hardcover details the user asked for explicitly ("Einband, Band"), researched and verified live:
- **Kapitalband** (headband): a small woven two-tone band at the spine's top and bottom, where the page block meets the binding.
- **Erhabene Bünde** (raised spine bands): 4 horizontal ridges across the spine, the classic cords-under-leather look of a fine binding.
- **Gilt double-rule frame** on the cover, inset from the board edge.
- **Turn-in edge**: a subtle darker inset ring on cover/back simulating where the leather wraps the board.
- **Lesebändchen** (ribbon bookmark): a thin ribbon on the fore-edge face, overhanging the bottom with a V-notch.
- **Author name** on both cover and spine (the data — `Book.Author` — is already bound on the cover today; spine currently shows title only).

## Explicitly Out of Scope

- **Real photographic/generated page-block texture.** The fore-edge/top/bottom "pages" faces use a CSS `repeating-linear-gradient` placeholder (irregular leaf rhythm + a bulge via layered inset shadows), same technique family as the leather-grain overlay already in this codebase. A real generated asset is a natural follow-up once the user generates one (see "Optional Future Asset" below) — this phase ships correctly without it, same "structure now, asset later" pattern as the Cabinet phase.
- **Per-theme variation** of any of the new decorative elements (headband color, gilt frame, etc.) — uses the existing gold/leather palette tokens already established for the shelf, not new theme-specific variants.
- **Changing the reveal *interaction* itself** — hover/focus/touch two-tap, the reveal state machine, neighbor-parting, and `.shelf-book-slot`'s `perspective` rule (Phase A) are unchanged. This phase touches the rotated geometry and the rotation *angle constants* only, not when/how a reveal is triggered.
- **Corner wear, distressed/used-book textures** — this is a "gehobene Privatbibliothek" aesthetic (established project-wide), not a worn-book one.

## Design

### Face geometry (verified)

All faces are children of the existing `.shelf-book-rotator` (`transform-style: preserve-3d`, `transform-origin: 50% 100%` — bottom-center pivot, unchanged from today). Each face keeps `backface-visibility: hidden`.

| Face | Transform | Size |
|---|---|---|
| `.shelf-book-cover` (front) | `translateZ(1.625rem)` | 6.3rem × 9.5rem |
| `.shelf-book-back` (new) | `rotateY(180deg) translateZ(1.625rem)` | 6.3rem × 9.5rem |
| `.shelf-book-spine` | `rotateY(90deg) translateZ(3.15rem)` | 3.25rem × 9.5rem |
| `.shelf-book-pages` (new, fore-edge) | `rotateY(-90deg) translateZ(3.15rem)` | 3.25rem × 9.5rem |
| `.shelf-book-top` (new) | `rotateX(90deg)`, `transform-origin: top center`, no translate | 6.3rem × 3.25rem |
| `.shelf-book-bottom` (new) | `rotateX(-90deg)`, `transform-origin: bottom center`, no translate | 6.3rem × 3.25rem |

`translateZ(1.625rem) = T/2`, `translateZ(3.15rem) = W/2` — the standard CSS-cube face formula (each face offset by half of the dimension it's *not* spanning). Top/bottom use the edge-pivot technique (rotate around the face's own shared edge with cover) instead of center+translate — equivalent result, simpler, verified live. Spine/pages' local rotation signs are already the "mirrored" convention described below (rest angle stays negative, matching today's `RestRotation`) — this table is what production actually implements, not the sign convention used in the throwaway browser mockup.

**Cover no longer resizes on reveal.** Today's `.shelf-book-cover` hack (fixed narrow footprint at rest, `width`/`left` transition to 6.3rem on hover) is removed entirely — a true box face is always 6.3rem wide; rotation's own perspective foreshortening reveals the width naturally. This deletes two `transition` properties and the associated `--motion-spring-sync` width/left rule (`app.css`, current `.shelf-book-cover` block and its `:hover`/`:focus-visible`/`.is-revealed` sibling rule) — a real simplification, not just an add.

**Old `.shelf-book-cover::after` page-edge strip is removed** — fully superseded by the real `.shelf-book-pages` face.

### Rotation angle convention (breaking change to existing constants)

Today's convention (`ShelfBook.razor.cs`'s `RestRotation`, `shelf-physics.js`'s `REVEALED_ROTATE_Y_DEG = -88`) was tuned for the old 2-face hinge geometry, where rotation 0 already showed the spine. In the new true-box geometry, the spine face is centered at local rotation −90 (its own `rotateY(-90deg)`), so it only faces the camera when the *rotator's* rotation is **+90** (they cancel to 0). The cover faces the camera when the rotator's rotation is **0**.

To keep the codebase's existing sign convention (rest angle is currently negative) with minimal disruption, mirror the box left-right (swap which local rotation spine/pages use: spine → `rotateY(90deg)`, pages → `rotateY(-90deg)`) so the rest angle stays negative:

- `ShelfBook.razor.cs`'s `RestRotation`: rebase from `-9.5 - (Book.Id % 7) * 0.47` (≈ −9.5 to −12.3°) to **`-90 - (Book.Id % 7) * 0.47`** (≈ −90 to −92.8°) — same jitter band, shifted by −80.5°. A rest angle inside this narrow band reads as "pure spine" (verified live: at exactly ±90° the cover edge is fully invisible; the existing ~2.8° jitter band is small enough it stayed visually clean in this session's checks, but confirm live once implemented — this is exactly the kind of "trust the derived number, then verify" step this project's own history says not to skip).
- `shelf-physics.js`'s `REVEALED_ROTATE_Y_DEG`: rebase from `-88` to **`-4`** (near-flat cover, verified live to leave a thin, intentional-looking spine sliver rather than a jarring dead-center flatness).
- The Phase 1 CSS fallback rule (`.shelf-book:hover .shelf-book-rotator`, `.shelf-book:focus-visible .shelf-book-rotator`, etc. — the no-JS/reduced-motion resting state) must be updated to the same `-4deg` target, kept in lockstep with the JS constant per this module's own existing convention (see its file-header comment).

**Spring physics itself (`STIFFNESS = 210`, `DAMPING = 26`) is unchanged** — already critically damped, no visible bounce, by original design intent (see that file's own comment). A mockup iteration this session tried approximating a spring with a bouncy CSS `cubic-bezier` overshoot; live user feedback rejected it as excessive, and re-reading `shelf-physics.js` confirmed the real spring was never supposed to bounce in the first place — the fix was reusing the real formula, not tuning a fake one. Nothing here proposes changing those constants.

### New decorative elements

- **Headband** (`.shelf-book-headband-top`/`-bottom`, on `.shelf-book-spine`): thin (`0.22rem`) absolutely-positioned strips, `repeating-linear-gradient(45deg, ...)` two-tone (reuse the shelf's existing accent/gold tokens rather than the hardcoded demo colors).
- **Spine bands** (`.shelf-book-spine-bands`): one `repeating-linear-gradient` layer producing 4 evenly-spaced light/dark ridge pairs — a single paint layer, no extra DOM nodes.
- **Gilt frame** (`.shelf-book-gilt-frame`, on cover): `position: absolute; inset: 0.32rem` with a `border` + `outline` pair (hairline double rule), using the gold text token already used for spine/cover titles.
- **Turn-in edge**: layered `inset box-shadow` on cover/back (no new element).
- **Ribbon** (`.shelf-book-ribbon`, on the pages face): `clip-path: polygon(...)` V-notch, positioned near the spine-side edge of the fore-edge face, deliberately subtle (verified live it should barely peek past the bottom edge, not read as a large tab).
- **Spine author**: mirrors the existing cover-author conditional (`!string.IsNullOrWhiteSpace(Book.Author)`), same `writing-mode: vertical-rl` as the spine title, smaller/italic.

### Testing

- bUnit: presence of the new face elements (`.shelf-book-back`, `-pages`, `-top`, `-bottom`, headband/spine-bands/gilt-frame/ribbon) when a book renders; spine author renders conditionally on `Book.Author` exactly like the existing cover-author test does today.
- No automated test can verify the actual 3D appearance (rotation angles, face alignment, texture) — this entire phase is CSS/geometry, verified live in a browser, per this project's established pattern (Dashboard Phase 2, Cabinet phase, etc.).
- **Must re-verify live once implemented, not just trust this spec's derived angles**: confirm at rest only the spine is visible (no cover sliver), confirm the revealed state shows the cover with no visible seam/ghosting, and sweep through a few intermediate hover states to confirm no z-fighting at any angle — this session's browser-verified numbers should transfer directly, but the project's own history (PR #442, #447) is a standing reminder that a plausible derivation still needs a live check before being trusted.
- Regression: confirm neighbor-parting, touch two-tap, and keyboard `:focus-visible` reveal still behave identically — this phase changes the rotated geometry and angle constants only, not the state machine driving them.

## Optional Future Asset (not blocking, not part of this phase's implementation)

A real generated page-block/paper-stack texture (photorealistic irregular leaf edges, replacing the current CSS gradient placeholder) would be the natural next step once the user generates it, following the same convention as `book-leather-texture.webp` and the shelf-decor prompts in `LIBRARY_SHELF_IMAGE_PROMPTS.md`. Suggested prompt, to add to that file or a new dated entry if desired later:

> "A macro close-up of a stack of aged cream/ivory book pages seen from the side (fore-edge), showing individual page lines with slight irregular spacing and a subtle outward bulge in the middle, warm sepia-toned lighting, photorealistic, matte-painting quality. Transparent or seamlessly tileable, no text, no watermark, no people. Suitable as a `background-image` texture on a narrow vertical strip."

This phase ships correctly without it (CSS gradient placeholder, already verified to read convincingly at typical shelf-book size).

## Global Constraints

- Reuse T=3.25rem / W=6.3rem / H=9.5rem exactly — these are the app's own existing established sizes, not new numbers.
- `.shelf-book-slot`'s `perspective` rule (Phase A) is untouched — verify this explicitly during implementation, same standing caution as the Cabinet phase's own note.
- `STIFFNESS`/`DAMPING` in `shelf-physics.js` are unchanged.
- No new CSS custom properties/color tokens beyond what's needed for the headband/gilt-frame colors — reuse the shelf's existing gold/accent tokens.
- All existing frontend tests must stay green; this phase adds coverage for new DOM structure, never removes coverage.
- `ShelfBook.razor.cs`'s `RestRotation` and `shelf-physics.js`'s `REVEALED_ROTATE_Y_DEG`/fallback CSS rule must be changed together, in the same change — a mismatch between them would make the JS-driven and no-JS/reduced-motion resting states visibly disagree.

## Revision (post-implementation)

This spec was written before several rounds of live user feedback changed the shipped result. The sections above are left as originally written (for historical context — see the plan's own addenda for exactly what changed and why), but the following are no longer accurate as descriptions of production:

- **Rotation sign convention is inverted from what's written above.** The Face geometry table's `.shelf-book-spine`/`.shelf-book-pages` rows, and the Rotation angle convention section's `RestRotation`/`REVEALED_ROTATE_Y_DEG`/CSS fallback values, all shipped with the opposite sign (rest ≈ +90° + jitter, revealed ≈ +4°, spine `rotateY(-90deg)`, pages `rotateY(90deg)`) after a user-requested reversal of the hover-reveal spin direction. See the plan's "Task 1 Addendum" for the actual shipped values and the reasoning.
- **Raised spine bands ("Erhabene Bünde") and the spine author line were both removed.** Live user feedback found the ridges didn't look good and the author line crowded the title; both were dropped entirely rather than refined. See the plan's "Task 2 Addendum" for what replaced them (a herringbone-weave headband with no ridges, title-only on the spine in a fixed cream color).
- **The ribbon bookmark was removed entirely.** The original fore-edge placement was structurally invisible (the pages face never faces the camera at any angle this book's interaction reaches), so it was moved to the cover face during the final review's fix wave — but after seeing that live, the user found it looked odd there and asked for it to be dropped rather than kept. There is no ribbon in the shipped book. See the plan's "Final Whole-Branch Review Fix Wave" and its own follow-up removal for the history.
- Corners, shadows, and a seam "hinge groove" between the leather faces were softened/added after "klobig" (clunky) feedback — not covered by this spec at all, see the plan's "Task 1 Addendum 2".

The plan file (`docs/superpowers/plans/2026-09-18-shelf-book-3d-redesign.md`) is the authoritative record of what shipped; treat this spec as the original design rationale, not a live description of production.
