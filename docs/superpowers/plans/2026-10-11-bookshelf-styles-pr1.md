# Bücherregal-Stile — PR 1: Fächer, Stil-Einstellung, Stil A „Klassisch“

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Regal-Ansicht zeigt standardmäßig den neuen Stil A („Klassisch“, Fächer „Zuletzt gelesen“ + Genres); das heutige Regal bleibt in den Einstellungen als „Legacy“ wählbar.

**Architecture:** Reine C#-Logik (`LibraryShelfGrouping.GroupForShelf`, `ShelfLineLayout`) erzeugt Fächer und Zeilen; die Komponente `ClassicShelf` rendert sie, ein kleines JS-Modul meldet nur die verfügbare Breite. Library.razor wählt anhand der in `localStorage` gespeicherten Einstellung zwischen `ClassicShelf` und dem unveränderten Legacy-Pfad (`ShelfRow`/`shelf-physics.js`).

**Tech Stack:** Blazor WASM (.NET 10), bUnit/xUnit, CSS-3D, ES-Module.

Spec: `docs/superpowers/specs/2026-10-11-bookshelf-rework-design.md` (§2, §3, §4, §6 A, §7). Diese PR fasst die Spec-Phasen 1 und 2 zusammen, damit die Einstellung nicht ohne zweiten Stil erscheint.

## Global Constraints

- Legacy-Regal (`ShelfRow`, `ShelfBook`, `.shelf-*`-CSS in app.css, `shelf-physics.js`) wird nicht verändert; alle bestehenden Tests bleiben unverändert grün.
- Neue CSS-Klassen nur mit Präfix `classic-shelf-`; eigene Datei `wwwroot/Styles/shelf-classic.css`.
- Keine `transform`-Hover-Effekte auf Buttons/Links außerhalb des Regals (Bücher dürfen sich bewegen — das ist das Regal selbst, so in der Vorschau abgenommen).
- `prefers-reduced-motion: reduce` → keine Transitions/Flacker-Animation.
- Alle UI-Texte über i18n (de.json, en.json, FakeI18nService synchron halten).
- Nur bestehende Assets aus `wwwroot/images/library/` und `wwwroot/images/themes/books/`.
- Kein Backend; „Zuletzt gelesen“ kommt aus `GET /api/dashboard` (`continueReading`, max. 5).
- Staging nur mit expliziten Pfaden; `git show --stat` vor Push.

---

### Task 1: Fächer-Logik `GroupForShelf`

**Files:**
- Create: `frontend/LuminaChronica.Client/Models/ShelfSection.cs`
- Modify: `frontend/LuminaChronica.Client/Models/LibraryShelfGrouping.cs`
- Test: `tests/frontend/LibraryShelfGroupingTests.cs`

**Interfaces:**
- Produces:
  ```csharp
  public enum ShelfSectionKind { Recent, Genre, NoGenre }
  public record ShelfSection(string Label, ShelfSectionKind Kind, List<Book> Books, IReadOnlyDictionary<int, double>? Progress = null);
  public static List<ShelfSection> LibraryShelfGrouping.GroupForShelf(
      IReadOnlyList<Book> books, IReadOnlyList<ContinueReadingItem> recent, string recentLabel, string noGenreLabel);
  ```
- Regeln: `books` kommt schon sortiert vom Server, die Reihenfolge innerhalb eines Fachs bleibt die Eingabereihenfolge. „Zuletzt gelesen“ = `recent`-Bücher, die auch in `books` vorkommen (Filter wirken mit), in `recent`-Reihenfolge, mit `Progress[id] = Percentage`; leer → kein Fach. Genres alphabetisch (OrdinalIgnoreCase), „Ohne Genre“ zuletzt. Bücher aus „Zuletzt gelesen“ stehen zusätzlich in ihrem Genre.

- [ ] **Step 1: Tests schreiben** (in `LibraryShelfGroupingTests.cs` anhängen)

