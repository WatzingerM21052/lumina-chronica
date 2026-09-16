# Library Shelf Cabinet Design

## Overview

Phase B of the Library Shelf Rework (Phase A shipped the reveal-animation bug fix and reveal-state-machine correctness; see `documentation/Roadmap.md`'s "Library Shelf Rework — Phase A" entry). This phase addresses the other half of user feedback gathered after living with Phases 1-3: the shelf reads as a stack of independent, flat, rounded boxes (one per genre/date group) rather than a single real piece of furniture. Reference material: two AI-generated storyboard mockups (`docs/29378486-34b6-4552-9a3e-1a844bdf2035.png`, `docs/bb369470-99d9-4685-aa84-048f6631ce57.png`) showing a photoreal dark-wood library cabinet with multiple shelves inside one continuous frame, brass-plaque genre labels mounted at each shelf's front edge, and (in the mockups only, explicitly out of scope here — see below) decorative set-dressing.

This is a **structural/CSS restyle**, not a new interaction or JS feature. Nothing about the reveal animation, spring physics, touch two-tap, state machine, or cover-color extraction (Phases A/2/3) changes.

## Problem

Each genre/date group currently renders its own independent `.shelf-compartment` — a self-contained rounded box with its own top/bottom corner radius, its own inset box-shadow, and a gap between it and the next group's box (`ShelfRow.razor`, `app.css`'s `.shelf-compartment`/`.shelf-row-group` rules). Visually this reads as several small stacked crates, not one cabinet with multiple shelf levels — undermining the "the bookshelf IS the UI" ambition the original design spec (`docs/superpowers/specs/2026-09-08-library-shelf-design.md`) set out with. The genre/date labels (`.shelf-plaque`) are floating pill-shaped badges positioned above each compartment, reading as a UI chip, not as part of the furniture.

## Goal

Restructure the Library page's shelf rendering so it reads as **one continuous wooden cabinet containing multiple shelf levels**, matching the mockups' furniture silhouette:

- Visible left/right vertical posts framing the whole shelf block (not per-row).
- A single external rounded silhouette (top and bottom of the whole cabinet), not per-row rounding.
- Individual genre/date groups become shelf *levels* inside that one frame, separated by a thin divider/step rather than a visible gap between independent boxes.
- Genre/date labels become small inset brass plaques mounted at each shelf level's front edge, reusing the already-established `brass-texture.webp` compositing technique (currently used on Statistics' Goal Ring and calendar panel) rather than the current floating pill badge.

## Explicitly Out of Scope

