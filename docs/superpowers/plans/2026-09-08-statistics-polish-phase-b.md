# Statistics Polish Phase B (Icon System Rollout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace colored pictographic emoji app-wide with the existing hand-drawn `Icon` component, so the app reads consistently professional instead of mixing emoji and clean line icons.

**Architecture:** Extend `Icon.razor`'s existing `switch` with 14 new cases (same 24×24 viewBox, `stroke-width: 1.4` style as the 7 existing icons). Add one new optional `IconName` parameter to `StatCard` so its `Value` slot can carry an icon (its `Value` parameter is a plain `string`, which cannot hold component markup). Replace each emoji call site with the `Icon` component, reusing 3 already-existing icon names (`book`, `project`, `person`) where semantically apt. Update the handful of bUnit tests that assert on exact emoji text.

**Tech Stack:** Blazor WebAssembly components (Razor), bUnit for tests.

## Global Constraints

- No new component API beyond what's specified here: `Icon`'s `Name`/`Class` parameters are unchanged; `StatCard` gains exactly one new optional parameter, `IconName`.
- Unicode symbols already reading as clean typography — star ratings (★☆), checkmarks (✓✕), and the `❦` fleuron in `EmptyState` — are explicitly OUT of scope. Do not touch them.
- Reuse existing icons where they already cover the emoji's meaning: `book` (📖/📚), `project` (🌎), `person` (🧑). Do not create duplicate icon definitions for these.
- Every new/changed test must actually run and pass — `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` must show 0 failures after each task.
- Icon SVG content in this plan is copied verbatim from a finalized, self-reviewed design — do not redesign the paths; if a path looks visually wrong once rendered, flag it as a finding rather than freehand-editing it, so the fix goes through the normal review loop.

---

### Task 1: Add 14 new icons to `Icon.razor`

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/Icon/Icon.razor` (the `@switch (Name)` block, currently ending with the `"info"` case around line 51, just before the closing `}` of the switch)
- Modify: `tests/frontend/IconTests.cs` (the `[Theory]`/`[InlineData]` list on `Icon_KnownName_RendersAnSvgWithContent`, currently lines 9-15)

**Interfaces:**
- Consumes: nothing from other tasks — this task only touches the icon definition file itself.
- Produces: 14 new `Icon` names that Tasks 2-5 depend on: `home`, `chart`, `box`, `settings`, `flame`, `trophy`, `target`, `calendar`, `discover`, `location-pin`, `document`, `image`, `bookmark`, `toc-list`.

- [ ] **Step 1: Add the 14 new `case` blocks**

Open `frontend/LuminaChronica.Client/Components/Icon/Icon.razor`. Find the `"info"` case (the last one, around lines 47-51):

```razor
        case "info":
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <circle cx="12" cy="7.7" r="0.6" fill="currentColor" />
            break;
    }
