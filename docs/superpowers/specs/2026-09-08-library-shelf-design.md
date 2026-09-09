# Library Rework: "Private Stacks" Shelf Design Spec

## Overview

Third scoped slice of backlog issue #358 ("Core App Experience Rework"), after Dashboard and Statistics. #358 describes Library as "atmosphärisch, aber content-first (\"The Private Stacks\"), Bücher müssen dominieren" — deliberately less staged than Dashboard ("The Great Reading Hall") or Statistics ("The Reading Observatory").

The current `/library` page (`frontend/LuminaChronica.Client/Pages/Library.razor`) has no atmosphere at all: a plain `<h1>` header, a functional toolbar (search, genre/tag filters, sort, favorites-only, view toggle), and a flat CSS grid of `BookCard` components. This spec replaces the grid with a genuinely modeled 3D bookshelf that books stand inside, spine-out, and pull forward on hover/focus to reveal their cover — while keeping every existing function (search, filter, sort, favorite, borrowed-badge, reading progress, pagination, shelf-assignment editing) fully intact.

This is explicitly not a decorative-image rework like Dashboard/Statistics's parallax heroes. There is no hero image. The atmosphere comes entirely from the shelf structure, the books' own material rendering, ambient lighting, and the pull-out micro-interaction — matching #358's "content-first" mandate literally: the immersion *is* the content's presentation, not a layer on top of it.

## Visual Style & Atmosphere

Dark Academia / Classic Library aesthetic, warm and historical, not kitschy or "generic fantasy." Reuses the app's existing 4 theme tokens (no new palette) — the shelf's own materials (wood, leather, brass) are additionally grounded in real texture images (see "Texture Assets" below), not just flat token colors, since wood grain and leather cannot be faked convincingly with CSS gradients alone at this level of ambition.

- **Wood**: dark, aged, visible grain, subtle wear at edges — reads as a decades-old private library piece, not rustic/cabin-style.
- **Palette**: dark brown, warm wood, deep near-black brown, muted green, dark bordeaux, dark blue, warm brass/gold, restrained cream/parchment — all mapped to existing theme tokens per-theme (`--color-primary`, `--color-secondary`, `--color-bg-dark`, plus `color-mix()` derivations), so the shelf reads correctly in all 4 themes without new tokens.
- **Lighting**: warm, subtle golden highlighting on books/wood/brass edges. No lens flares, no glowing magic, no neon. Restrained.
- **Header band**: narrow, elegant, clearly calmer than Dashboard/Statistics's tall parallax heroes — no hero image at all, just a modest textured band (reusing the wood/leather texture) carrying the page title, book count, and the (re-skinned, not restructured) existing toolbar controls.

## The Shelf Structure

Each shelf is a **modeled compartment**, not a flat ledge line: a recessed box with a visible back wall (darker, gradient-shaded for depth), a protruding front lip/edge, and enough visual weight to read as a real piece of furniture. This is a direct evolution of the "brass-framed window" compositing technique already proven in the Statistics calendar (Phase C) — a real recessed 3D-feeling container built from layered gradients/shadows/textures, not a literal 3D-modeled scene.

Books within a compartment are **not perfectly evenly spaced**: natural variation in height, width/spine-thickness, and resting angle (small, tight-banded rotation — the brainstorming mockups found that wide rotation variation combined with simultaneous tilt reads as "chaotic zigzag," not natural; the validated approach is a narrow band, e.g. resting `rotateY` within roughly 9-12°, no combined `rotateZ` lean) — enough to feel real without ever looking messy. Small natural gaps and slightly tighter clusters are fine; the shelf must stay *obviously tidy and high-end*, never cluttered.

## The Book: Spine-Out, Cover-on-Reveal

This is the spec's central, already browser-validated mechanic. Each book defaults to showing its **spine** (narrow face, vertical embossed-style title text, gold ornament detail, leather-look gradient) — the cover is not visible at rest.

### Technical approach (validated in the brainstorming companion, 4 iterations)

A book is a small 3D object built from two faces on a shared element:
- `.book` (the rotating object) — `transform-style: preserve-3d`, sits inside a shelf row that itself has `perspective` set on its ancestor.
- `.book-spine` — the front-facing default face (`backface-visibility: hidden`).
- `.book-cover` — mounted at `rotateY(90deg) translateZ(<half-book-width>)` in the book's own local space, so it is normally edge-on/hidden and only becomes visible once the book itself rotates roughly 90° toward the viewer.

**Two real bugs were found and fixed during mockup validation — both are load-bearing implementation constraints, not just historical notes:**