- **Decorative set-dressing** (candle, globe, ivy, busts, ornamental objects) shown in the mockups. These are cosmetic elements that would need dedicated generated image assets the user doesn't have yet — deferred to a future phase once/if those assets exist, following the same "ship structure now, decorative asset phase later" pattern already used for Phase 3's wood/leather textures.
- **Carved corner ornaments/scroll brackets** on the posts (visible in the mockups' post detailing). Optional enhancement, not required for this phase to look correct — see "Optional Future Asset" below.
- Any change to `/library/shelves` (the separate custom-Shelf-collection feature) — untouched, as in every prior Library Rework phase.
- Any change to the reveal animation, spring physics, touch handling, state machine, or cover-color extraction (Phases A/2/3) — this phase touches only the cabinet frame and plaque styling around the existing, unchanged `ShelfBook`/`shelf-physics.js` machinery.
- Any new CSS custom properties or color tokens — reuses existing theme tokens exactly as every prior phase has.
- Any new JS.

## Design

### Structure

**New wrapper**: `Library.razor`'s shelf-rendering branch currently is:
```razor
<div class="library-shelf" @ref="_shelfRef">
    @foreach (var group in LibraryShelfGrouping.Group(...))
    {
        <ShelfRow @key="group.Label" Label="@group.Label" Books="group.Books" />
    }
</div>
```
This becomes:
```razor
<div class="library-shelf" @ref="_shelfRef">
    <div class="shelf-cabinet">
        @foreach (var group in LibraryShelfGrouping.Group(...))
        {
            <ShelfRow @key="group.Label" Label="@group.Label" Books="group.Books" />
        }
    </div>
</div>
```
`.library-shelf` itself (the `@ref`'d element `shelf-physics.js` attaches to) is unaffected structurally — `.shelf-cabinet` is a new child wrapper inside it, purely presentational, not referenced by any JS.

**`.shelf-cabinet`** (new CSS, in `app.css`): owns the cabinet's outer silhouette.
- Left/right vertical posts: a fixed-width band on each side (gradient + inset shadow suggesting a beveled wooden post, reusing the existing wood-grain texture asset already used for `.shelf-compartment::before`), tall enough to span the full stack of shelf levels.
- Top/bottom rounded corners live here now (moved off individual `.shelf-compartment` rules) — the cabinet has ONE external rounded silhouette, not one per shelf level.
- A subtle top "crown" and bottom "base" band (slightly protruding via `box-shadow`/gradient, echoing a real cabinet's top/bottom trim) — CSS only, no new imagery.

**`.shelf-compartment` (per shelf level, in `ShelfRow.razor`'s existing markup) changes**:
- Loses its own top/bottom border-radius and its own external box-shadow (both now owned by `.shelf-cabinet`) — keeps its *inset* shadow (the "recessed back wall" depth effect) and its wood-texture overlay, since those are per-level, correct as-is.
- The gap between consecutive `.shelf-row-group`s shrinks/changes to a thin horizontal divider (a subtle raised strip, suggesting the physical shelf board separating two levels) rather than the current visible margin gap between independent boxes.

**Plaque restyle**: `.shelf-plaque` (currently a floating pill badge positioned via `margin-bottom` above the compartment) becomes a small rectangular inset plaque, reusing the exact established brass-texture compositing technique from `.goal-ring::before`/`.stats-panel.calendar-card::before` (`app.css`, `brass-texture.webp` at `wwwroot/images/statistics/brass-texture.webp` — a generic texture asset, reused cross-feature, not Statistics-specific content) — positioned mounted at the shelf level's own front edge/lip rather than floating above it, matching the mockups' "Zuletzt gelesen"/"Fantasy" plaque placement.

### Testing

- bUnit: verify `.shelf-cabinet` wraps the rendered `ShelfRow`s (`Library.razor`'s own test file, if one exists — check `LibraryPageTests.cs`), and that a `ShelfRow` with a `Label` renders the plaque with whatever new class/structure identifies it as the brass-plaque variant (e.g. confirm the existing `.shelf-plaque` class or its replacement renders with the expected text, matching `ShelfRowTests.cs`'s existing coverage pattern).
- No automated test can verify the actual visual furniture appearance (CSS/gradient/texture-compositing correctness) — verified live in a browser, per this project's established pattern for every prior CSS-heavy phase (Phase 1, Phase 3, Phase A's Task 5).
- Regression: confirm Phase A's reveal animation, neighbor-parting, and touch two-tap still behave identically — this phase changes only the ancestor DOM/CSS around `.shelf-book-slot`/`.shelf-book`, not those elements' own rules, but a live re-check is warranted given `.shelf-compartment`'s `perspective`-adjacent CSS is being restructured nearby (`.shelf-book-slot` itself, which carries `perspective` since Phase A's Task 5, is NOT touched by this phase — confirm this explicitly during implementation, don't assume).

## Optional Future Asset (not blocking, not part of this phase's implementation)

The mockups show subtle carved/scrollwork detail on the cabinet's posts and corners. Achieving that authentically (beyond a plain gradient bevel) would benefit from a small generated decorative asset — e.g. a corner bracket/scrollwork motif, applied the same way `brass-texture.webp`/`shelf-wood-texture.webp` are (`background-image` + low-opacity blend), rather than as a photoreal centerpiece. Suggested prompt for the user's own image-gen tool, to add to `documentation/branding/2026-09-07-speculative-image-prompts.md` (or a new dated entry) if desired later:

> "A small seamless-tileable or single ornamental corner bracket motif, carved dark walnut/mahogany wood with subtle aged brass inlay, Victorian/Edwardian private-library cabinet detailing, restrained and elegant (not ornate/baroque), transparent or plain dark background, suitable as a low-opacity CSS overlay accent — no text, no full scene."

This phase ships correctly without it (plain gradient/shadow bevel on the posts), matching the established "documented known-limitation, close the gap later" pattern from Phase 3.

## Global Constraints

- No new CSS custom properties or color tokens — reuse existing theme tokens and the existing `shelf-wood-texture.webp`/`brass-texture.webp` assets exactly as already established.
- No JS changes — `shelf-physics.js`, the reveal animation, state machine, and touch handling from Phases A/2/3 are completely unaffected.
- `.shelf-book-slot`'s `perspective` rule (Phase A, Task 5) must remain exactly as-is — verify this explicitly during implementation.
- `/library/shelves` is untouched.
- All existing frontend tests must stay green; this phase adds tests for the new DOM structure, never removes coverage.