```

Insert the 14 new cases immediately after `"info"`'s `break;` and before the closing `}`:

```razor
        case "home":
            <path d="M4 11L12 4L20 11" />
            <path d="M6 9.5V20H18V9.5" />
            <path d="M10 20V14H14V20" />
            break;
        case "chart":
            <path d="M4 20H20" />
            <path d="M7 20V14" />
            <path d="M12 20V9" />
            <path d="M17 20V16" />
            break;
        case "box":
            <path d="M4 8L12 4L20 8L12 12Z" />
            <path d="M4 8V16L12 20L20 16V8" />
            <path d="M12 12V20" />
            break;
        case "settings":
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3V6M12 18V21M3 12H6M18 12H21" />
            <path d="M5.6 5.6L7.8 7.8M16.2 16.2L18.4 18.4M5.6 18.4L7.8 16.2M16.2 7.8L18.4 5.6" />
            break;
        case "flame":
            <path d="M12 3C8 8 6 11 6 14a6 6 0 0 0 12 0c0-2-1-4-2-5c0 2-1 3-2 3c-1-2 0-6-2-9z" />
            break;
        case "trophy":
            <path d="M7 4H17V7A5 5 0 0 1 7 7Z" />
            <path d="M7 5H4A3 3 0 0 0 7 8M17 5H20A3 3 0 0 1 17 8" />
            <path d="M12 9V16" />
            <path d="M8 19H16L15 16H9Z" />
            break;
        case "target":
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            break;
        case "calendar":
            <path d="M4 6H20V21H4Z" />
            <path d="M8 3V7M16 3V7" />
            <path d="M4 10H20" />
            break;
        case "discover":
            <circle cx="12" cy="12" r="9" />
            <path d="M15.5 8.5L13 13L8.5 15.5L11 11Z" />
            break;
        case "location-pin":
            <path d="M12 3C8.5 3 6 5.8 6 9.2C6 13.8 12 20 12 20S18 13.8 18 9.2C18 5.8 15.5 3 12 3Z" />
            <circle cx="12" cy="9.2" r="2" />
            break;
        case "document":
            <path d="M6 3H14L18 7V21H6Z" />
            <path d="M14 3V7H18" />
            <path d="M9 12H15M9 16H15" />
            break;
        case "image":
            <path d="M4 5H20V19H4Z" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="M4 17L9 12L13 16L16 13L20 17" />
            break;
        case "bookmark":
            <path d="M7 3H17V21L12 16.5L7 21Z" />
            break;
        case "toc-list":
            <circle cx="5" cy="7" r="1" fill="currentColor" />
            <path d="M9 7H20" />
            <circle cx="5" cy="12" r="1" fill="currentColor" />
            <path d="M9 12H20" />
            <circle cx="5" cy="17" r="1" fill="currentColor" />
            <path d="M9 17H20" />
            break;
    }
```

(The final `}` above is the existing switch-closing brace — replace the old `case "info": ... break;\n    }` block with the old case followed by all 14 new cases followed by the closing `}`, not a duplicate brace.)

- [ ] **Step 2: Add bUnit coverage for all 14 new names**

Open `tests/frontend/IconTests.cs`. Find the existing `[InlineData]` list (lines 10-15):

```csharp
    [InlineData("bell")]
    [InlineData("person")]
    [InlineData("search")]
    [InlineData("exchange")]
    [InlineData("book")]
    [InlineData("project")]
```

Add 14 more lines immediately after `[InlineData("project")]` and before `public void Icon_KnownName_RendersAnSvgWithContent(string name)`:

```csharp
    [InlineData("home")]
    [InlineData("chart")]
    [InlineData("box")]
    [InlineData("settings")]
    [InlineData("flame")]
    [InlineData("trophy")]
    [InlineData("target")]
    [InlineData("calendar")]
    [InlineData("discover")]
    [InlineData("location-pin")]
    [InlineData("document")]
    [InlineData("image")]
    [InlineData("bookmark")]
    [InlineData("toc-list")]
```

- [ ] **Step 3: Run the tests**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter FullyQualifiedName~IconTests`
Expected: all `Icon_KnownName_RendersAnSvgWithContent` cases pass, including the 14 new ones (21 total instances of that theory). Also run the full suite once: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj` — expect 336/336 passing (322 existing + 14 new theory cases).

- [ ] **Step 4: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/Icon/Icon.razor tests/frontend/IconTests.cs
git commit -m "feat: add 14 icons to the shared Icon component

Extends the existing hand-drawn line-icon set (home, chart, box,
settings, flame, trophy, target, calendar, discover, location-pin,
document, image, bookmark, toc-list) so later tasks can replace
emoji app-wide with this component instead of introducing a second
icon system."
```

---

### Task 2: `StatCard` gains an optional icon, Statistics page adopts it

**Files:**
- Modify: `frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/Statistics.razor`
- Modify: `tests/frontend/StatCardTests.cs`
- Modify: `tests/frontend/StatisticsPageTests.cs`

