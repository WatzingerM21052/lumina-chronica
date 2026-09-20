# Offline Library Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `OfflineLibrary.razor`'s bare `<ul>` list with the "Travelling Library" rework — a small static hero banner, cover-less book cards with a self-drawn placeholder icon, and a themed empty state — with zero functional change to save/read/remove/error behavior.

**Architecture:** All markup changes live in `OfflineLibrary.razor` plus a new page-scoped `OfflineLibrary.razor.css` (Blazor CSS isolation, matching `Home.razor.css`/`Statistics.razor.css`'s existing convention). Two now-unused rules (`.offline-book-list`, `.offline-book-item`) are removed from the shared `app.css`. No `@code` block logic changes — `OnInitializedAsync`, `LoadAsync`, `RemoveAsync`, `FormatSize` stay exactly as they are today.

**Tech Stack:** Blazor WebAssembly, bUnit for component tests, page-scoped CSS.

## Global Constraints

- No new color palette — only existing tokens (`--color-bg-paper`, `--color-bg-card`, `--color-primary`, `--color-gold-accent`, `--color-border`, `--color-text-secondary`, `--color-text-disabled`, `--color-text-on-dark`, theme tokens) — must work in all 4 themes.
- No new motion durations — reuse `--motion-standard`/`--motion-micro` etc. from `tokens.css` if any transition is added; none is required by this plan.
- No functional regression: saving/reading/removing offline books and the storage-error path must behave identically to today.
- No cover caching, no `navigator.storage.estimate()` quota bar, no confirmation dialogs — explicitly out of scope per the design spec (`docs/superpowers/specs/2026-09-19-offline-library-rework-design.md`).
- Icons are hand-drawn inline SVG in the app's existing stroke style (`viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"`) — no external image/icon downloads, no new AI-generated images (the hero image already exists).

---

### Task 1: Optimize and wire up the hero banner

**Files:**
- Create: `frontend/LuminaChronica.Client/wwwroot/images/offline-hero.webp` (already generated — see below, just needs to be committed)
- Modify: `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor` (replace the `<h1>`/description block with the hero)
- Create: `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css`

**Interfaces:**
- Produces: `.offline-hero`, `.offline-hero-scrim`, `.offline-hero-content` CSS classes (page-scoped) — Task 2/3 don't depend on these, but keep the naming consistent for anyone extending this page later.

- [ ] **Step 1: Confirm the optimized hero asset exists**

The source design asset `frontend/LuminaChronica.Client/wwwroot/images/Designimages/02_travelling_library_offline_hero.png` is 1916×821px and 2.39 MB — far too large for a ~150px-tall banner (this project's heroes all ship as pre-sized `.webp`, e.g. `dashboard-hero-layer1-background.webp` at 2400×1029/294 KB). An optimized version has already been generated at `frontend/LuminaChronica.Client/wwwroot/images/offline-hero.webp` (1600×686px, WebP quality 82, ~145 KB — a 94% size reduction, visually lossless at banner scale). Verify it exists:

```bash
ls -la frontend/LuminaChronica.Client/wwwroot/images/offline-hero.webp
```

If it's missing (e.g. this plan is being run in a fresh worktree that didn't inherit the file), regenerate it:

```bash
python3 -c "
from PIL import Image
img = Image.open('frontend/LuminaChronica.Client/wwwroot/images/Designimages/02_travelling_library_offline_hero.png')
target_w = 1600
target_h = round(img.height * target_w / img.width)
resized = img.resize((target_w, target_h), Image.LANCZOS)
resized.save('frontend/LuminaChronica.Client/wwwroot/images/offline-hero.webp', 'WEBP', quality=82, method=6)
"
```

- [ ] **Step 2: Replace the page header markup**

In `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor`, replace lines 12-16 (the old `<h1>`/description block):

```razor
<h1>Offline Bücher</h1>
<p class="text-muted">
    Bücher, die du auf diesem Gerät für das Lesen ohne Internetverbindung gespeichert hast. Speichere ein
    Buch über "Offline speichern" auf seiner Detailseite.
</p>
```

with:

```razor
<div class="offline-hero">
    <img src="images/offline-hero.webp" alt="" class="offline-hero-image" loading="eager" decoding="async" />
    <div class="offline-hero-scrim"></div>
    <div class="offline-hero-content">
        <h1>Offline Bücher</h1>
    </div>
</div>

<p class="text-muted offline-intro">
    Bücher, die du auf diesem Gerät für das Lesen ohne Internetverbindung gespeichert hast. Speichere ein
    Buch über "Offline speichern" auf seiner Detailseite.
</p>
```

(`alt=""` because the image is purely decorative — the page's actual heading "Offline Bücher" is the real `<h1>` text content, matching `Home.razor`'s identical pattern for its own hero image.)

- [ ] **Step 3: Create `OfflineLibrary.razor.css`**

```css
.offline-hero {
    position: relative;
    height: 150px;
    border-radius: var(--radius-lg);
    overflow: clip;
    margin-bottom: var(--space-2);
    box-shadow: var(--shadow-card);
    background-color: var(--color-bg-dark);
}

.offline-hero-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.offline-hero-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(20, 12, 6, 0.25) 0%, rgba(20, 12, 6, 0.15) 45%, rgba(15, 9, 5, 0.7) 100%);
}

.offline-hero-content {
    position: relative;
    height: 100%;
    display: flex;
    align-items: flex-end;
    padding: var(--space-2) var(--space-3);
}

.offline-hero-content h1 {
    font-family: var(--font-family-display);
    font-size: var(--font-size-h2);
    color: var(--color-text-on-dark);
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
    margin: 0;
}

.offline-intro {
    margin-top: 0;
}
```

(`height: 150px` fixed, not `vh`-based — this banner is deliberately small and static, unlike `.home-hero`'s `38vh`; no `transition`/parallax classes since Task 1's design explicitly rules out scroll compaction for this page. `font-size: var(--font-size-h2)` rather than the browser default h1 size keeps the title visually proportionate to a 150px-tall banner — `Home.razor.css`'s `.home-hero-content h1` doesn't override size because its hero is much taller.)

- [ ] **Step 4: Build and visually sanity-check**

Run: `dotnet build frontend/LuminaChronica.Client/LuminaChronica.Client.csproj`
Expected: 0 errors. (No automated visual test for this step — Task 2's bUnit tests will catch structural regressions; the hero's actual appearance needs a live-browser check, called out at the end of this plan.)

- [ ] **Step 5: Run the existing offline tests to confirm nothing broke**

Run: `dotnet test tests/frontend --filter "OfflineLibrary"`
Expected: PASS — all 3 existing tests (`OfflineLibrary_ShowsEmptyState_WhenNothingSaved`, `OfflineLibrary_ListsSavedBooksWithTotalSize`, `OfflineLibrary_RemoveButton_CallsDeleteBook`) still pass unmodified, since this task only touched the always-visible header, not the list/loading/empty conditional blocks.

- [ ] **Step 6: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/images/offline-hero.webp frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css
git commit -m "feat: add small static hero banner to the Offline Library page"
```

---

### Task 2: Replace the book list with cover-less cards

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor` (replace the `<ul class="offline-book-list">` block)
- Modify: `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css` (add card-grid styles)
- Modify: `frontend/LuminaChronica.Client/wwwroot/Styles/app.css` (remove the now-unused `.offline-book-list`/`.offline-book-item` rules)
- Modify: `tests/frontend/OfflineLibraryPageTests.cs` (no assertion text changes needed here — only the empty-state test in Task 3 needs updating)

**Interfaces:**
- Consumes: `List<OfflineBookSummary> _books`, `FormatSize(long)` — both already exist in the `@code` block, unchanged.
- Produces: `.offline-book-grid`, `.offline-book-card`, `.offline-book-icon`, `.offline-book-info` CSS classes.

- [ ] **Step 1: Write a test asserting the new card structure exists**

Add to `tests/frontend/OfflineLibraryPageTests.cs` (after `OfflineLibrary_ListsSavedBooksWithTotalSize`):

```csharp
[Fact]
public void OfflineLibrary_RendersBooksAsCards_WithPlaceholderIcon_NotAPlainList()
{
    JSInterop.SetupModule("./js/offlineStorage.js")
        .Setup<List<OfflineBookSummary>>("listBooks", _ => true)
        .SetResult(
        [
            new OfflineBookSummary { Id = 1, Title = "Dune", Author = "Frank Herbert", Format = "EPUB", SizeBytes = 1024 * 1024, SavedAt = "2026-08-01T00:00:00Z" },
        ]);

    var cut = Render<OfflineLibrary>();

    Assert.Single(cut.FindAll(".offline-book-card"));
    Assert.Single(cut.FindAll(".offline-book-icon svg"));
    Assert.Empty(cut.FindAll(".offline-book-list")); // old markup is gone
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test tests/frontend --filter "OfflineLibrary_RendersBooksAsCards"`
Expected: FAIL — `.offline-book-card` doesn't exist yet, the old `.offline-book-list` markup is still present.

- [ ] **Step 3: Replace the list markup**

In `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor`, replace the `else` block's `<ul class="offline-book-list">...</ul>` (the whole list, keep the `<p class="text-muted">Insgesamt...` line above it as-is):

```razor
<ul class="offline-book-list">
    @foreach (var book in _books)
    {
        <li class="offline-book-item">
            <div>
                <strong>@book.Title</strong>
                @if (!string.IsNullOrWhiteSpace(book.Author))
                {
                    <span class="text-muted"> — @book.Author</span>
                }
                <div class="text-muted">@book.Format · @FormatSize(book.SizeBytes)</div>
            </div>
            <div class="form-actions">
                <a class="btn btn-primary" href="@($"library/books/{book.Id}/read")">Lesen</a>
                <button type="button" class="btn" @onclick="() => RemoveAsync(book.Id)">Entfernen</button>
            </div>
        </li>
    }
</ul>
```

with:

```razor
<div class="offline-book-grid">
    @foreach (var book in _books)
    {
        <div class="offline-book-card">
            <div class="offline-book-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                    <path d="M4 5.5c2.2-1 5-1 8 0v13c-3-1-5.8-1-8 0z" />
                    <path d="M20 5.5c-2.2-1-5-1-8 0v13c3-1 5.8-1 8 0z" />
                </svg>
            </div>
            <div class="offline-book-info">
                <strong>@book.Title</strong>
                @if (!string.IsNullOrWhiteSpace(book.Author))
                {
                    <div class="text-muted">@book.Author</div>
                }
                <div class="text-muted">@book.Format · @FormatSize(book.SizeBytes)</div>
            </div>
            <div class="form-actions">
                <a class="btn btn-primary" href="@($"library/books/{book.Id}/read")">Lesen</a>
                <button type="button" class="btn" @onclick="() => RemoveAsync(book.Id)">Entfernen</button>
            </div>
        </div>
    }
</div>
```

(The placeholder SVG is character-for-character `BookCard.razor`'s `.book-card-cover-placeholder` icon — two overlapping book-page paths — reused deliberately so this page doesn't introduce a second, competing "book" glyph into the app's visual vocabulary. `form-actions` is this codebase's existing shared utility class for a button row — unchanged from the original markup.)

- [ ] **Step 4: Add the card-grid CSS**

Append to `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css`:

```css
.offline-book-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-2);
    margin: var(--space-2) 0;
}

.offline-book-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
}

.offline-book-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: var(--color-text-disabled);
}

.offline-book-icon svg {
    width: 100%;
    height: 100%;
}

.offline-book-info strong {
    font-family: var(--font-family-display);
}

.offline-book-card .form-actions {
    margin-top: auto;
    padding-top: var(--space-1);
}
```

(`margin-top: auto` on the button row keeps "Lesen"/"Entfernen" pinned to the bottom of each card even when a neighboring card's title/author wraps to more lines — standard flex-column footer-pinning, no new pattern.)

- [ ] **Step 5: Remove the now-dead rules from `app.css`**

In `frontend/LuminaChronica.Client/wwwroot/Styles/app.css`, delete the `.offline-book-list` and `.offline-book-item` rules (currently around line 2160-2177 — confirm exact location, it may have shifted):

```css
.offline-book-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    padding: 0;
    margin: var(--space-2) 0;
}

.offline-book-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-lg, var(--radius));
    background-color: var(--color-bg-card);
}
```

Delete both blocks entirely (including the blank line between them, keep one blank line separating the surrounding rules).

- [ ] **Step 6: Run the test, verify it passes**

Run: `dotnet test tests/frontend --filter "OfflineLibrary_RendersBooksAsCards"`
Expected: PASS

- [ ] **Step 7: Run the full offline test group + a repo-wide grep for stale references**

Run: `dotnet test tests/frontend --filter "OfflineLibrary"`
Expected: PASS, all 4 tests (3 original + 1 new).

Run: `grep -rn "offline-book-list\|offline-book-item" frontend/LuminaChronica.Client tests/frontend`
Expected: no matches (confirms the old classes are fully gone, not just unused in CSS).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css frontend/LuminaChronica.Client/wwwroot/Styles/app.css tests/frontend/OfflineLibraryPageTests.cs
git commit -m "feat: render offline books as cover-less cards instead of a plain list"
```

---

### Task 3: Themed empty state (suitcase + ❦)

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor` (replace the `<EmptyState>` usage with page-specific markup)
- Modify: `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css` (add empty-state styles)
- Modify: `tests/frontend/OfflineLibraryPageTests.cs` (update the empty-state message assertion to match the new copy)

**Interfaces:**
- Consumes: nothing new.
- Produces: `.offline-empty-state`, `.offline-empty-icon` CSS classes.

- [ ] **Step 1: Update the existing empty-state test for the new copy**

In `tests/frontend/OfflineLibraryPageTests.cs`, replace the `OfflineLibrary_ShowsEmptyState_WhenNothingSaved` test body:

```csharp
[Fact]
public void OfflineLibrary_ShowsEmptyState_WhenNothingSaved()
{
    JSInterop.SetupModule("./js/offlineStorage.js")
        .Setup<List<OfflineBookSummary>>("listBooks", _ => true)
        .SetResult([]);

    var cut = Render<OfflineLibrary>();

    Assert.Contains("Noch keine Bücher offline gespeichert.", cut.Markup);
}
```

with:

```csharp
[Fact]
public void OfflineLibrary_ShowsEmptyState_WhenNothingSaved()
{
    JSInterop.SetupModule("./js/offlineStorage.js")
        .Setup<List<OfflineBookSummary>>("listBooks", _ => true)
        .SetResult([]);

    var cut = Render<OfflineLibrary>();

    Assert.Contains("Noch keine Bücher für unterwegs gepackt.", cut.Markup);
    Assert.Single(cut.FindAll(".offline-empty-icon svg"));
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test tests/frontend --filter "OfflineLibrary_ShowsEmptyState"`
Expected: FAIL — old copy still present, no `.offline-empty-icon`.

- [ ] **Step 3: Replace the empty-state markup**

In `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor`, replace:

```razor
<EmptyState Message="Noch keine Bücher offline gespeichert." />
```

with:

```razor
<div class="offline-empty-state">
    <svg class="offline-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <path d="M9 8V6a3 3 0 0 1 3-3 3 3 0 0 1 3 3v2" />
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M8 11.5v5M12 11.5v5M16 11.5v5" stroke-width="1.1" />
        <rect x="10.3" y="7.6" width="3.4" height="1.6" rx="0.4" />
    </svg>
    <span class="offline-empty-ornament" aria-hidden="true">❦</span>
    <p>Noch keine Bücher für unterwegs gepackt.</p>
</div>
```

(The `EmptyState`/`Components` using-directive at the top of the file may become unused after this — check whether any other component in this file still uses the `LuminaChronica.Client.Components` namespace, e.g. `LoadingIndicator`; if so, leave the `@using` in place, it is still needed.)

- [ ] **Step 4: Add the empty-state CSS**

Append to `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css`:

```css
.offline-empty-state {
    text-align: center;
    padding: var(--space-5) var(--space-3);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg-card);
}

.offline-empty-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: var(--color-text-disabled);
    margin-bottom: var(--space-1);
}

.offline-empty-ornament {
    display: block;
    color: var(--color-gold-accent);
    font-size: 1.3rem;
    margin-bottom: var(--space-1);
}

.offline-empty-state p {
    font-family: var(--font-family-reader);
    font-style: italic;
    color: var(--color-text-secondary);
    max-width: 26rem;
    margin: 0 auto;
}
```

(This intentionally mirrors `app.css`'s shared `.empty-state-literary`/`.empty-state-ornament` rules — same dashed-border-card treatment, same gold ornament color, same italic reader-font message — but as page-scoped classes, since this page's version adds the SVG icon `EmptyState`'s shared component doesn't support and a second shared-component parameter isn't justified for a single page's need.)

- [ ] **Step 5: Run the test, verify it passes**

Run: `dotnet test tests/frontend --filter "OfflineLibrary_ShowsEmptyState"`
Expected: PASS

- [ ] **Step 6: Run the full frontend suite**

Run: `dotnet test tests/frontend`
Expected: PASS, full suite (387 existing + 1 new from Task 2 = 388 — Task 3 modified an existing test's assertions rather than adding a new one).

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css tests/frontend/OfflineLibraryPageTests.cs
git commit -m "feat: themed empty state for the Offline Library page (suitcase + literary ornament)"
```

---

## Live verification (required before considering this done, per this project's own standing convention)

bUnit renders markup but doesn't reproduce real layout, image loading, or cross-theme visual correctness. Before merging, verify live in a real browser (local dev now genuinely works end-to-end — see `[[project-lumina-chronica-local-dev]]`, run `cd backend && npm run dev` first, then `dotnet run` the frontend):

1. Visit `/offline` with at least one book saved (use the existing "Offline speichern" button on a book detail page, or seed via the local backend as done earlier this session) — confirm the hero banner renders at the intended small size, the scrim keeps "Offline Bücher" legible over the image, and the book cards show the placeholder icon (not a broken image).
2. Visit `/offline` with zero books saved — confirm the empty state shows the suitcase icon + ❦ + new message, styled consistently with the dashed-card literary treatment used elsewhere.
3. Check all 4 themes (Classic/Dark Library, Modern Light, System) — confirm the hero scrim, card borders, and empty-state card all read correctly in each (no invisible text, no clashing colors).
4. Confirm "Lesen" still navigates to the reader and "Entfernen" still removes a book (functional regression check per the design spec's guardrail).