```csharp
    private static ContinueReadingItem Recent(Book book, double pct) => new() { Book = book, Percentage = pct };

    [Fact]
    public void GroupForShelf_PutsRecentFirst_ThenGenresAlphabetically_NoGenreLast()
    {
        var a = MakeBook(1, "A", genre: "Sci-Fi");
        var b = MakeBook(2, "B", genre: "fantasy");
        var c = MakeBook(3, "C");
        var result = LibraryShelfGrouping.GroupForShelf([a, b, c], [Recent(c, 40)], "Zuletzt gelesen", "Ohne Genre");

        Assert.Equal(["Zuletzt gelesen", "fantasy", "Sci-Fi", "Ohne Genre"], result.Select(s => s.Label));
        Assert.Equal([ShelfSectionKind.Recent, ShelfSectionKind.Genre, ShelfSectionKind.Genre, ShelfSectionKind.NoGenre], result.Select(s => s.Kind));
        Assert.Equal(40, result[0].Progress![3]);
        Assert.Same(c, result[3].Books.Single());
    }

    [Fact]
    public void GroupForShelf_KeepsServerOrderInsideAShelf()
    {
        var books = new List<Book> { MakeBook(5, "Zeta", genre: "F"), MakeBook(2, "Alpha", genre: "F"), MakeBook(9, "Mu", genre: "F") };
        var result = LibraryShelfGrouping.GroupForShelf(books, [], "Zuletzt gelesen", "Ohne Genre");

        Assert.Equal([5, 2, 9], result.Single().Books.Select(b => b.Id));
    }

    [Fact]
    public void GroupForShelf_DropsRecentBooksThatTheFilterHides()
    {
        var shown = MakeBook(1, "Shown", genre: "F");
        var hidden = MakeBook(2, "Hidden", genre: "F");
        var result = LibraryShelfGrouping.GroupForShelf([shown], [Recent(hidden, 10)], "Zuletzt gelesen", "Ohne Genre");

        Assert.DoesNotContain(result, s => s.Kind == ShelfSectionKind.Recent);
    }

    [Fact]
    public void GroupForShelf_MatchesRecentById_NotByReference()
    {
        var listed = MakeBook(7, "Same", genre: "F");
        var fromDashboard = MakeBook(7, "Same", genre: "F");
        var result = LibraryShelfGrouping.GroupForShelf([listed], [Recent(fromDashboard, 55)], "Zuletzt gelesen", "Ohne Genre");

        Assert.Same(listed, result[0].Books.Single());
    }

    [Fact]
    public void GroupForShelf_EmptyLibrary_ReturnsNoShelves()
    {
        Assert.Empty(LibraryShelfGrouping.GroupForShelf([], [], "Zuletzt gelesen", "Ohne Genre"));
    }
```

- [ ] **Step 2: Tests laufen lassen → FAIL** (`GroupForShelf` fehlt)

Run: `dotnet test tests/frontend --filter LibraryShelfGroupingTests`

- [ ] **Step 3: Implementieren**

`Models/ShelfSection.cs`:
```csharp
namespace LuminaChronica.Client.Models;

public enum ShelfSectionKind { Recent, Genre, NoGenre }

// One shelf compartment of the new shelf styles: "Zuletzt gelesen", one per
// genre, "Ohne Genre". Progress (book id -> percent) is only set on Recent.
public record ShelfSection(string Label, ShelfSectionKind Kind, List<Book> Books, IReadOnlyDictionary<int, double>? Progress = null);
```

In `LibraryShelfGrouping`:
```csharp
    // The shelf styles' compartments (spec 2026-10-11 §2): recently read
    // first, then one per genre, books without one last. Books arrive in
    // the toolbar's sort order and keep it inside every compartment.
    public static List<ShelfSection> GroupForShelf(
        IReadOnlyList<Book> books,
        IReadOnlyList<ContinueReadingItem> recent,
        string recentLabel,
        string noGenreLabel)
    {
        var sections = new List<ShelfSection>();
        if (books.Count == 0) return sections;

        var byId = books.ToDictionary(b => b.Id);
        var recentShown = recent.Where(r => byId.ContainsKey(r.Book.Id)).DistinctBy(r => r.Book.Id).ToList();
        if (recentShown.Count > 0)
        {
            sections.Add(new ShelfSection(
                recentLabel,
                ShelfSectionKind.Recent,
                recentShown.Select(r => byId[r.Book.Id]).ToList(),
                recentShown.ToDictionary(r => r.Book.Id, r => r.Percentage)));
        }

        sections.AddRange(books
            .Where(b => !string.IsNullOrWhiteSpace(b.Genre))
            .GroupBy(b => b.Genre!.Trim(), StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ShelfSection(g.First().Genre!.Trim(), ShelfSectionKind.Genre, g.ToList())));

        var noGenre = books.Where(b => string.IsNullOrWhiteSpace(b.Genre)).ToList();
        if (noGenre.Count > 0) sections.Add(new ShelfSection(noGenreLabel, ShelfSectionKind.NoGenre, noGenre));

        return sections;
    }
```