**Interfaces:**
- Consumes: the `flame`, `trophy`, `target`, `calendar`, `chart` icon names from Task 1.
- Produces: `StatCard`'s new `IconName` parameter (`string?`, optional, default `null`) — no other task consumes this, but it's the pattern any future icon+StatCard pairing (e.g. a Dashboard StatCard) would reuse.

- [ ] **Step 1: Write the failing test for `StatCard`'s new parameter**

Open `tests/frontend/StatCardTests.cs`. Add this test after the existing `StatCard_RendersValueAndLabel_WithDashboardStatClasses` test:

```csharp
    [Fact]
    public void StatCard_WithIconName_RendersIconBeforeValue()
    {
        var cut = Render<StatCard>(parameters => parameters
            .Add(p => p.Value, "4")
            .Add(p => p.Label, "Serie (Tage)")
            .Add(p => p.IconName, "flame"));

        var valueSpan = cut.Find(".dashboard-stat-value");
        Assert.NotNull(valueSpan.QuerySelector("svg.icon"));
        Assert.Equal("4", valueSpan.TextContent.Trim());
    }

    [Fact]
    public void StatCard_WithoutIconName_RendersNoIcon()
    {
        var cut = Render<StatCard>(parameters => parameters
            .Add(p => p.Value, "4")
            .Add(p => p.Label, "Bücher"));

        var valueSpan = cut.Find(".dashboard-stat-value");
        Assert.Null(valueSpan.QuerySelector("svg.icon"));
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter FullyQualifiedName~StatCardTests`
Expected: FAIL — `StatCard` has no `IconName` parameter yet, so this won't compile. That's expected at this step (a compile failure is the TDD-red state for a new parameter, same as a runtime assertion failure would be for existing behavior).

- [ ] **Step 3: Add the `IconName` parameter to `StatCard`**

Replace the full contents of `frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor`:

```razor
@namespace LuminaChronica.Client.Components

<div class="dashboard-stat">
    <span class="dashboard-stat-value">
        @if (!string.IsNullOrEmpty(IconName))
        {
            <Icon Name="@IconName" />
        }
        @Value
    </span>
    <span class="dashboard-stat-label">@Label</span>
</div>

@code {
    [Parameter, EditorRequired]
    public string Value { get; set; } = string.Empty;

    [Parameter, EditorRequired]
    public string Label { get; set; } = string.Empty;

    [Parameter]
    public string? IconName { get; set; }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter FullyQualifiedName~StatCardTests`
Expected: PASS — 3/3 (the pre-existing test plus the 2 new ones). The pre-existing `StatCard_RendersValueAndLabel_WithDashboardStatClasses` test still passes unmodified since it never sets `IconName`, and `@Value` with no icon renders exactly as before.

- [ ] **Step 5: Update `Statistics.razor` to use icons**

In `frontend/LuminaChronica.Client/Pages/Statistics.razor`, replace lines 37-41:

```razor
        <StatCard Value="@_stats.BooksRead.ToString()" Label="Gelesene Bücher" />
        <StatCard Value="@_stats.BooksInProgress.ToString()" Label="In Arbeit" />
        <StatCard Value="@_stats.PagesRead.ToString()" Label="Gelesene Seiten" />
        <StatCard Value="@($"🔥 {_stats.Streaks.CurrentStreak}")" Label="Serie (Tage)" />
        <StatCard Value="@($"🏆 {_stats.Streaks.LongestStreak}")" Label="Längste Serie" />
```

with:

```razor
        <StatCard Value="@_stats.BooksRead.ToString()" Label="Gelesene Bücher" />
        <StatCard Value="@_stats.BooksInProgress.ToString()" Label="In Arbeit" />
        <StatCard Value="@_stats.PagesRead.ToString()" Label="Gelesene Seiten" />
        <StatCard Value="@_stats.Streaks.CurrentStreak.ToString()" Label="Serie (Tage)" IconName="flame" />
        <StatCard Value="@_stats.Streaks.LongestStreak.ToString()" Label="Längste Serie" IconName="trophy" />
```