1. **Every intermediate ancestor between the `perspective`-establishing element and the rotating book must also carry `transform-style: preserve-3d`.** A single non-preserve-3d wrapper anywhere in the chain flattens the 3D context at that boundary, and the rotation silently renders as a 2D distortion (looked like the book "sliding sideways") instead of a real turn. If the shelf row wraps each book in its own slot element (needed anyway for the neighbor-parting behavior below), that slot element needs `transform-style: preserve-3d` too.
2. **Transform function order matters — CSS applies the rightmost (innermost) function first.** The hover transform must rotate the book *in its own local frame first*, then translate it toward the viewer/up *in the resulting world frame*: `transform: translateY(<lift>) translateZ(<forward>) rotateY(<~90°>) scale(<grow>)`. Writing `translateZ` before `rotateY` makes the "forward" push happen in the *already-rotated* local frame — which, at large rotation angles, points sideways instead of toward the viewer, and looks like the book flying off to the side instead of pulling out. This exact bug was hit and fixed live during brainstorming; the fix is the specific ordering above, not a coincidence of one set of numbers.

### Resting state

- Book stands mostly spine-on, small resting `rotateY` within the validated tight band (no combined `rotateZ` — that produced the "zigzag" look).
- No cover visible (or a bare sliver, since resting rotation isn't a full 90°).

### Hover / focus-visible (parity required — see Accessibility)

- Book rotates via `rotateY` toward roughly 85-90° from its resting angle (bringing the cover face to front) while lifting (`translateY`) and coming toward the viewer (`translateZ`), with a subtle scale increase.
- Cover becomes clearly readable: cover art, title, author, optionally a small status icon (e.g. in-progress).
- The favorite-star button and "Geliehen von" badge (both currently rendered on `BookCard`'s cover face, see "Preserving Existing Functionality") appear on the revealed cover face, matching their current behavior.
- Immediately adjacent books shift a few pixels apart to make room — subtle, not a shelf-wide reflow. Given arbitrary shelf sizes (not just the 5-book mockup case), this needs to be computed dynamically rather than hardcoded per-position CSS selectors — see "Physics-Based Motion" below.
- Motion duration in the user-approved 300-500ms range, soft/springy easing (see next section) — not abrupt, not sluggish.

### Click

Book stays in its pulled-out position briefly, then navigates to the book detail page (same destination as today's `BookCard` — `library/books/{id}` or an overridden `Href`). Optionally, the pulled-out book can glide slightly further forward just before navigating, as a small transition flourish — implementation detail, not a hard requirement.

## Physics-Based Motion (JS, not pure CSS)

Per explicit direction: this is worth real engineering effort rather than a fixed CSS `cubic-bezier` transition. Extend the existing `frontend/LuminaChronica.Client/wwwroot/js/motion.js` module (which already exports per-feature init functions like `initReveal`/`initHeaderCompact` and has a shared `prefersReducedMotion()` helper — follow that established pattern rather than inventing a separate module) with a spring-physics-driven pull-out animation:

- A lightweight spring model (critically-damped or slightly underdamped for a touch of natural "settle" — no bouncy overshoot that would look cartoonish) driving the book's rotation/lift/forward values every animation frame via `requestAnimationFrame`, rather than letting the browser's CSS transition timing function do it. This directly satisfies the brief's "leichte physische Trägheit" (slight physical inertia) requirement, which a fixed-duration CSS easing curve cannot express as convincingly (a spring's rate of settling depends on how far it has to travel, not a fixed clock).
- The same module computes and applies the **dynamic neighbor-parting offsets**, since a general solution (arbitrary shelf sizes, arbitrary hovered index) is unwieldy in pure CSS `:has()` sibling selectors (the mockup's hardcoded 5-book version does not generalize). On hover-start, walk the DOM siblings within the shelf row outward from the hovered book, applying a small, distance-decaying `translateX` offset (largest for immediate neighbors, negligible by 2-3 books out) — computed once in JS at hover-start, then eased in the same spring loop.
- `prefersReducedMotion()` (already present in `motion.js`) must gate this: on reduced motion, apply the hover/focus end-state instantly (`transition: none` equivalent — no `requestAnimationFrame` loop, no neighbor-parting motion), not remove the cover-reveal capability itself. This matches the project's standing rule (#358: "Layer bleiben statisch sichtbar, nur ohne Parallax/Scroll-Bewegung").
- Must be interruptible: rapidly moving the pointer across several books in a row should not queue up stale animations or leave a book stuck mid-rotation — each book's spring target updates immediately on hover-enter/leave, the loop just continues easing toward whatever the current target is.

## Texture Assets (real images, not faked gradients)

Per explicit direction: generate real texture images for wood grain and leather, applied via `background-image` + `mix-blend-mode` compositing — the same established technique already used for `brass-texture.webp` (Statistics Goal Ring, calendar panel) and the Statistics hero's moonlight layer. Two new assets, under `frontend/LuminaChronica.Client/wwwroot/images/library/`:

- `shelf-wood-texture.webp` — aged dark wood grain, tileable/seamless enough to repeat across shelf compartment backgrounds without an obvious seam, subtle enough to sit at low opacity under the compartment's gradient shading (matching the brass-texture's existing `opacity: 0.15`-style low-intensity blend pattern) rather than dominating.
- `book-leather-texture.webp` — a subtle leather grain, applied at similarly low opacity over each book's spine/cover gradient fill, giving the "Lederoptik" the brief asks for without needing per-book unique leather art.

**This is a dependency, not a blocker**: actual image generation needs the user's own image-gen tooling (same situation noted in the existing speculative-image-prompts doc, `documentation/branding/2026-09-07-speculative-image-prompts.md`). The implementation plan must ship with a graceful fallback — if the texture image is missing/not yet generated, the shelf/book still renders correctly via the existing gradient-only treatment (texture is an `opacity`-layered enhancement, not structurally required) — mirroring how Statistics Rework Phase 1 shipped with a documented known-limitation while its texture asset was still pending, then closed the gap in a follow-up PR once the asset landed.

## Spine Color from Real Cover (Canvas color extraction)

Per explicit direction: rather than a procedurally-random or hash-based spine color unrelated to the actual book, extract the real cover image's dominant color at runtime (via an offscreen `<canvas>`, `drawImage` + `getImageData` sampling, a small utility function — likely also living in or alongside `motion.js`, or a new small JS module if that keeps concerns cleaner) and use it to tint the spine's gradient fill, so a book's spine visually relates to its actual cover instead of being generic.

- **Must be cached, not recomputed per render.** `BookCard`'s existing `BlobUrlService`-based cover loading pattern (object URL per book, cleaned up via the component's existing `IDisposable`) is the integration point — the color extraction happens once per unique cover image (keyed by the same cover URL/blob the existing loading logic already resolves), not on every re-render or every hover.
- **Needs a sensible fallback** for books with no cover image at all (the existing `BookCard` has a placeholder-icon path for this case) — a themed default spine color (e.g. derived from `--color-primary`) rather than attempting extraction from nothing.
- Cross-origin/canvas-tainting: cover images are same-origin blob URLs (already the case via the existing `BlobUrlService` pattern), so `getImageData` should not hit a tainted-canvas security restriction — worth a explicit check during implementation, not just assumed.

## Grouping / Shelf Dividers

**Resolved during brainstorming, explicit decision**: shelf groupings are **visual-only, driven by the page's existing sort/filter state** — they do **not** correspond to the user's actual custom Shelves (the separate, already-existing `/library/shelves` feature with its own `Shelf` model, `Shelves.razor` list page, and `ShelfDetail.razor` page). Mixing the two would create a confusing second meaning for "shelf" on the same page as the literal Regal-Zuordnung feature. The existing sort/filter controls (`_sort`/`_order`/genre/tag/favorites in `Library.razor`) are entirely unchanged — the shelf-row dividers are a presentation layer over whatever the current filtered/sorted result set already is:

- Sorted by "Hinzugefügt" (date added, the default): dividers group by recency ("Diesen Monat", "Letztes Jahr", etc. — reuse the same relative-date-bucketing spirit already established, though the exact bucket boundaries are an implementation detail, not a design decision).
- Sorted by "Titel"/"Autor": dividers group alphabetically (A, B, C…).
- A genre/tag filter is active: the divider can surface the active filter name as its own label instead of/alongside date or alpha buckets — implementation detail to resolve during planning, not a hard requirement here.
- "Nur Favoriten" active with no other grouping-relevant sort: dividers can be omitted (it's already a coherent filtered subset) or kept minimal.

Dividers render as small elegant brass/wood plaques or inset labels (per the brief: "eingelassene Beschriftungen am Regal", "kleine hochwertige Metallplakette") — explicitly **not** styled like ordinary UI tabs, so the grouping information reads as part of the furniture rather than as a navigation control.

## Preserving Existing Functionality (hard constraint, #358 guardrail)

Nothing in `Library.razor`'s current behavior may regress:

- **Search** (debounced, with suggestions dropdown) — unchanged.
- **Genre/Tag filters** (`MultiSelectDropdown`), **sort**/**order** selects, **favorites-only** checkbox, **clear filters** — unchanged, just re-skinned within the new header band (which also benefits directly from the just-shipped app-wide input styling, PR #418).
- **Pagination** — unchanged. This also directly satisfies the brief's own performance concern ("nicht hunderte 3D-Elemente gleichzeitig animieren") — the existing 20-books-per-page cap already bounds how many 3D shelf-book elements exist on screen at once, without needing new viewport-gating logic for a first version.
- **Regal-Zuordnung** (shelf assignment editing) — stays wherever it currently lives in the book interaction flow (today: presumably book detail / a dedicated control, not on this page's cards directly — verify the current entry point during planning and preserve it exactly, don't relocate it into the new shelf visual, since that would conflict with the "visual shelf ≠ real Shelf" decision above).
- **`BookCard`'s existing per-book functionality must be fully ported into the new book component**, not dropped: cover loading via `BlobUrlService` (with proper `IDisposable` cleanup, matching `BookCard`'s existing pattern), the favorite star toggle (`★`/`☆`, optimistic update, `ShowFavorite` gating for borrowed books), the "Geliehen von {username}" borrowed badge, and the reading-progress bar. These all need a home on the book's **cover face** (visible on reveal), consistent with where they render today.
- **List view** (the existing `LibraryViewMode.List` toggle) stays as the compact, non-shelf alternative — the Grid/List toggle becomes Regal/List (shelf is the new default/primary view, replacing the old flat grid; List remains for users who want density over atmosphere). List view's existing rendering (small `BookCard`s in a dense list) is unaffected by any of this.
- **Empty state** (`EmptyState` component, shown when the library has zero books) and the "no results for these filters" message — unchanged, render instead of the shelf when applicable.

## Accessibility

- **Keyboard parity**: `:focus-visible` on a book triggers the identical reveal transform as `:hover` — a keyboard user tabbing through the shelf must be able to reach and reveal every book, not just mouse users.
- **Always-present accessible text**: a book's title and author must exist as real text content (or an `aria-label` covering both) on the interactive element regardless of its current visual rotation state — a screen reader must never depend on the spine-vs-cover visual state to know what book it's looking at. The spine's embossed title text can double as this if it's real DOM text (not a background image with text baked in), or an `aria-label` on the book's root link element can carry title+author+status explicitly.
- **Reduced motion**: covered above — the reveal capability itself is preserved (accessibility requirement in its own right: a `prefers-reduced-motion` user should not lose the ability to identify a book before clicking it), only the animated transition is removed.
- **Focus order**: books within a shelf row should tab in a sensible left-to-right, row-by-row order matching their visual position — default DOM order should already achieve this if books are rendered in their natural sort order within each shelf-row grouping.

## Responsive Behavior

- **Desktop**: full shelf/3D treatment as specced above.
- **Tablet**: shelf stays spatial/3D, but compartments and books scale down — narrower shelf rows, likely fewer books visible per row before wrapping, same interaction model (hover still works on tablets with a mouse/trackpad; touch-primary tablets follow the mobile interaction model below).
- **Mobile**: no attempt to force desktop 3D hover onto touch. Two-tap model, per explicit direction: first tap on a book animates it to the revealed (cover-visible) state — same visual target as desktop hover, likely via the `:focus-visible`-equivalent code path triggered on tap rather than a separate implementation — second tap (or tapping the now-revealed cover) navigates to the book. A tap elsewhere (another book, empty space) should collapse the previously-revealed book back to resting, not leave multiple books stuck open simultaneously.

## File Structure

- **Modify**: `frontend/LuminaChronica.Client/Pages/Library.razor` — replace the flat-grid rendering branch with shelf-row grouping + rendering; header band gets the new textured styling; view-mode toggle relabels Raster→Regal (internal enum name can stay `Grid` if renaming has any awkward ripple effect — cosmetic, not architectural).
- **Create**: `frontend/LuminaChronica.Client/Components/ShelfBook/ShelfBook.razor` (+ `.razor.cs` if the code-behind pattern is cleaner given the amount of interaction logic, matching `BookCard`'s existing `.razor.cs` split) — the individual spine/cover book component, replacing `BookCard` as used on this page specifically (BookCard itself stays unchanged/unremoved — it's still used elsewhere: Home dashboard's continue-reading cards, Statistics's recent-activity list, `PublicProfile`, etc.; this is a new, additional component, not a BookCard rewrite).
- **Create**: `frontend/LuminaChronica.Client/Components/ShelfRow/ShelfRow.razor` (or similar name) — the compartment + divider-plaque + row of `ShelfBook`s.
- **Modify**: `frontend/LuminaChronica.Client/wwwroot/js/motion.js` — add the spring-physics pull-out + neighbor-parting logic, following its existing per-feature export pattern.
- **Create**: a small canvas-based color-extraction utility (JS) — exact file location (new module vs. folded into `motion.js`) to be decided during planning based on how large the resulting code ends up being.
- **Create** (asset dependency, not code): `frontend/LuminaChronica.Client/wwwroot/images/library/shelf-wood-texture.webp`, `book-leather-texture.webp`.
- **Modify**: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (or a new page-scoped stylesheet, following whatever pattern the codebase currently prefers for page-specific CSS this size — check `Statistics.razor.css`-style scoped files vs. `app.css` global additions before committing to one).

## Testing

- bUnit tests for `ShelfBook`/`ShelfRow`: rendering with a given `Book`, verifying the accessible title/author text is present regardless of rendered state, verifying the favorite-star/borrowed-badge/progress-bar all still render under the same conditions `BookCardTests` (if one exists — check) already covers for `BookCard`, verifying divider labels render correctly for each grouping mode (date-bucket, alphabetic, filter-name).
- No automated test can verify the CSS 3D rotation, the spring-physics feel, or the canvas color extraction's visual output — these need live-browser verification (same established pattern as every prior phase this session), including explicit checks for the two validated bug classes (3D context flattening from a missing `preserve-3d` link in the ancestor chain; transform-order regressions in the hover rule) since both are easy to silently reintroduce during implementation.
- Reduced-motion behavior needs explicit live verification (toggle `prefers-reduced-motion` in devtools, confirm instant state change with no spring animation and no neighbor-parting motion, cover still reachable).
- Keyboard-only pass: tab through a shelf row, confirm each book reveals via `:focus-visible` and is announced correctly by accessible-name inspection (or a screen reader spot-check if feasible).

## Phasing

Given this spec's scope significantly exceeds any single prior slice of #358 (new components, a new JS physics module, new image assets, Canvas API integration, full page restructure), it ships as three phases rather than one plan, mirroring the Dashboard/Statistics precedent (structural phase first, polish/motion phase after):

- **Phase 1 — Structure & Mechanic**: shelf compartments, the spine/cover `ShelfBook` component with the validated CSS 3D rotation (plain CSS transition, not yet spring physics), resting-state variation, visual grouping/dividers, the re-skinned header band, and — non-negotiably in this phase, not deferred — full preservation of existing Library functionality (search/filter/sort/pagination/favorites/borrowed-badge/progress) and full accessibility (focus parity, always-present accessible text, reduced-motion fallback). Ships with gradient-only materials (no texture images yet) and procedural (not cover-derived) spine coloring — both upgraded in Phase 3.
- **Phase 2 — Physics-Based Motion**: replaces Phase 1's CSS transition with the `motion.js` spring-physics pull-out animation and dynamic neighbor-parting. Purely a motion-quality upgrade; the interaction's *end state* (rotated, revealed cover) doesn't change, only *how* it gets there.
- **Phase 3 — Materials**: real wood/leather texture images (once generated — an external asset dependency, not blocked on by Phase 1/2) applied via blend-mode compositing, and Canvas-based spine-color extraction from each book's actual cover, replacing Phase 1's procedural placeholder coloring.

## Global Constraints

- No new color tokens/palette — existing theme tokens across all 4 themes, verified live.
- No new motion-token durations invented outside what the spring model needs to feel right within the 300-500ms range given as guidance (not a hard fixed value, since spring physics doesn't have one fixed duration — the important constraint is that it *reads* as being in that range for a typical pull-out, not that a CSS token says "400ms").
- No functional regression on any existing Library capability (see "Preserving Existing Functionality" above) — this is the single most important constraint given the scope of this rework.
- `BookCard` itself is not modified or removed — it remains in use elsewhere in the app unchanged.
- Real texture images are an enhancement layered via low-opacity blend, never a structural dependency — the shelf must still look acceptable (gradients only) if an asset is missing, matching the project's established "ship with documented known-limitation, close the gap later" pattern.
- Accessibility parity between mouse/keyboard/touch is a hard requirement, not a nice-to-have, given the novelty of the interaction (a spine-out book with no visible cover is meaningless to a screen reader without the always-present text-content requirement above).