- [ ] **Step 4: Tests → PASS**
- [ ] **Step 5: Commit** `feat(library): shelf compartments for the new shelf styles`

---

### Task 2: Zeilenumbruch `ShelfLineLayout`

Bücher brauchen pro Fach mehrere Zeilen (jede mit eigenem Regalbrett). Breiten werden deterministisch in C# festgelegt, damit der Umbruch testbar ist; JS meldet nur die Innenbreite.

**Files:**
- Create: `frontend/LuminaChronica.Client/Models/ShelfLineLayout.cs`
- Test: `tests/frontend/ShelfLineLayoutTests.cs`

**Interfaces:**
- Produces:
  ```csharp
  public readonly record struct ShelfBookSize(int Width, int Height); // px bei Zoom 1
  public static class ShelfLineLayout
  {
      public const int Gap = 3;
      public static ShelfBookSize SizeFor(Book book);   // Breite 26–44, Höhe 176–222, aus Id gehasht
      public static List<List<Book>> Lines(IReadOnlyList<Book> books, double availableWidth, double zoom);
  }
  ```
- Regeln: Zeile füllen, solange `Summe(Width*zoom) + Gap*(n-1) <= availableWidth`; mindestens ein Buch pro Zeile; `availableWidth <= 0` → alles in einer Zeile (Erst-Render vor der JS-Messung).

- [ ] **Step 1: Tests**

```csharp
using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfLineLayoutTests
{
    private static List<Book> Books(int n) => Enumerable.Range(1, n).Select(i => new Book { Id = i, Title = $"B{i}" }).ToList();

    [Fact]
    public void SizeFor_IsStableAndInRange()
    {
        foreach (var book in Books(200))
        {
            var size = ShelfLineLayout.SizeFor(book);
            Assert.InRange(size.Width, 26, 44);
            Assert.InRange(size.Height, 176, 222);
            Assert.Equal(size, ShelfLineLayout.SizeFor(new Book { Id = book.Id }));
        }
    }

    [Fact]
    public void Lines_FillEachLineWithoutExceedingTheWidth()
    {
        var books = Books(60);
        var lines = ShelfLineLayout.Lines(books, 600, 1);

        Assert.Equal(60, lines.Sum(l => l.Count));
        foreach (var line in lines)
        {
            var used = line.Sum(b => ShelfLineLayout.SizeFor(b).Width) + ShelfLineLayout.Gap * (line.Count - 1);
            Assert.True(used <= 600, $"line uses {used}px");
        }
        // Every line but the last could not take the next book.
        for (var i = 0; i < lines.Count - 1; i++)
        {
            var used = lines[i].Sum(b => ShelfLineLayout.SizeFor(b).Width) + ShelfLineLayout.Gap * lines[i].Count;
            Assert.True(used + ShelfLineLayout.SizeFor(lines[i + 1][0]).Width > 600);
        }
    }

    [Fact]
    public void Lines_ZoomMakesLinesShorter()
    {
        Assert.True(ShelfLineLayout.Lines(Books(60), 600, 1.5).Count > ShelfLineLayout.Lines(Books(60), 600, 1).Count);
    }

    [Fact]
    public void Lines_UnknownWidth_KeepsOneLine_AndTinyWidth_StillPlacesEveryBook()
    {
        Assert.Single(ShelfLineLayout.Lines(Books(10), 0, 1));
        Assert.Equal(10, ShelfLineLayout.Lines(Books(10), 5, 1).Count);
    }
}
```

- [ ] **Step 2: → FAIL**
- [ ] **Step 3: Implementieren**

```csharp
namespace LuminaChronica.Client.Models;

public readonly record struct ShelfBookSize(int Width, int Height);

// Book sizes and line breaks for the shelf styles. Sizes are derived from
// the id (stable across renders, no stored dimensions); the shelf's inner
// width comes from shelfLayout.js.
public static class ShelfLineLayout
{
    public const int Gap = 3;

    public static ShelfBookSize SizeFor(Book book)
    {
        var h = (uint)book.Id * 2654435761u;
        return new ShelfBookSize(26 + (int)(h % 19), 176 + (int)((h >> 8) % 47));
    }

    public static List<List<Book>> Lines(IReadOnlyList<Book> books, double availableWidth, double zoom)
    {
        var lines = new List<List<Book>>();
        if (books.Count == 0) return lines;
        if (availableWidth <= 0) return [books.ToList()];

        var line = new List<Book>();
        double used = 0;
        foreach (var book in books)
        {
            var width = SizeFor(book).Width * zoom;
            var needed = line.Count == 0 ? width : used + Gap + width;
            if (line.Count > 0 && needed > availableWidth)
            {
                lines.Add(line);
                line = [];
                needed = width;
            }
            line.Add(book);
            used = needed;
        }
        lines.Add(line);
        return lines;
    }
}
```