Then replace the three remaining section-header emoji. Line 46:

```razor
            <h2>🎯 Jahresziel</h2>
```
becomes:
```razor
            <h2><Icon Name="target" /> Jahresziel</h2>
```

Line 82:
```razor
            <h2>📅 Lesekalender</h2>
```
becomes:
```razor
            <h2><Icon Name="calendar" /> Lesekalender</h2>
```

Line 108:
```razor
        <h2>📈 Jahresübersicht</h2>
```
becomes:
```razor
        <h2><Icon Name="chart" /> Jahresübersicht</h2>
```

`Icon` needs no new `@using` — `Statistics.razor` already has `@using LuminaChronica.Client.Components` (line 6), which is where `Icon` lives.

- [ ] **Step 6: Fix the two emoji-text assertions in `StatisticsPageTests.cs`**

Open `tests/frontend/StatisticsPageTests.cs`. Find `Statistics_ShowsStreaks_FromStatisticsEndpoint` (around lines 124-138). Replace its two assertions:

```csharp
        Assert.Contains("🔥 4", cut.Markup);
        Assert.Contains("🏆 9", cut.Markup);
```

with:

```csharp
        var statValues = cut.FindAll(".dashboard-stat-value");
        Assert.Contains(statValues, v => v.TextContent.Trim() == "4" && v.QuerySelector("svg.icon") is not null);
        Assert.Contains(statValues, v => v.TextContent.Trim() == "9" && v.QuerySelector("svg.icon") is not null);
```

This checks the same underlying facts the old assertions checked (the streak numbers 4 and 9 render, now paired with an icon instead of emoji text) without depending on exact whitespace between the icon and the number.

