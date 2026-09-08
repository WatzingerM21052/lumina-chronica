# Statistics Polish Phase A (Hero Light Transparency) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Statistics hero's moonlight/dust layer read as translucent light instead of a solid, milky shape, per direct user feedback.

**Architecture:** One CSS property change (`mix-blend-mode: screen` on `.stats-hero-layer-2`) in the existing scoped stylesheet. No markup, component, or data changes.

**Tech Stack:** Blazor WebAssembly scoped CSS (`Statistics.razor.css`).

## Global Constraints

- No new color tokens (per #358's standing guardrail — this task adds no colors at all, just a blend mode).
- No new image assets (per the design spec's Phase A section — the fix is CSS-only; image regeneration stays a fallback outside this plan's scope if this fix turns out insufficient).
- Scope is the Statistics hero only. Do not touch `Home.razor.css` / `.home-hero-layer-2` — the design spec explicitly excludes the Dashboard hero from this phase: its own light layer (`dashboard-hero-layer2-lights.webp`) was delivered with genuine per-pixel alpha transparency baked into the asset, so it never needed this compositing fix.
- No bUnit test changes — this is a rendering/compositing behavior with no markup change, so there is nothing for bUnit (which does not execute CSS/paint) to assert on. Verification is live-browser only.

---

### Task 1: Apply `mix-blend-mode: screen` and live-verify

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor.css` (the `.stats-hero-layer-2` rule, currently at lines 39-41: just `z-index: 2;` inherited from the shared `.stats-hero-layer` base rule at lines 27-33)
- Modify: `documentation/Roadmap.md` (append a Phase A entry, same style as the existing Statistics Rework Phase 1/Phase 2 entries)

**Interfaces:**
- Consumes: nothing from other tasks — this is the only task in this plan.
- Produces: nothing consumed elsewhere — this phase is self-contained.

- [ ] **Step 1: Add the blend-mode declaration**

Open `frontend/LuminaChronica.Client/Pages/Statistics.razor.css`. Find the `.stats-hero-layer-2` rule (around line 39):

```css
.stats-hero-layer-2 {
    z-index: 2;
}
```

Change it to:

```css
/* mix-blend-mode: screen lightens rather than darkens -- black pixels
   contribute nothing while bright pixels lighten what's beneath them,
   the correct model for "light shaft over a dark scene." Without it, the
   moonlight/dust layer reads as a solid, milky white shape instead of
   translucent light (user feedback, 2026-09-08). Verified live: the
   background architecture and star-chart windows show through the beam
   with this applied; without it, they don't. Statistics-only -- the
   Dashboard hero's own light layer (dashboard-hero-layer2-lights.webp)
   was delivered with genuine per-pixel alpha transparency baked into the
   asset, so it never needed this compositing fix. */
.stats-hero-layer-2 {
    z-index: 2;
    mix-blend-mode: screen;
}
```

- [ ] **Step 2: Run the frontend test suite as a regression check**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: all existing tests still pass (322/322 as of the last Statistics phase — this task adds no new tests since none are possible for this change, per the Global Constraints above). A failure here would mean something unexpected broke; investigate before proceeding.

- [ ] **Step 3: Commit the CSS change**

```bash
git add frontend/LuminaChronica.Client/Pages/Statistics.razor.css
git commit -m "fix: make the Statistics hero's moonlight layer read as translucent light

mix-blend-mode: screen instead of normal compositing -- black pixels
contribute nothing, bright pixels lighten rather than darken, so the
beam reads as light through the scene instead of a solid milky shape.
Statistics hero only, per direct user feedback."
```

- [ ] **Step 4: Live-verify in the browser**

This step cannot be automated — it is the actual test for this task, per the Global Constraints above (no bUnit coverage is possible for a compositing/rendering change).

1. Start the dev server from `frontend/LuminaChronica.Client`: `dotnet run --urls http://localhost:PORT` (pick any free port).
2. In a browser tab, obtain a valid auth token by registering a throwaway account against the real backend and injecting the returned JWT into `localStorage.lumina_auth_token` (see any prior phase's plan/Roadmap entry for the exact `fetch` calls — the backend is `https://lumina-chronica-api.svhofkirchen-api.workers.dev`, login/register field is `identifier` not `username`/`email`).
3. Navigate to `/statistics`. The hero renders regardless of whether the account has any reading stats (the hero markup is unconditional, above the `@if (_stats is null)` branch in `Statistics.razor`).
4. Take a screenshot of the hero.
5. Confirm: the moonlight beam shows the background architecture (bookshelf, star-chart window) faintly visible through it, rather than appearing as a flat, opaque white/blue cone. This is the same check already performed once before this plan was written (during the design-spec brainstorming session) — repeat it here against the actual committed CSS to confirm the real file matches what was prototyped live.
6. Zoom into the hero's left edge (where the armillary sphere, `.stats-hero-layer-3`, sits in front). Confirm no colored artifact from the raw `statistics-hero-layer2-moonlight.webp` source (a known red/green/orange generation artifact stripe near that image's left edge) is visible in the composite — Layer 3 should still fully cover it, exactly as before this change. If the artifact has become visible, stop and report this as a new finding rather than proceeding — it would mean the blend mode interacts with that region in an unexpected way.
7. Repeat steps 3-6 in at least one other theme (Settings → theme switcher) to confirm the effect isn't theme-dependent in a way that looks wrong (the hero's own layers aren't themed, but the surrounding page chrome is, so a quick cross-theme check costs little and matches this project's standing verification habit).
8. Stop the dev server.