- [ ] **Step 4: → PASS**
- [ ] **Step 5: Commit** `feat(library): deterministic book sizes and shelf line breaks`

---

### Task 3: Regal-Stil-Einstellung

**Files:**
- Create: `frontend/LuminaChronica.Client/Models/ShelfStyles.cs`
- Modify: `frontend/LuminaChronica.Client/wwwroot/js/libraryPreferences.js` (get/setShelfStyle)
- Modify: `frontend/LuminaChronica.Client/Pages/Settings.razor` (+ `Settings.razor.css`)
- Modify: `wwwroot/i18n/de.json`, `wwwroot/i18n/en.json`, `tests/frontend/FakeI18nService.cs`
- Test: `tests/frontend/SettingsPageTests.cs`

**Interfaces:**
- Produces:
  ```csharp
  public static class ShelfStyles
  {
      public const string Classic = "classic";
      public const string Legacy = "legacy";
      public const string Default = Classic;
      // Grows with each style PR (leather, room, rotunda).
      public static readonly string[] Available = [Classic, Legacy];
      public static string Normalize(string? stored) => stored is not null && Available.Contains(stored) ? stored : Default;
  }
  ```
  JS: `getShelfStyle(): string|null`, `setShelfStyle(value)`; Key `lumina_shelf_style`.
- i18n-Schlüssel: `settings.shelfStyleLabel` „Regal-Stil“ / "Shelf style"; `settings.shelfStyleDescription` „Wie die Regal-Ansicht der Bibliothek aussieht.“ / "How the library's shelf view looks."; `settings.shelfStyle.classic` „Klassisch“ / "Classic"; `settings.shelfStyle.classicHint` „Holzschrank, Bücher drehen sich zu dir“ / "Wooden cabinet, books turn towards you"; `settings.shelfStyle.legacy` „Legacy“ / "Legacy"; `settings.shelfStyle.legacyHint` „Das bisherige Regal“ / "The previous shelf".

- [ ] **Step 1: Tests** (SettingsPageTests, im Stil der bestehenden `libraryPreferences.js`-Tests Zeile ~239–260)

```csharp
    [Fact]
    public void ShelfStyle_ShowsClassicSelectedByDefault()
    {
        // same service setup as the other appearance tests in this file
        JSInterop.Mode = JSRuntimeMode.Loose;
        var cut = RenderSettings();

        var selected = cut.Find(".shelf-style-option[aria-pressed=true]");
        Assert.Equal("classic", selected.GetAttribute("data-value"));
        Assert.Equal(2, cut.FindAll(".shelf-style-option").Count);
    }

    [Fact]
    public void ShelfStyle_ChoosingLegacy_SavesIt()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        var setHandler = JSInterop.SetupModule("./js/libraryPreferences.js").SetupVoid("setShelfStyle", _ => true);
        var cut = RenderSettings();

        cut.Find(".shelf-style-option[data-value=legacy]").Click();

        Assert.Equal("legacy", setHandler.Invocations.Single().Arguments[0]);
        Assert.Equal("true", cut.Find(".shelf-style-option[data-value=legacy]").GetAttribute("aria-pressed"));
    }
```
(`RenderSettings()` = die Render-Hilfe, die die Datei schon nutzt; falls sie anders heißt, die vorhandene verwenden.)

- [ ] **Step 2: → FAIL**
- [ ] **Step 3: Implementieren**
  - `ShelfStyles.cs` wie oben.
  - `libraryPreferences.js` anhängen:
    ```js
    // Which shelf style the library's Regal view uses (spec 2026-10-11).
    const SHELF_STYLE_KEY = "lumina_shelf_style";
    export function getShelfStyle() { return localStorage.getItem(SHELF_STYLE_KEY); }
    export function setShelfStyle(value) { localStorage.setItem(SHELF_STYLE_KEY, value); }
    ```
  - Settings.razor: unter `settings.libraryTitle`, vor dem Cover-Bilder-Schalter, eine Zeile `preference-row preference-row--stacked shelf-style-row` mit Text links und darunter `<div class="shelf-style-options" role="group">` mit einem `<button class="shelf-style-option" data-value aria-pressed>` je `ShelfStyles.Available`: kleine CSS-Vorschau (`<span class="shelf-style-thumb shelf-style-thumb--{style}">`), Name, Hinweis. Laden in `OnAfterRenderAsync`/Init wie `getHomeScrollShelf` (try/catch, Fallback `ShelfStyles.Default`), Speichern via `setShelfStyle`.
  - Thumbs in `Settings.razor.css`: classic = dunkles Holz mit fünf farbigen Rücken und Messinglinie; legacy = heller Rahmen mit Rücken. Reine CSS-Gradients, keine Bilder.