- [ ] **Step 7: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: 336/336 passing (no new tests added in this step beyond Task 1's 14 and this task's 2, so the count from Task 1 doesn't change further — verify the actual number matches what Step 4/Step 7 report, and treat any mismatch as a signal to investigate before moving on, not a target to force-match).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Components/StatCard/StatCard.razor frontend/LuminaChronica.Client/Pages/Statistics.razor tests/frontend/StatCardTests.cs tests/frontend/StatisticsPageTests.cs
git commit -m "feat: replace Statistics page emoji with Icon component

StatCard gains an optional IconName parameter (Value stayed a plain
string, which can't hold component markup) so the streak/longest-streak
cards can show flame/trophy icons instead of emoji. The three section
headers (Jahresziel/Lesekalender/Jahresübersicht) switch from
🎯/📅/📈 to target/calendar/chart icons the same way."
```

---

### Task 3: NavMenu emoji → icons

**Files:**
- Modify: `frontend/LuminaChronica.Client/Layouts/NavMenu.razor`

**Interfaces:**
- Consumes: `home`, `book`, `project`, `discover`, `chart`, `box`, `settings` icon names (6 from Task 1, plus the pre-existing `book`/`project`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace all 7 links**

`_Imports.razor` already has a project-wide `@using LuminaChronica.Client.Components` (confirmed before writing this plan), so `Icon` is available in every `.razor` file including `NavMenu.razor` without adding a per-file `@using` — do not add one, it would be a redundant duplicate. Replace the full contents of `frontend/LuminaChronica.Client/Layouts/NavMenu.razor`:

```razor
<nav class="nav-menu">
    <NavLink href="" Match="NavLinkMatch.All"><Icon Name="home" /> Home</NavLink>
    <NavLink href="library"><Icon Name="book" /> Bibliothek</NavLink>
    <NavLink href="projects"><Icon Name="project" /> Projekte</NavLink>
    <NavLink href="discover"><Icon Name="discover" /> Entdecken</NavLink>
    <NavLink href="statistics"><Icon Name="chart" /> Statistik</NavLink>
    <NavLink href="offline"><Icon Name="box" /> Offline</NavLink>
    <NavLink href="settings"><Icon Name="settings" /> Einstellungen</NavLink>
</nav>
```

- [ ] **Step 2: Run the test suite as a regression check**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: same pass count as after Task 2 — there is no `NavMenuTests.cs` in this project (confirmed absent before writing this plan), so this change has no direct test coverage to update; the run is a pure regression check that nothing else broke.

- [ ] **Step 3: Commit**

```bash
git add frontend/LuminaChronica.Client/Layouts/NavMenu.razor
git commit -m "feat: replace main nav emoji with Icon component

Home/Bibliothek/Projekte/Entdecken/Statistik/Offline/Einstellungen
switch from 🏠📚🌎🌍📊📦⚙ to the hand-drawn Icon set, reusing the
existing book/project icons and adding home/discover/chart/box/
settings from this branch's Task 1."
```

---

### Task 4: Cover-placeholder and map-pin icons

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/BookDetail.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/CharacterDetail.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/LocationDetail.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/ShelfDetail.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/ProjectDetail.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/ProjectDetail.razor.css`

**Interfaces:**
- Consumes: `book`, `person`, `location-pin`, `project`, `image`, `document` icon names (from Task 1 plus pre-existing `book`/`person`/`project`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: `BookDetail.razor`'s cover placeholder**

`Icon` needs no `@using` in this or any file in this task — `_Imports.razor` already imports `LuminaChronica.Client.Components` project-wide (confirmed before writing this plan). Replace line 42:

```razor
                <div class="book-card-cover-placeholder">📖</div>
```

with:

```razor
                <div class="book-card-cover-placeholder" aria-hidden="true"><Icon Name="book" /></div>
```

(The `aria-hidden="true"` addition matches the pattern the shared `BookCard.razor` component already uses for its own identical placeholder — this placeholder is decorative, the real book title is announced elsewhere on the page.)

- [ ] **Step 2: `CharacterDetail.razor`'s cover placeholder**

Replace line 34:

```razor
            <div class="book-card-cover-placeholder">🧑</div>
```

with:

```razor
            <div class="book-card-cover-placeholder" aria-hidden="true"><Icon Name="person" /></div>
```

- [ ] **Step 3: `LocationDetail.razor`'s cover placeholder**

Replace line 34:

```razor
            <div class="book-card-cover-placeholder">📍</div>
```

with:

```razor
            <div class="book-card-cover-placeholder" aria-hidden="true"><Icon Name="location-pin" /></div>
```

- [ ] **Step 4: `ShelfDetail.razor`'s cover placeholder**

Replace line 34:

```razor
            <div class="book-card-cover-placeholder">📚</div>
```

with:

```razor
            <div class="book-card-cover-placeholder" aria-hidden="true"><Icon Name="book" /></div>
```

- [ ] **Step 5: `ProjectDetail.razor`'s three spots**

Replace line 51:

```razor
                <div class="book-card-cover-placeholder">🌎</div>
```

with:

```razor
                <div class="book-card-cover-placeholder" aria-hidden="true"><Icon Name="project" /></div>
```

Replace line 232:

```razor
                        <a class="map-pin" style="@PinStyle(location)" href="@($"projects/{Id}/locations/{location.Id}")" title="@location.Name">📍</a>
```

with:

```razor
                        <a class="map-pin" style="@PinStyle(location)" href="@($"projects/{Id}/locations/{location.Id}")" title="@location.Name"><Icon Name="location-pin" /></a>
```

Replace line 586:

```razor
                                <div class="project-card-cover-placeholder" aria-hidden="true">@(file.Category == "IMAGE" ? "🖼" : "📄")</div>
```

with:

```razor
                                <div class="project-card-cover-placeholder" aria-hidden="true"><Icon Name="@(file.Category == "IMAGE" ? "image" : "document")" /></div>
```

- [ ] **Step 6: Give `.map-pin` an explicit color**

The emoji version of the map pin was self-colored regardless of CSS `color`; the `Icon` component renders `stroke="currentColor"`, so `.map-pin` needs an explicit `color` or the pin could render in whatever text color it inherits (likely too low-contrast against the map image). Open `frontend/LuminaChronica.Client/Pages/ProjectDetail.razor.css`, find the `.map-pin` rule (lines 14-22):

```css
.map-pin {
    position: absolute;
    transform: translate(-50%, -100%);
    font-size: 1.5rem;
    line-height: 1;
    text-decoration: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    cursor: pointer;
}
```

Add a `color` line:

```css
.map-pin {
    position: absolute;
    transform: translate(-50%, -100%);
    font-size: 1.5rem;
    line-height: 1;
    text-decoration: none;
    color: var(--color-primary);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    cursor: pointer;
}
```

(`--color-primary` is the existing brand accent token already used for the same "important interactive marker" role elsewhere, e.g. the Goal Ring — no new color token introduced.)

- [ ] **Step 7: Run the test suite as a regression check**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: same pass count as after Task 3 — confirmed before writing this plan that none of `BookDetailTests.cs`/`CharacterDetailTests.cs`/`LocationDetailTests.cs`/`ShelfDetailTests.cs`/`ProjectDetailTests.cs` assert on these specific emoji characters, so no test file needs a matching update; this run is a regression check.

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/BookDetail.razor frontend/LuminaChronica.Client/Pages/CharacterDetail.razor frontend/LuminaChronica.Client/Pages/LocationDetail.razor frontend/LuminaChronica.Client/Pages/ShelfDetail.razor frontend/LuminaChronica.Client/Pages/ProjectDetail.razor frontend/LuminaChronica.Client/Pages/ProjectDetail.razor.css
git commit -m "feat: replace cover-placeholder and map-pin emoji with Icon component

Book/Character/Location/Shelf/Project detail pages' image-missing
placeholders switch from 📖/🧑/📍/📚/🌎 to Icon, reusing the existing
book/person/project icons and this branch's new location-pin. The
project map's location pins and file-attachment category icons
(image/document) switch the same way. .map-pin gets an explicit
color since Icon uses currentColor, unlike the self-colored emoji it
replaces."
```

---

### Task 5: File-attachment and reader-control icons

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/BookDetail.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/BookUpload.razor`
- Modify: `frontend/LuminaChronica.Client/Pages/Reader.razor`
- Modify: `frontend/LuminaChronica.Client/Components/EpubReader/EpubReader.razor`
- Modify: `tests/frontend/ReaderPageTests.cs`

**Interfaces:**
- Consumes: `document`, `settings`, `bookmark`, `toc-list` icon names from Task 1.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: `BookDetail.razor`'s selected-file-name display**

Replace line 216:

```razor
                                    <text>📄 @_selectedEditCover.Name</text>
```

with:

```razor
                                    <text><Icon Name="document" /> @_selectedEditCover.Name</text>
```

- [ ] **Step 2: `BookUpload.razor`'s two selected-file-name displays**

Replace line 160:

```razor
                    <text>📄 @_selectedFile.Name</text>
```

with:

```razor
                    <text><Icon Name="document" /> @_selectedFile.Name</text>
```

Replace line 183:

```razor
                    <text>📄 @_selectedCover.Name</text>
```

with:

```razor
                    <text><Icon Name="document" /> @_selectedCover.Name</text>
```

- [ ] **Step 3: `Reader.razor`'s settings and bookmarks buttons**

Replace line 42:

```razor
                <button type="button" class="btn" @onclick="ToggleSettingsMenu">⚙ Einstellungen</button>
```

with:

```razor
                <button type="button" class="btn" @onclick="ToggleSettingsMenu"><Icon Name="settings" /> Einstellungen</button>
```

Replace line 127:

```razor
                <button type="button" class="btn" @onclick="ToggleBookmarksMenuAsync">🔖 Lesezeichen</button>
```

with:

```razor
                <button type="button" class="btn" @onclick="ToggleBookmarksMenuAsync"><Icon Name="bookmark" /> Lesezeichen</button>
```

- [ ] **Step 4: `EpubReader.razor`'s table-of-contents button**

Replace line 26:

```razor
            <button type="button" class="btn" @onclick="ToggleTocMenu">📑 Inhaltsverzeichnis</button>
```

with:

```razor
            <button type="button" class="btn" @onclick="ToggleTocMenu"><Icon Name="toc-list" /> Inhaltsverzeichnis</button>
```

`EpubReader.razor` needs no per-file `@using` either — `_Imports.razor`'s project-wide import covers it, same as every other file in this task.

- [ ] **Step 5: Fix the real test-coupling in `ReaderPageTests.cs`**

This is the coupling the design spec already flagged as real, not hypothetical: five call sites use exact `TextContent` equality against the old emoji+text strings, which will no longer match once the button contains an `<svg>` (contributing no text) followed by a space and the label text.

Open `tests/frontend/ReaderPageTests.cs`. There are 5 occurrences to fix:

Line 516:
```csharp
        epubReader.WaitForAssertion(() => Assert.Contains("📑 Inhaltsverzeichnis", epubReader.Markup), TimeSpan.FromSeconds(2));
```
becomes:
```csharp
        epubReader.WaitForAssertion(() => Assert.Contains("Inhaltsverzeichnis", epubReader.Markup), TimeSpan.FromSeconds(2));
```

Line 517:
```csharp
        var tocToggle = cut.FindAll("button").Single(b => b.TextContent == "📑 Inhaltsverzeichnis");
```
becomes:
```csharp
        var tocToggle = cut.FindAll("button").Single(b => b.TextContent.Trim() == "Inhaltsverzeichnis");
```

Line 730:
```csharp
        cut.FindAll("button").Single(b => b.TextContent == "🔖 Lesezeichen").Click();
```
becomes:
```csharp
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lesezeichen").Click();
```

Line 756: same replacement as line 730 (identical old text, same fix).

Line 784: same replacement as line 730 (identical old text, same fix).

Line 811: same replacement as line 730 (identical old text, same fix).

Every one of these becomes `cut.FindAll("button").Single(b => b.TextContent.Trim() == "Lesezeichen").Click();` — `.Trim()` absorbs whatever whitespace Razor renders between the `<Icon />` element and the following text, so the exact literal spacing in the committed markup doesn't matter.

- [ ] **Step 6: Run the affected tests**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj --filter FullyQualifiedName~ReaderPageTests`
Expected: all `ReaderPageTests` pass, including the 5 fixed call sites above. If any still fail, read the actual rendered `cut.Markup` in the failure output — Blazor's exact whitespace-as-text-node behavior around a self-closing component can occasionally surprise; `.Trim()` should absorb it, but confirm rather than assume.

- [ ] **Step 7: Run the full frontend test suite**

Run: `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`
Expected: 0 failures — this is the last task in the plan, so this is the final count for the whole branch. Record the actual passing count in your task report; it becomes part of the Roadmap entry in the final whole-branch step (outside this plan — the controller session handles the Roadmap write-up after all 5 tasks and the final review are done, matching how Phase A's SDD run split live-verification/Roadmap duties from implementer tasks).

- [ ] **Step 8: Commit**

```bash
git add frontend/LuminaChronica.Client/Pages/BookDetail.razor frontend/LuminaChronica.Client/Pages/BookUpload.razor frontend/LuminaChronica.Client/Pages/Reader.razor frontend/LuminaChronica.Client/Components/EpubReader/EpubReader.razor tests/frontend/ReaderPageTests.cs
git commit -m "feat: replace file-attachment and reader-control emoji with Icon component

BookDetail/BookUpload's selected-file-name display, Reader's settings/
bookmarks toggle buttons, and EpubReader's table-of-contents button
switch from 📄/⚙/🔖/📑 to Icon. Updates the 5 ReaderPageTests call
sites that selected these buttons via exact TextContent equality
against the old emoji strings -- a real coupling flagged in the design
spec, not a hypothetical one, since these tests click the buttons to
drive their scenarios and would otherwise fail immediately."
```