If any check in this step fails, do not proceed to Step 5 — treat it as a finding: describe exactly what was observed vs. expected, and stop for guidance rather than guessing at a different CSS value.

- [ ] **Step 5: Add the Roadmap entry**

Open `documentation/Roadmap.md`. Find the "Parallax Timeline Fix (Dashboard + Statistics heroes, complete)" section (the most recent Statistics-related entry). Immediately after its closing paragraph, add:

```markdown
## Statistics Polish — Phase A (Hero Light Transparency, complete)

First of three follow-up polish items from direct user feedback on the shipped Statistics hero — full spec at `docs/superpowers/specs/2026-09-08-statistics-polish-design.md`, plan at `docs/superpowers/plans/2026-09-08-statistics-polish-phase-a.md`.

- [x] **`mix-blend-mode: screen` on `.stats-hero-layer-2`**: the moonlight/dust layer previously composited as a solid, milky shape rather than translucent light. `screen` blend treats black pixels as contributing nothing and lightens (rather than darkens) whatever sits beneath bright pixels -- the correct model for a light shaft over a dark scene, and it needed no new image asset. Statistics hero only; the Dashboard hero's own light layer (`dashboard-hero-layer2-lights.webp`) was delivered with genuine per-pixel alpha transparency baked into the asset, so it never needed this compositing fix -- not because it lacks a light layer.

**Live verification**: confirmed via before/after screenshots at the same scroll position that the background architecture and star-chart windows now show faintly through the beam, instead of a flat opaque cone. Also confirmed the raw source image's known left-edge generation artifact (a red/green/orange stripe, more prominent than the original asset note's "small, low-opacity residual tint" suggested) remains fully covered by Layer 3's armillary-sphere silhouette in the composite, unaffected by the blend-mode change. Checked in [theme names used], no cross-theme regression.

Frontend: 322/322 bUnit tests passing (unchanged -- no test coverage is possible for a compositing/rendering-only change).
```

Fill in the actual theme name(s) checked in Step 4.7 where the template says `[theme names used]`.

- [ ] **Step 6: Commit the Roadmap update**

```bash
git add documentation/Roadmap.md
git commit -m "docs: close out Statistics Polish Phase A in the Roadmap"
```