- [ ] **Step 4: → PASS**, ganze Frontend-Suite grün (`dotnet test tests/frontend`)
- [ ] **Step 5: Commit** `feat(settings): choose the library shelf style`

---

### Task 4: Regal-Tokens je Theme

**Files:**
- Modify: `wwwroot/Styles/tokens.css` (Standardwerte im `:root`)
- Modify: alle 11 Dateien `wwwroot/Styles/themes/*.css`

**Interfaces:**
- Produces (CSS custom properties, von `shelf-classic.css` und späteren Stilen gelesen):
  `--shelf-wood` (Farbe unter der Textur), `--shelf-wood-tint` (rgba-Überlagerung), `--shelf-back` (Rückwand-Abdunklung, rgba), `--shelf-brass-hi`, `--shelf-brass`, `--shelf-brass-lo` (Messing-Verlauf), `--shelf-plaque-ink` (Schrift auf Messing, Kontrast ≥ 4.5 auf `--shelf-brass`), `--shelf-light` (rgba Lichtschein), `--shelf-room` (Hintergrund hinter dem Schrank; Standard `transparent`).

- [ ] **Step 1:** Standard in tokens.css:
  ```css
  --shelf-wood: #3a2315; --shelf-wood-tint: rgba(0,0,0,0); --shelf-back: rgba(0,0,0,.55);
  --shelf-brass-hi: #f1d995; --shelf-brass: #d2ab52; --shelf-brass-lo: #9c7428; --shelf-plaque-ink: #2b1a08;
  --shelf-light: rgba(255,190,110,.22); --shelf-room: transparent;
  ```
- [ ] **Step 2:** Je Theme überschreiben (Werte):
  | Theme | wood | wood-tint | brass hi/mid/lo | light |
  |---|---|---|---|---|
  | classic-library | #3a2315 | rgba(0,0,0,0) | #f1d995/#d2ab52/#9c7428 | rgba(255,190,110,.22) |
  | dark-library | #24150d | rgba(10,6,4,.35) | #d9c48a/#b08f45/#6f5523 | rgba(255,170,90,.18) |
  | skriptorium | #6b4a2b | rgba(255,230,190,.10) | #e9cf95/#b98d48/#7c5a26 | rgba(255,214,150,.26) |
  | alexandria | #5a3a22 | rgba(255,210,150,.08) | #f5dc8f/#d4a94a/#8f6a1c | rgba(255,205,130,.26) |
  | babylon | #2a1a12 | rgba(20,30,70,.18) | #f0d27a/#c9a03e/#86641c | rgba(255,190,110,.2) |
  | ischtar | #1c1210 | rgba(30,40,90,.22) | #f2d583/#c9a03e/#7f5f1a | rgba(140,170,255,.16) |
  | abendhafen | #4a3628 | rgba(60,80,110,.18) | #ebcf92/#b8904c/#7a5a26 | rgba(255,170,110,.22) |
  | daemmergarten | #3b2a1e | rgba(60,40,80,.18) | #e8c28f/#b8835a/#7a4f30 | rgba(255,180,140,.2) |
  | nachtgarten | #2a2019 | rgba(20,40,40,.25) | #e3c08a/#b07f50/#6f4b2a | rgba(170,220,190,.14) |
  | modern-light | #8a6a4c | rgba(255,255,255,.12) | #e6e8ec/#b9bec7/#7d838d | rgba(255,240,215,.3) |
  | system | wie modern-light im hellen, wie dark-library im dunklen Modus (vorhandene `@media (prefers-color-scheme: dark)`-Struktur der Datei nutzen) |
  Für modern-light/system: `--shelf-plaque-ink: #1f2329`. `--shelf-room` bleibt überall `transparent`, außer dark-library/ischtar/nachtgarten: `radial-gradient(ellipse at 50% 0%, var(--shelf-light), transparent 65%)`.
- [ ] **Step 3:** Kontrast prüfen: `--shelf-plaque-ink` auf `--shelf-brass` ≥ 4.5 für jedes Theme (kleines Node-Skript im Scratchpad, Ergebnis notieren).
- [ ] **Step 4: Commit** `feat(themes): shelf tokens per theme`

---

### Task 5: Komponente `ClassicShelf`

**Files:**
- Create: `Components/ClassicShelf/ClassicShelf.razor`, `ClassicShelf.razor.cs`
- Create: `wwwroot/Styles/shelf-classic.css` (in `index.html` nach `app.css` verlinken)
- Create: `wwwroot/js/shelfLayout.js`
- Test: `tests/frontend/ClassicShelfTests.cs`

**Interfaces:**
- Consumes: `ShelfSection`, `ShelfLineLayout`, `ShelfBook`s Cover-Laden über `ApiClient`/`BlobUrlService`/`CoverColorService`/`CoverPreferences` (gleiches Muster wie `ShelfBook.razor.cs`).
- Produces:
  ```razor
  <ClassicShelf Sections="IReadOnlyList<ShelfSection>" Zoom="double" ShowCoverText="bool" />
  ```
  JS `shelfLayout.js`: `observeWidth(element, dotNetRef, methodName)` (ResizeObserver, ruft `[JSInvokable] OnShelfWidth(double)` gedrosselt per rAF, nur bei Änderung ≥ 1px), `disconnect(element)`.
- Markup je Fach: `<section class="classic-shelf-bay" aria-label="{Label}">` → `<span class="classic-shelf-plaque">` (nur erstes Brett) → je Zeile `<div class="classic-shelf-back"><div class="classic-shelf-row">…</div></div><div class="classic-shelf-plank"></div>`.
- Je Buch: `<a class="classic-shelf-slot" href="library/books/{id}" aria-label="Titel, Autor" style="--w;--h;--d:140px;--c;--l">` mit `.classic-shelf-book` → `.classic-shelf-spine` (4 Bünde, Titelschild, Fleuron), `.classic-shelf-cover` (Cover-Bild oder Titel/Autor/Rosette; Fortschrittsbalken bei Recent), `.classic-shelf-top`, `.classic-shelf-shadow`. Farbe `--c`: Cover-Tönung aus `CoverColorService`, sonst Palette aus `Id % 8` (8 Lederfarben aus der Vorschau `BOOKS`), `--l` = abgedunkelte Variante.
- Schrank: `.classic-shelf` (Hintergrund `--shelf-room`) → `.classic-shelf-cabinet` (Gesims `::before`, Goldlinie `::after`, Pfosten `.classic-shelf-post.l/.r`), Kerze `.classic-shelf-candle` (SVG aus Vorschau, `aria-hidden`, nur ≥ 900px Breite).

- [ ] **Step 1: Tests**

```csharp
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ClassicShelfTests : BunitContext
{
    public ClassicShelfTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
    }

    private static Book B(int id, string title, string? author = null) => new() { Id = id, Title = title, Author = author };

    [Fact]
    public void RendersOnePlaquePerSection_AndEveryBookAsALink()
    {
        var sections = new List<ShelfSection>
        {
            new("Zuletzt gelesen", ShelfSectionKind.Recent, [B(1, "Momo", "Michael Ende")], new Dictionary<int, double> { [1] = 80 }),
            new("Fantasy", ShelfSectionKind.Genre, [B(2, "Krabat"), B(3, "Eragon")]),
        };

        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, sections).Add(x => x.Zoom, 1).Add(x => x.ShowCoverText, true));

        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".classic-shelf-plaque").Select(e => e.TextContent));
        var links = cut.FindAll("a.classic-shelf-slot");
        Assert.Equal(3, links.Count);
        Assert.Equal("library/books/1", links[0].GetAttribute("href"));
        Assert.Equal("Momo, Michael Ende", links[0].GetAttribute("aria-label"));
        Assert.Single(cut.FindAll(".classic-shelf-progress"));
    }

    [Fact]
    public void BreaksASectionIntoSeveralPlanks_OnceTheWidthIsKnown()
    {
        var books = Enumerable.Range(1, 40).Select(i => B(i, $"Buch {i}")).ToList();
        var cut = Render<ClassicShelf>(p => p.Add(x => x.Sections, [new ShelfSection("Fantasy", ShelfSectionKind.Genre, books)]).Add(x => x.Zoom, 1));

        Assert.Single(cut.FindAll(".classic-shelf-plank"));
        cut.InvokeAsync(() => cut.Instance.OnShelfWidth(400));
        Assert.True(cut.FindAll(".classic-shelf-plank").Count > 1);
        Assert.Single(cut.FindAll(".classic-shelf-plaque"));
    }
}
```

- [ ] **Step 2: → FAIL**
- [ ] **Step 3: Implementieren**
  - `ClassicShelf.razor.cs`: Parameter wie oben; `_width` (double, Start 0); `[JSInvokable] public void OnShelfWidth(double width)` setzt `_width = width - 2*36` (Innenabstand der Rückwand) und `StateHasChanged()`; `OnAfterRenderAsync(firstRender)` importiert `./js/shelfLayout.js` und ruft `observeWidth(_rootRef, DotNetObjectReference.Create(this), nameof(OnShelfWidth))` in try/catch; `IAsyncDisposable` ruft `disconnect` und gibt Ref/Modul frei (JSDisconnectedException abfangen). Cover: pro Buch (nur wenn `CoverPreferences.ShowImages` und `CoverUrl`) Bytes laden → Blob-URL → `CoverColorService.ExtractDominantColorAsync` für `--c`; Dictionary `bookId → (url, tint)`, nicht pro Render neu laden, URLs in Dispose widerrufen. Laden sequenziell, höchstens 4 gleichzeitig (SemaphoreSlim), damit 100 Bücher den Server nicht fluten.
  - `shelf-classic.css`: CSS aus der Vorschau `regal-vorschau-abcd.html` Zeilen 36–90 (`.plaque`, `.a-*`) übernehmen und umbenennen (`.a-` → `.classic-shelf-`, `.plaque` → `.classic-shelf-plaque`); feste Farben durch die Tokens aus Task 4 ersetzen; Bild-URLs: `url(../images/library/shelf-wood-texture.webp)` (Holz), `url(../images/Bibshelfs/dark-walnut-wood-grain-a.png)` (Rückwand), `url(../images/themes/books/leather_grain.webp)` (Leder), Masken `../images/themes/books/fleuron.svg` und `rosette.svg`. Ergänzungen: Zeilenhöhe = `calc(230px * var(--zoom))`, Bücher skaliert über `--zoom`; `.classic-shelf-slot:focus-visible .classic-shelf-book` = Hover-Zustand plus Messing-Outline; Fortschritt `.classic-shelf-progress` (3px Balken unten auf dem Cover, `--shelf-brass`); `ShowCoverText=false` blendet `.classic-shelf-cover-title/-author` aus, wenn ein Cover-Bild da ist; `@media (max-width: 640px)`: Schrank-Innenabstand 10px, Pfosten 12px, Gesims schmaler, Hover-Drehung nur bei `(hover: hover)` — auf Touch führt Tippen direkt zur Detailseite; `@media (prefers-reduced-motion: reduce)`: `transition: none`, Flamme ohne Animation.
  - `shelfLayout.js`:
    ```js
    // Reports a shelf's inner width to .NET so ClassicShelf can break its
    // books into planks (layout lives in C#: ShelfLineLayout).
    const observers = new WeakMap();
    export function observeWidth(element, dotNetRef, method) {
        let last = -1, frame = 0;
        const report = () => {
            frame = 0;
            const width = element.clientWidth;
            if (Math.abs(width - last) < 1) return;
            last = width;
            dotNetRef.invokeMethodAsync(method, width);
        };
        const observer = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(report); });
        observer.observe(element);
        observers.set(element, observer);
        report();
    }
    export function disconnect(element) {
        observers.get(element)?.disconnect();
        observers.delete(element);
    }
    ```
- [ ] **Step 4: → PASS**
- [ ] **Step 5: Commit** `feat(library): classic shelf style`

---

### Task 6: Library.razor schaltet zwischen Klassisch und Legacy

**Files:**
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor`
- Test: `tests/frontend/LibraryPageTests.cs`

**Interfaces:**
- Consumes: `ShelfStyles`, `GroupForShelf`, `ClassicShelf`, `getShelfStyle`, `GET /api/dashboard` → `DashboardResponse.ContinueReading`.

- [ ] **Step 1: Tests**

```csharp
    [Fact]
    public void ShelfView_UsesTheClassicStyleByDefault()
    {
        UseApiResponse("""{"success":true,"data":{"items":[{"id":1,"title":"Momo","genre":"Fantasy","createdAt":"2026-01-01T00:00:00Z"}],"total":1,"page":1,"pageSize":100}}""");
        JSInterop.Mode = JSRuntimeMode.Loose;
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".classic-shelf")));
        Assert.Empty(cut.FindAll(".shelf-cabinet"));
        Assert.Equal("Fantasy", cut.Find(".classic-shelf-plaque").TextContent);
    }

    [Fact]
    public void ShelfView_LegacyStyle_RendersTheOldShelf()
    {
        UseApiResponse("""{"success":true,"data":{"items":[{"id":1,"title":"Momo","genre":"Fantasy","createdAt":"2026-01-01T00:00:00Z"}],"total":1,"page":1,"pageSize":100}}""");
        JSInterop.Mode = JSRuntimeMode.Loose;
        JSInterop.SetupModule("./js/libraryPreferences.js").Setup<string?>("getShelfStyle").SetResult("legacy");
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".shelf-cabinet")));
        Assert.Empty(cut.FindAll(".classic-shelf"));
    }
```
Die bestehenden Regal-Tests der Datei, die `.shelf-cabinet`/`.shelf-row-group` erwarten, bekommen `getShelfStyle` → `"legacy"` vorgeschaltet (nur Setup ergänzen, Assertions unverändert).

- [ ] **Step 2: → FAIL**
- [ ] **Step 3: Implementieren**
  - Feld `_shelfStyle = ShelfStyles.Default`, geladen in `OnInitializedAsync` per `getShelfStyle` (try/catch → Default, `ShelfStyles.Normalize`).
  - Feld `List<ContinueReadingItem> _recent = []`; nur wenn `_shelfStyle != Legacy`: einmal `ApiClient.GetAsync<DashboardResponse>("/api/dashboard")` (Fehler → leer lassen, kein Fehlertext).
  - Im Grid-Zweig: `@if (_shelfStyle == ShelfStyles.Legacy) { …bestehender Block unverändert… } else { <ClassicShelf Sections="@TakeSectionsUpTo(sections, _visibleBookCount)" Zoom="@ZoomValue" ShowCoverText="@_showCoverText" /> + Sentinel }` mit `sections = LibraryShelfGrouping.GroupForShelf(_allItems, _recent, I18n.T("library.recentShelfLabel"), I18n.T("library.noGenreLabel"))`. `TakeSectionsUpTo` = `TakeUpToBookCount`-Logik für `ShelfSection`. `ZoomValue = double.Parse(_shelfBookZoom, CultureInfo.InvariantCulture)`. `_showCoverText` aus `shelfCoverText.js` `getShowCoverText` (wie Settings).
  - `ShelfIsRendered` und das `shelf-physics`-Init nur für Legacy; der Lade-mehr-Sentinel (`observeLoadMore`) für beide.
  - i18n: `library.recentShelfLabel` „Zuletzt gelesen“ / "Recently read" (de, en, FakeI18nService).
- [ ] **Step 4:** ganze Frontend-Suite grün: `dotnet test tests/frontend`
- [ ] **Step 5: Commit** `feat(library): classic shelf is the default, legacy stays selectable`

---

### Task 7: Visueller Check und PR

- [ ] **Step 1:** Backend (`npm run dev` in `backend/`, Port 8787) und Frontend (Port 5289) laufen; Testkonto mit ≥ 120 Büchern (Seed-Skript im Scratchpad, Bücher über `/api/books/upload` mit Mini-EPUB, Genres verteilt: 6 Genres + 15 ohne Genre; 3 Bücher mit Lesefortschritt via `PUT /api/reading/:id`).
- [ ] **Step 2:** Playwright-Skript (Scratchpad): für jedes der 11 Themes × {1440 px, 390 px} × {Klassisch, Legacy}: `/library` → Regal-Ansicht → Screenshot ganz + Hover auf ein Buch (Desktop) → Screenshot; prüfen: `document.documentElement.scrollWidth <= clientWidth`, keine Konsolenfehler, Schild-Kontrast. Alle Screenshots ansehen.
- [ ] **Step 3:** Brave (claude-in-chrome): Hover, Tastatur-Fokus (Tab durch Bücher), Klick → Detailseite, Zoom 1/1.25/1.5, Cover-Text-Schalter, Stilwechsel in den Einstellungen.
- [ ] **Step 4:** Gefundene Fehler beheben, Tests erneut, dann CHANGELOG-Eintrag (Unreleased).
- [ ] **Step 5:** Push, PR öffnen, CI abwarten, Review, mergen.
