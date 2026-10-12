# 3D-Bibliothek Stufe 1 (Grundlage + Rotunde) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer Regal-Stil „3D-Bibliothek“ — eine begehbare Rotunde in three.js mit geführter Kamera, echten CC0-Modellen/Materialien und Echtzeit-Licht — ersetzt „3D-Raum“ und „Rotunde“.

**Architecture:** Die Raumaufteilung (welches Fach in welchem Regal, Ring/Galerie, Winkel) rechnet C# (`LibraryRoomLayout`, testbar wie `ShelfLineLayout`) und gibt sie mit den Büchern an `js/libraryRoom/index.js`. Die Szene ist in kleine ES-Module geteilt (scene, quality, theme, assets, rotunda, shelf, camera, lighting, pick). Ein Buch öffnet sich über das bestehende `BookSpread`.

**Tech Stack:** Blazor WASM (.NET 10), bUnit/xUnit, three.js r160 (vendored, plus `GLTFLoader`/`RGBELoader` aus r160 `examples/jsm`), CC0-Assets von Poly Haven, Python-Werkzeug in `tools/render-decor`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-12-library-room-design.md` (Entscheidungen §1 sind bindend).
- Alle Texte für Nutzer:innen auf Deutsch in `wwwroot/i18n/de.json`, Englisch in `en.json`, Spiegel in `tests/frontend/FakeI18nService.cs` (Helfer `$TEMP/i18n_add.py <anchorKey> <keys.json>`).
- Keine `transform`-Hover/Active auf Klickzielen (Knöpfe „hüpfen“ nicht).
- Nur CC0/PD-Assets, jede Datei in `wwwroot/assets/library-room/CREDITS.md`; Gesamtbudget **≤ 15 MB**.
- Bücher kippen **oben** heraus, der Fuß bleibt auf dem Brett (Drehpunkt Unterkante vorne).
- Keine Deko-Objekte auf Regalbrettern; Deko steht im Raum.
- Nach jeder JS-Änderung `dotnet build` (Integritäts-Hash der Import-Map), Dev-Server neu starten; nach `git checkout`/`pull` ebenfalls.
- Nur explizite Pfade stagen, `git show --stat` vor jedem Push. PR → `gh pr checks --watch` → `gh pr merge --squash`.
- Alles auf **einem** Branch `feat/library-room`; ein PR am Ende (Task 9), damit live nie ein halber Raum steht. Zwischenstand für den User nach Task 7 lokal (http://localhost:5289).
- Commit-Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| Datei | Verantwortung |
|---|---|
| `frontend/LuminaChronica.Client/Models/LibraryRoomLayout.cs` | reine Logik: Fächer → Regale (Kapazität, Fortsetzung), Ring/Ebenen, Winkel |
| `frontend/LuminaChronica.Client/Models/ShelfStyles.cs` | Stil `library`, Abbildung `room`/`rotunda` → `library` |
| `frontend/LuminaChronica.Client/Components/LibraryRoom/LibraryRoom.razor(.cs)` | Blazor-Hülle: Daten an JS, Fach-Liste, Zurück-Knopf, Ladezustand, Bücherliste, Ersatz |
| `frontend/LuminaChronica.Client/wwwroot/Styles/library-room.css` | Bühne, Liste, Knöpfe, Ladezustand, Tooltip |
| `frontend/LuminaChronica.Client/wwwroot/js/libraryRoom/index.js` | Schnittstelle zu Blazor |
| `…/js/libraryRoom/scene.js` | Renderer, Schleife, Größe, Sichtbarkeit |
| `…/js/libraryRoom/quality.js` | Qualitätsstufe messen/wählen/senken |
| `…/js/libraryRoom/theme.js` | Theme → Materialien, Lichtfarben, HDRI, Deko |
| `…/js/libraryRoom/assets.js` | GLB/Texturen/HDRI laden, Cache, Ersatz |
| `…/js/libraryRoom/rotunda.js` | Architektur: Boden, Wand, Pilaster, Kuppel, Oberlicht, Galerie, Fenster-Nischen |
| `…/js/libraryRoom/shelf.js` | Bücherregal-Korpus, Bretter, Plakette, Bücher, Rücken-Texturen |
| `…/js/libraryRoom/camera.js` | Mitte ↔ Regal-Fahrten, Umsehen, Annähern |
| `…/js/libraryRoom/lighting.js` | Oberlicht, Kerzen, Lampe, „Licht kommt mit“ |
| `…/js/libraryRoom/pick.js` | Raycast, Hover-Kippen, Tooltip, Bildschirm-Rechteck |
| `frontend/LuminaChronica.Client/wwwroot/lib/three/addons/…` | vendored `GLTFLoader.js`, `RGBELoader.js`, `BufferGeometryUtils.js` (Import auf `../three.module.min.js` umgeschrieben) |
| `frontend/LuminaChronica.Client/wwwroot/assets/library-room/` | `models/*.glb`, `textures/*.webp`, `hdri/*.hdr`, `CREDITS.md` |
| `tools/library-room/fetch.py` | lädt Poly-Haven-Assets (API) und packt sie (1K, WebP, GLB) |
| `tests/frontend/LibraryRoomLayoutTests.cs`, `LibraryRoomTests.cs` | Tests |

---

### Task 1: Raumaufteilung in C# (`LibraryRoomLayout`)

**Files:**
- Create: `frontend/LuminaChronica.Client/Models/LibraryRoomLayout.cs`
- Test: `tests/frontend/LibraryRoomLayoutTests.cs`

**Interfaces:**
- Consumes: `ShelfSection` (Label, Kind, Books, Progress), `ShelfLineLayout.SizeFor(Book) → ShelfBookSize(Width, Height)` (px; hier als **mm** gelesen: 26–44 mm dick, 176–222 mm hoch).
- Produces:
  - `public sealed record RoomCase(int Index, int Tier, double AngleDeg, int SectionIndex, string Label, bool Continued, bool Recent, IReadOnlyList<IReadOnlyList<Book>> Boards);`
  - `public sealed record RoomPlan(IReadOnlyList<RoomCase> Cases, int Tiers, int SlotsPerTier);`
  - `public static RoomPlan LibraryRoomLayout.Plan(IReadOnlyList<ShelfSection> sections)`
  - Konstanten: `SlotsPerTier = 12`, `MaxTiers = 3`, `Boards = 5`, `BoardWidthMm = 1500`, `GapMm = 3`, `RecentCoverMm = 150`.

Regeln: jedes Fach beginnt ein neues Regal; ein Regal hat 5 Bretter à 1500 mm; Bücher füllen Brett für Brett (Dicke + 3 mm); passt ein Fach nicht in ein Regal, geht es im nächsten weiter (`Continued = true`). „Zuletzt gelesen“ steht mit dem Cover nach vorne (150 mm pro Buch). Regal i steht auf Ebene `i / 12`, Winkel `(i % 12) * 30°` (0° = Blickrichtung beim Start). Über 36 Regale werden nicht gebaut (Stufe 3 = Saal); bis dahin werden überzählige Bücher auf das letzte Regal gekürzt — dieser Fall kommt bei 3 × 12 × ~200 Büchern praktisch nicht vor und wird im Test festgehalten.

- [ ] **Step 1: Write the failing tests**

```csharp
using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryRoomLayoutTests
{
    private static Book B(int id) => new() { Id = id, Title = $"Buch {id}" };

    private static ShelfSection Genre(string label, int from, int count) =>
        new(label, ShelfSectionKind.Genre, Enumerable.Range(from, count).Select(B).ToList());

    [Fact]
    public void EachCompartmentStartsItsOwnCase_AroundTheRing()
    {
        var plan = LibraryRoomLayout.Plan([Genre("Fantasy", 1, 3), Genre("Roman", 10, 2)]);

        Assert.Equal(2, plan.Cases.Count);
        Assert.Equal(1, plan.Tiers);
        Assert.Equal(["Fantasy", "Roman"], plan.Cases.Select(c => c.Label));
        Assert.Equal([0d, 30d], plan.Cases.Select(c => c.AngleDeg));
        Assert.All(plan.Cases, c => Assert.False(c.Continued));
        Assert.Equal([1, 2, 3], plan.Cases[0].Boards[0].Select(b => b.Id));
    }

    [Fact]
    public void ABoardHoldsWhatFitsItsWidth_ThenTheNextBoard()
    {
        // 50 books of at most 44 mm (+3 mm gap) never fit one 1500 mm board.
        var plan = LibraryRoomLayout.Plan([Genre("Fantasy", 1, 50)]);

        var boards = plan.Cases[0].Boards;
        Assert.True(boards.Count >= 2);
        Assert.All(boards, board =>
            Assert.True(board.Sum(b => ShelfLineLayout.SizeFor(b).Width + LibraryRoomLayout.GapMm) <= LibraryRoomLayout.BoardWidthMm + LibraryRoomLayout.GapMm));
        Assert.Equal(50, boards.Sum(b => b.Count));
    }

    [Fact]
    public void ACompartmentTooBigForOneCase_ContinuesInTheNext()
    {
        var plan = LibraryRoomLayout.Plan([Genre("Fantasy", 1, 400)]);

        Assert.True(plan.Cases.Count >= 2);
        Assert.False(plan.Cases[0].Continued);
        Assert.True(plan.Cases[1].Continued);
        Assert.All(plan.Cases, c => Assert.True(c.Boards.Count <= LibraryRoomLayout.Boards));
        Assert.Equal(400, plan.Cases.Sum(c => c.Boards.Sum(b => b.Count)));
    }

    [Fact]
    public void MoreThanTwelveCases_OpenTheGallery()
    {
        var sections = Enumerable.Range(0, 14).Select(i => Genre($"G{i}", i * 10 + 1, 2)).ToList();

        var plan = LibraryRoomLayout.Plan(sections);

        Assert.Equal(2, plan.Tiers);
        Assert.Equal(1, plan.Cases[12].Tier);
        Assert.Equal(0d, plan.Cases[12].AngleDeg);
    }

    [Fact]
    public void RecentlyRead_StandsCoverForward()
    {
        var recent = new ShelfSection("Zuletzt gelesen", ShelfSectionKind.Recent, Enumerable.Range(1, 12).Select(B).ToList());

        var plan = LibraryRoomLayout.Plan([recent]);

        Assert.True(plan.Cases[0].Recent);
        // 150 mm per cover plus the 3 mm gap: nine fit a 1500 mm board.
        Assert.Equal(9, plan.Cases[0].Boards[0].Count);
        Assert.Equal(3, plan.Cases[0].Boards[1].Count);
    }

    [Fact]
    public void EmptyLibrary_HasNoCases()
    {
        var plan = LibraryRoomLayout.Plan([]);

        Assert.Empty(plan.Cases);
        Assert.Equal(1, plan.Tiers);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd tests/frontend && dotnet test --filter LibraryRoomLayoutTests`
Expected: Build error „The name 'LibraryRoomLayout' does not exist“.

- [ ] **Step 3: Implement**

```csharp
namespace LuminaChronica.Client.Models;

// One bookcase of the 3D library: which compartment it holds, on which tier
// of the rotunda and at which angle, and its books board by board.
public sealed record RoomCase(int Index, int Tier, double AngleDeg, int SectionIndex, string Label, bool Continued, bool Recent, IReadOnlyList<IReadOnlyList<Book>> Boards);

public sealed record RoomPlan(IReadOnlyList<RoomCase> Cases, int Tiers, int SlotsPerTier);

// Spec 2026-10-12 (3D-Bibliothek) §3.2: the rotunda's layout. Book sizes are
// ShelfLineLayout's, read as millimetres; each compartment starts a new case.
public static class LibraryRoomLayout
{
    public const int SlotsPerTier = 12;
    public const int MaxTiers = 3;
    public const int Boards = 5;
    public const int BoardWidthMm = 1500;
    public const int GapMm = 3;
    public const int RecentCoverMm = 150;

    public static RoomPlan Plan(IReadOnlyList<ShelfSection> sections)
    {
        var cases = new List<RoomCase>();
        var max = SlotsPerTier * MaxTiers;
        for (var s = 0; s < sections.Count && cases.Count < max; s++)
        {
            var section = sections[s];
            var recent = section.Kind == ShelfSectionKind.Recent;
            int WidthOf(Book b) => recent ? RecentCoverMm : ShelfLineLayout.SizeFor(b).Width;

            var boards = new List<IReadOnlyList<Book>>();
            var board = new List<Book>();
            var used = 0;
            var continued = false;
            void CloseCase()
            {
                var index = cases.Count;
                cases.Add(new RoomCase(index, index / SlotsPerTier, index % SlotsPerTier * (360.0 / SlotsPerTier), s, section.Label, continued, recent, boards));
                boards = [];
                continued = true;
            }

            foreach (var book in section.Books)
            {
                var w = WidthOf(book);
                if (board.Count > 0 && used + w > BoardWidthMm)
                {
                    boards.Add(board);
                    board = [];
                    used = 0;
                    if (boards.Count == Boards)
                    {
                        CloseCase();
                        if (cases.Count == max) break;
                    }
                }
                board.Add(book);
                used += w + GapMm;
            }
            if (cases.Count == max) break;
            if (board.Count > 0) boards.Add(board);
            if (boards.Count > 0 || !continued) CloseCase();
        }
        var tiers = Math.Max(1, (cases.Count + SlotsPerTier - 1) / SlotsPerTier);
        return new RoomPlan(cases, tiers, SlotsPerTier);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tests/frontend && dotnet test --filter LibraryRoomLayoutTests`
Expected: 6 passed. (Ein Fach ohne Bücher — liefert `GroupForShelf` nie — bekäme ein leeres Regal mit Plakette.)

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/library-room
git add frontend/LuminaChronica.Client/Models/LibraryRoomLayout.cs tests/frontend/LibraryRoomLayoutTests.cs
git commit -m "feat(library-room): layout of compartments into rotunda cases"
```

---

### Task 2: three.js-Erweiterungen und Assets

**Files:**
- Create: `frontend/LuminaChronica.Client/wwwroot/lib/three/addons/loaders/GLTFLoader.js`, `…/addons/loaders/RGBELoader.js`, `…/addons/utils/BufferGeometryUtils.js`
- Create: `tools/library-room/fetch.py`, `tools/library-room/README.md`
- Create: `frontend/LuminaChronica.Client/wwwroot/assets/library-room/{models,textures,hdri}/…`, `…/CREDITS.md`

**Interfaces:**
- Produces: Dateien unter `assets/library-room/`, deren Namen `theme.js` (Task 4) und `lighting.js`/`rotunda.js` verwenden:
  - Modelle (`models/<id>.glb`): `round_wooden_table_01`, `vintage_oil_lamp`, `Chandelier_01`, `ArmChair_01`, `brass_candleholders`, `wooden_candlestick`, `marble_bust_01`, `vintage_grandfather_clock_01`, `decorative_book_set_01`, `Lantern_01`
  - Texturen (`textures/<id>_{diff,nor,arm}.webp`, 1K): `herringbone_parquet`, `dark_wooden_planks`, `walnut_veneer`, `white_stucco`, `plastered_wall_04`, `marble_tiles`, `blue_floor_tiles_01`, `quatrefoil_jacquard_fabric`
  - HDRI (`hdri/<id>_1k.hdr`): `reading_room`, `sepulchral_chapel_rotunda`

- [ ] **Step 1: Addons holen und Importe umschreiben**

```bash
cd frontend/LuminaChronica.Client/wwwroot/lib/three
mkdir -p addons/loaders addons/utils
curl -sL https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js -o addons/loaders/GLTFLoader.js
curl -sL https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/RGBELoader.js -o addons/loaders/RGBELoader.js
curl -sL https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js -o addons/utils/BufferGeometryUtils.js
sed -i "s#from 'three'#from '../../three.module.min.js'#" addons/loaders/*.js addons/utils/*.js
grep -n "from '" addons/loaders/*.js addons/utils/*.js
```
Expected: alle Importe zeigen auf `../../three.module.min.js` oder `../utils/BufferGeometryUtils.js`. `LICENSE` (MIT) gilt mit.

- [ ] **Step 2: `tools/library-room/fetch.py` schreiben**

```python
# Fetches the 3D library's CC0 assets from Poly Haven (api.polyhaven.com)
# and packs them for the web: models as one .glb with 1K WebP textures,
# texture sets as 1K WebP, HDRIs as 1K .hdr. Writes CREDITS.md.
import io, json, os, struct, sys, urllib.request
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'frontend/LuminaChronica.Client/wwwroot/assets/library-room'
MODELS = ['round_wooden_table_01', 'vintage_oil_lamp', 'Chandelier_01', 'ArmChair_01', 'brass_candleholders',
          'wooden_candlestick', 'marble_bust_01', 'vintage_grandfather_clock_01', 'decorative_book_set_01', 'Lantern_01']
TEXTURES = ['herringbone_parquet', 'dark_wooden_planks', 'walnut_veneer', 'white_stucco', 'plastered_wall_04',
            'marble_tiles', 'blue_floor_tiles_01', 'quatrefoil_jacquard_fabric']
HDRIS = ['reading_room', 'sepulchral_chapel_rotunda']
UA = {'User-Agent': 'LuminaChronica-asset-fetch/1.0'}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()

def info(asset):
    return json.loads(get(f'https://api.polyhaven.com/info/{asset}'))

def webp(data, size=1024, alpha=False):
    im = Image.open(io.BytesIO(data)); im.thumbnail((size, size))
    out = io.BytesIO(); im.save(out, 'WEBP', quality=86, lossless=False) if (alpha or im.mode != 'RGBA') else im.save(out, 'WEBP', quality=86)
    return out.getvalue()

def pad(b, c=b'\0'):
    return b + c * ((4 - len(b) % 4) % 4)

def model(asset):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))['gltf']['1k']['gltf']
    g = json.loads(get(files['url']))
    blob = bytearray(get(files['include'][g['buffers'][0]['uri']]['url']))
    for img in g.get('images', []):
        uri = img.pop('uri')
        data = webp(get(files['include'][uri]['url']))
        while len(blob) % 4: blob += b'\0'
        g['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)})
        blob += data
        img['bufferView'] = len(g['bufferViews']) - 1; img['mimeType'] = 'image/webp'
    g.setdefault('extensionsUsed', [])
    while len(blob) % 4: blob += b'\0'
    g['buffers'] = [{'byteLength': len(blob)}]
    js = pad(json.dumps(g).encode(), b' ')
    glb = struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(f'{OUT}/models/{asset}.glb', 'wb').write(glb)

def texture(asset):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    for key, name in [('Diffuse', 'diff'), ('nor_gl', 'nor'), ('arm', 'arm')]:
        if key in files:
            open(f'{OUT}/textures/{asset}_{name}.webp', 'wb').write(webp(get(files[key]['1k']['jpg']['url'])))

def hdri(asset):
    files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
    open(f'{OUT}/hdri/{asset}_1k.hdr', 'wb').write(get(files['hdri']['1k']['hdr']['url']))

for d in ('models', 'textures', 'hdri'):
    os.makedirs(f'{OUT}/{d}', exist_ok=True)
rows = []
for kind, assets, fn in [('Modell', MODELS, model), ('Textur', TEXTURES, texture), ('HDRI', HDRIS, hdri)]:
    for a in assets:
        fn(a)
        meta = info(a)
        rows.append(f"| {kind} | `{a}` | {meta['name']} | {', '.join(meta.get('authors', {}).keys())} |")
        print('ok', a)
open(f'{OUT}/CREDITS.md', 'w', encoding='utf-8').write(
    '# 3D-Bibliothek – Assets\n\nAlle Assets von [Poly Haven](https://polyhaven.com), Lizenz **CC0** (gemeinfrei). '
    'Gepackt mit `tools/library-room/fetch.py` (1K, WebP).\n\n| Art | Datei | Name | Autor:innen |\n|---|---|---|---|\n' + '\n'.join(rows) + '\n')
total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs)
print('total', round(total / 1048576, 1), 'MB')
```

(`ArmChair_01` u. a. haben in der API ggf. andere Auflösungsschlüssel; wenn `['1k']` fehlt, das kleinste vorhandene nehmen — beim Lauf prüfen und das Skript entsprechend anpassen.)

- [ ] **Step 3: Laufen lassen und Budget prüfen**

Run: `python tools/library-room/fetch.py`
Expected: je Asset `ok …`, am Ende `total ≤ 15 MB`. Wenn darüber: Texturen der Modelle auf 512 px (`webp(…, 512)`) für kleine Objekte (Leuchter, Kerzenhalter, Bücher).

- [ ] **Step 4: README für das Werkzeug**

```markdown
# tools/library-room

Lädt die CC0-Assets der 3D-Bibliothek von Poly Haven und packt sie für das Web
(Modelle als .glb mit 1K-WebP-Texturen, Texturen 1K WebP, HDRI 1K .hdr).

    pip install pillow
    python tools/library-room/fetch.py

Schreibt nach `frontend/LuminaChronica.Client/wwwroot/assets/library-room/`
inklusive `CREDITS.md`. Budget: insgesamt ≤ 15 MB.
```

- [ ] **Step 5: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/lib/three/addons tools/library-room frontend/LuminaChronica.Client/wwwroot/assets/library-room
git commit -m "feat(library-room): three.js loaders and CC0 assets (Poly Haven)"
```

---

### Task 3: Stil „3D-Bibliothek“ und Blazor-Komponente `LibraryRoom`

**Files:**
- Modify: `frontend/LuminaChronica.Client/Models/ShelfStyles.cs`
- Create: `frontend/LuminaChronica.Client/Components/LibraryRoom/LibraryRoom.razor`, `LibraryRoom.razor.cs`
- Create: `frontend/LuminaChronica.Client/wwwroot/Styles/library-room.css` (+ Einbindung wie `shelf-room.css` in `wwwroot/index.html`)
- Create: `frontend/LuminaChronica.Client/wwwroot/js/libraryRoom/index.js` (erste Fassung: `supported`, `init`, `update`, `focusBook`, `pickBook`, `goTo`, `goHome`, `dispose`; Szene leer bis Task 4)
- Modify: `frontend/LuminaChronica.Client/Pages/Library.razor:175-195`
- Modify: i18n `de.json`, `en.json`, `tests/frontend/FakeI18nService.cs`
- Test: `tests/frontend/LibraryRoomTests.cs`, `tests/frontend/LibraryShelfStyleTests.cs`

**Interfaces:**
- Consumes: `LibraryRoomLayout.Plan` (Task 1), `BookOpenRequest`, `BookSpreadSource`, `ShelfSection`.
- Produces:
  - `ShelfStyles.Library = "library"`; `Available = [Classic, Leather, Library, Legacy]`; `Normalize("room"|"rotunda") == Library`.
  - `<LibraryRoom Sections OnOpen />`
  - JS-Aufrufe aus .NET: `index.js` Exporte `supported(): bool`, `init(container, dotNet, data)`, `update(container, data)`, `focusBook(container, id)`, `pickBook(container, id)`, `goTo(container, caseIndex)`, `goHome(container)`, `dispose(container)`.
  - .NET-Callbacks aus JS: `Open(int id, double left, double top, double width, double height)`, `Ready()`, `Failed()`, `CaseChanged(int caseIndex)` (−1 = Mitte).
  - Szenen-Daten: `{ tiers, slots, cases: [{ index, tier, angle, label, continued, recent, boards: [[{ id, title, author, colour, w, h, progress }]] }] }` (`w`/`h` in mm).
  - i18n: `settings.shelfStyle.library` = „3D-Bibliothek“, `settings.shelfStyle.libraryHint` = „Ein runder Lesesaal mit echtem Licht – klick ein Regal an und geh hin“; `libraryRoom.label` = „3D-Bibliothek“, `libraryRoom.cases` = „Regale“, `libraryRoom.home` = „Zurück zur Mitte“, `libraryRoom.loading` = „Die Bibliothek wird eingerichtet …“, `libraryRoom.noWebGl` = „Dein Browser kann die 3D-Bibliothek nicht darstellen, deshalb siehst du das klassische Regal.“, `libraryRoom.indexLabel` = „Bücher in der 3D-Bibliothek“, `libraryRoom.continued` = „{0} (Fortsetzung)“. Englisch: „3D library“, „A round reading room with real light – click a case and walk over“, „Cases“, „Back to the centre“, „Setting up the library …“, „Your browser can't show the 3D library, so you see the classic shelf.“, „Books in the 3D library“, „{0} (continued)“.

- [ ] **Step 1: Failing tests**

`tests/frontend/LibraryRoomTests.cs`:

```csharp
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryRoomTests : BunitContext
{
    private static readonly List<ShelfSection> Sections =
    [
        new("Zuletzt gelesen", ShelfSectionKind.Recent, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }], new Dictionary<int, double> { [1] = 80 }),
        new("Fantasy", ShelfSectionKind.Genre, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }, new Book { Id = 2, Title = "Krabat" }]),
    ];

    public LibraryRoomTests()
    {
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void WithoutWebGl_TheClassicShelfStandsIn()
    {
        JSInterop.SetupModule("./js/libraryRoom/index.js").Setup<bool>("supported").SetResult(false);

        var cut = Render<LibraryRoom>(p => p.Add(x => x.Sections, Sections));

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".classic-shelf")));
        Assert.Contains("klassische Regal", cut.Find(".library-room-fallback").TextContent);
    }

    [Fact]
    public void WithWebGl_ListsCasesAndBooks_AndOpensWhatTheSceneReports()
    {
        var module = JSInterop.SetupModule("./js/libraryRoom/index.js");
        module.Setup<bool>("supported").SetResult(true);
        var goTo = module.SetupVoid("goTo", _ => true);
        var pick = module.SetupVoid("pickBook", _ => true);
        BookOpenRequest? opened = null;

        var cut = Render<LibraryRoom>(p => p.Add(x => x.Sections, Sections).Add(x => x.OnOpen, (BookOpenRequest r) => opened = r));

        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".library-room-case").Select(b => b.TextContent.Trim()));
        Assert.Equal(3, cut.FindAll(".library-room-index a").Count);

        cut.FindAll(".library-room-case")[1].Click();
        Assert.Equal(1, Assert.Single(goTo.Invocations).Arguments[1]);

        cut.FindAll(".library-room-index a")[2].Click();
        Assert.Equal(2, Assert.Single(pick.Invocations).Arguments[1]);

        cut.InvokeAsync(() => cut.Instance.Open(1, 10, 20, 30, 40));
        Assert.Equal(80, opened!.Progress);
        Assert.Equal(new BookSpreadSource(null, 10, 20, 30, 40), opened.Source);
    }

    [Fact]
    public void CaseChanged_MarksTheCase_AndShowsTheWayBack()
    {
        JSInterop.SetupModule("./js/libraryRoom/index.js").Setup<bool>("supported").SetResult(true);
        var cut = Render<LibraryRoom>(p => p.Add(x => x.Sections, Sections));
        Assert.Empty(cut.FindAll(".library-room-home"));

        cut.InvokeAsync(() => cut.Instance.CaseChanged(1));

        Assert.Equal("true", cut.FindAll(".library-room-case")[1].GetAttribute("aria-pressed"));
        Assert.NotEmpty(cut.FindAll(".library-room-home"));
    }

    [Fact]
    public void OldRoomAndRotundaChoices_BecomeTheLibrary()
    {
        Assert.Equal(ShelfStyles.Library, ShelfStyles.Normalize("room"));
        Assert.Equal(ShelfStyles.Library, ShelfStyles.Normalize("rotunda"));
        Assert.Equal([ShelfStyles.Classic, ShelfStyles.Leather, ShelfStyles.Library, ShelfStyles.Legacy], ShelfStyles.Available);
    }
}
```

In `LibraryShelfStyleTests.cs` einen Test ergänzen:

```csharp
    [Fact]
    public void ShelfView_LibraryStyle_RendersTheLibraryRoom()
    {
        JSInterop.SetupModule("./js/libraryPreferences.js").Setup<string?>("getShelfStyle", _ => true).SetResult("rotunda");
        JSInterop.SetupModule("./js/libraryRoom/index.js").Setup<bool>("supported").SetResult(true);
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".library-room")));
    }
```

- [ ] **Step 2: Run, expect failure**

Run: `cd tests/frontend && dotnet test --filter "LibraryRoomTests|LibraryShelfStyleTests"`
Expected: Build error (`LibraryRoom`, `ShelfStyles.Library` fehlen).

- [ ] **Step 3: `ShelfStyles`**

```csharp
public static class ShelfStyles
{
    public const string Classic = "classic";
    public const string Leather = "leather";
    public const string Library = "library";
    public const string Legacy = "legacy";
    public const string Default = Classic;

    public static readonly string[] Available = [Classic, Leather, Library, Legacy];

    // "room" and "rotunda" were styles until the 3D library replaced them.
    public static string Normalize(string? stored) => stored switch
    {
        "room" or "rotunda" => Library,
        not null when Available.Contains(stored) => stored,
        _ => Default,
    };
}
```

- [ ] **Step 4: `LibraryRoom.razor`**

```razor
@namespace LuminaChronica.Client.Components
@using LuminaChronica.Client.Models
@using LuminaChronica.Client.Services
@implements IAsyncDisposable
@inject IJSRuntime JsRuntime
@inject II18nService I18n

@* The 3D library (spec 2026-10-12 library-room): a rotunda of bookcases in
   three.js (js/libraryRoom). Click a case (or one in the list) and the
   camera walks there; a book opens through BookSpread. The list of links is
   what keyboards and screen readers use. Without WebGL the classic shelf
   stands in. *@
@if (_fallback)
{
    <p class="library-room-fallback text-muted">@I18n.T("libraryRoom.noWebGl")</p>
    <ClassicShelf Sections="Sections" OnOpen="OnOpen" />
}
else
{
    <div class="library-room @(_ready ? "is-ready" : null)" @ref="_containerRef" role="region" aria-label="@I18n.T("libraryRoom.label")">
        <div class="library-room-stage" aria-hidden="true"></div>
        @if (!_ready)
        {
            <div class="library-room-loading" role="status">@I18n.T("libraryRoom.loading")</div>
        }
        <div class="library-room-tip" aria-hidden="true"><strong></strong><span></span></div>
        <div class="library-room-ui">
            <nav class="library-room-cases" aria-label="@I18n.T("libraryRoom.cases")">
                @foreach (var c in _plan.Cases.Where(c => !c.Continued))
                {
                    var index = c.Index;
                    <button type="button" class="library-room-case" aria-pressed="@(SectionOf(_current) == c.SectionIndex ? "true" : "false")"
                            @onclick="() => GoToAsync(index)">@c.Label</button>
                }
            </nav>
            @if (_current >= 0)
            {
                <button type="button" class="library-room-home" @onclick="GoHomeAsync">@I18n.T("libraryRoom.home")</button>
            }
        </div>
        <nav class="library-room-index" aria-label="@I18n.T("libraryRoom.indexLabel")">
            @foreach (var c in _plan.Cases)
            {
                <h3 class="library-room-index-heading">@(c.Continued ? I18n.T("libraryRoom.continued", c.Label) : c.Label)</h3>
                <ul>
                    @foreach (var book in c.Boards.SelectMany(b => b))
                    {
                        <li @key="(c.Index, book.Id)">
                            <a href="library/books/@book.Id" @onfocus="() => FocusAsync(book)" @onclick="() => PickAsync(book)" @onclick:preventDefault="true">@Label(book)</a>
                        </li>
                    }
                </ul>
            }
        </nav>
    </div>
}
```

(`I18n.T(key, arg)` — prüfen, ob `II18nService` eine Format-Überladung hat; sonst `string.Format(I18n.T("libraryRoom.continued"), c.Label)`.)

- [ ] **Step 5: `LibraryRoom.razor.cs`**

```csharp
using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class LibraryRoom
{
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Parameter, EditorRequired]
    public IReadOnlyList<ShelfSection> Sections { get; set; } = [];

    [Parameter]
    public EventCallback<BookOpenRequest> OnOpen { get; set; }

    private RoomPlan _plan = new([], 1, LibraryRoomLayout.SlotsPerTier);
    private string? _planKey;
    private string? _sentKey;
    private bool _fallback;
    private bool _ready;
    private int _current = -1;
    private ElementReference _containerRef;
    private IJSObjectReference? _module;
    private DotNetObjectReference<LibraryRoom>? _selfRef;

    private static string Label(Book book) => string.IsNullOrWhiteSpace(book.Author) ? book.Title : $"{book.Title}, {book.Author}";

    private string Key() => string.Join("|", Sections.Select(s => s.Label + ":" + string.Join(",", s.Books.Select(b => b.Id))));

    protected override void OnParametersSet()
    {
        var key = Key();
        if (key == _planKey) return;
        _planKey = key;
        _plan = LibraryRoomLayout.Plan(Sections);
    }

    private int SectionOf(int caseIndex) => caseIndex >= 0 && caseIndex < _plan.Cases.Count ? _plan.Cases[caseIndex].SectionIndex : -1;

    private double? ProgressOf(int id) =>
        Sections.FirstOrDefault(s => s.Kind == ShelfSectionKind.Recent)?.Progress is { } p && p.TryGetValue(id, out var v) ? v : null;

    private object SceneData() => new
    {
        tiers = _plan.Tiers,
        slots = _plan.SlotsPerTier,
        cases = _plan.Cases.Select(c => new
        {
            index = c.Index,
            tier = c.Tier,
            angle = c.AngleDeg,
            label = c.Label,
            continued = c.Continued,
            recent = c.Recent,
            boards = c.Boards.Select(board => board.Select(b =>
            {
                var size = ShelfLineLayout.SizeFor(b);
                return new { id = b.Id, title = b.Title, author = b.Author, colour = Leathers[b.Id % Leathers.Length], w = size.Width, h = size.Height, progress = c.Recent ? ProgressOf(b.Id) : null };
            })),
        }),
    };

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (_fallback) return;
        try
        {
            if (firstRender)
            {
                _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/libraryRoom/index.js");
                if (!await _module.InvokeAsync<bool>("supported"))
                {
                    _fallback = true;
                    StateHasChanged();
                    return;
                }
                _selfRef = DotNetObjectReference.Create(this);
                _sentKey = _planKey;
                await _module.InvokeVoidAsync("init", _containerRef, _selfRef, SceneData());
                return;
            }
            if (_module is not null && _sentKey != _planKey)
            {
                _sentKey = _planKey;
                await _module.InvokeVoidAsync("update", _containerRef, SceneData());
            }
        }
        catch (Exception) when (firstRender)
        {
            _fallback = true;
            StateHasChanged();
        }
    }

    [JSInvokable]
    public Task Open(int id, double left, double top, double width, double height)
    {
        var book = Sections.SelectMany(s => s.Books).FirstOrDefault(b => b.Id == id);
        return book is null ? Task.CompletedTask
            : OnOpen.InvokeAsync(new BookOpenRequest(book, ProgressOf(id), new BookSpreadSource(null, left, top, width, height)));
    }

    [JSInvokable]
    public void Ready() { _ready = true; StateHasChanged(); }

    [JSInvokable]
    public void Failed() { _fallback = true; StateHasChanged(); }

    [JSInvokable]
    public void CaseChanged(int caseIndex) { _current = caseIndex; StateHasChanged(); }

    private async Task GoToAsync(int caseIndex) { if (_module is not null) await _module.InvokeVoidAsync("goTo", _containerRef, caseIndex); }

    private async Task GoHomeAsync() { if (_module is not null) await _module.InvokeVoidAsync("goHome", _containerRef); }

    private async Task FocusAsync(Book book) { if (_module is not null) await _module.InvokeVoidAsync("focusBook", _containerRef, book.Id); }

    private async Task PickAsync(Book book) { if (_module is not null) await _module.InvokeVoidAsync("pickBook", _containerRef, book.Id); }

    public async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            try
            {
                await _module.InvokeVoidAsync("dispose", _containerRef);
                await _module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
        _selfRef?.Dispose();
    }
}
```

(Test `CaseChanged_MarksTheCase…` erwartet bei `CaseChanged(1)` das zweite Fach markiert: Fall-Index 1 = „Fantasy“ = SectionIndex 1 → Knopf 2 hat `aria-pressed="true"`.)

- [ ] **Step 6: `index.js` erste Fassung (ohne Szene)**

```js
// The 3D library (LibraryRoom): the interface to Blazor. The scene lives in
// the neighbouring modules; this file only wires them to a container.
import { createScene } from "./scene.js";

const rooms = new WeakMap();

export function supported() {
    try {
        return !!(window.WebGL2RenderingContext && document.createElement("canvas").getContext("webgl2"));
    } catch {
        return false;
    }
}

export async function init(container, dotNet, data) {
    try {
        const room = await createScene(container, dotNet, data);
        rooms.set(container, room);
        dotNet.invokeMethodAsync("Ready");
    } catch (error) {
        console.error("[library-room]", error);
        dotNet.invokeMethodAsync("Failed");
    }
}

export function update(container, data) { rooms.get(container)?.update(data); }
export function focusBook(container, id) { rooms.get(container)?.focusBook(id); }
export function pickBook(container, id) { rooms.get(container)?.pickBook(id); }
export function goTo(container, caseIndex) { rooms.get(container)?.goTo(caseIndex); }
export function goHome(container) { rooms.get(container)?.goHome(); }

export function dispose(container) {
    rooms.get(container)?.dispose();
    rooms.delete(container);
}
```

und vorläufig `scene.js`:

```js
// Placeholder until Task 4: an empty, transparent scene object with the
// room interface, so the component can be wired and tested end to end.
export async function createScene() {
    const noop = () => {};
    return { update: noop, focusBook: noop, pickBook: noop, goTo: noop, goHome: noop, dispose: noop };
}
```

- [ ] **Step 7: `library-room.css`**

```css
/* The 3D library (component LibraryRoom, scene in js/libraryRoom). A fixed
   room height in the page; the list of cases and the way back sit on the
   stage; a link list for keyboards stays hidden until focused. */
.library-room {
    position: relative;
    height: max(480px, 72vh);
    overflow: clip;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--shelf-wood) 35%, #050302);
}

.library-room-stage,
.library-room-stage canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
}

.library-room-stage canvas {
    opacity: 0;
    transition: opacity 0.8s ease;
    touch-action: none;
}

.library-room.is-ready .library-room-stage canvas {
    opacity: 1;
}

.library-room-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: color-mix(in srgb, var(--shelf-brass-hi) 80%, transparent);
    font: 600 14px/1.3 "Cinzel", var(--font-family-display);
    letter-spacing: 0.12em;
}

.library-room-ui {
    position: absolute;
    z-index: 3;
    left: 16px;
    right: 16px;
    bottom: 14px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    pointer-events: none;
}

.library-room-cases {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    pointer-events: auto;
    scrollbar-width: thin;
}

.library-room-case,
.library-room-home {
    flex: none;
    padding: 7px 12px;
    border: 1px solid color-mix(in srgb, var(--shelf-brass) 50%, transparent);
    border-radius: 999px;
    background: rgba(10, 6, 3, 0.72);
    color: #eadfc6;
    font: 600 12px/1.2 var(--font-family-ui);
    cursor: pointer;
    pointer-events: auto;
    transition: border-color 0.2s ease, background-color 0.2s ease;
}

.library-room-case:hover,
.library-room-home:hover {
    border-color: var(--shelf-brass-hi);
}

.library-room-case[aria-pressed="true"] {
    background: linear-gradient(180deg, var(--shelf-brass-hi), var(--shelf-brass));
    color: var(--shelf-plaque-ink);
}

.library-room-case:focus-visible,
.library-room-home:focus-visible {
    outline: 2px solid var(--shelf-brass-hi);
    outline-offset: 2px;
}

.library-room-tip {
    position: absolute;
    z-index: 2;
    max-width: 240px;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--shelf-brass) 45%, transparent);
    border-radius: 8px;
    background: rgba(12, 8, 4, 0.86);
    color: #f1e5c8;
    font: 13px/1.3 var(--font-family-ui);
    pointer-events: none;
    opacity: 0;
    transform: translate(-50%, -100%);
    transition: opacity 0.15s ease;
}

.library-room-tip.is-shown {
    opacity: 1;
}

.library-room-tip strong {
    display: block;
    font: 700 15px/1.2 "Cormorant Garamond", Georgia, serif;
}

.library-room-index ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.library-room-index-heading,
.library-room-index a {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}

.library-room-index a:focus-visible {
    z-index: 4;
    top: 14px;
    left: 50%;
    width: auto;
    height: auto;
    padding: 8px 12px;
    clip-path: none;
    border: 1px solid var(--shelf-brass-hi);
    border-radius: 8px;
    background: rgba(16, 10, 5, 0.9);
    color: #f3e6c4;
    font: 600 13px/1.3 var(--font-family-ui);
    text-decoration: none;
    transform: translateX(-50%);
    outline: none;
}

.library-room-fallback {
    margin: 0 0 var(--space-2);
}

@media (prefers-reduced-motion: reduce) {
    .library-room-stage canvas {
        transition: none;
    }
}
```

`wwwroot/index.html`: neben `shelf-room.css` die Zeile `<link rel="stylesheet" href="Styles/library-room.css" />` ergänzen (gleiche Form wie die vorhandenen Regal-Stylesheets).

- [ ] **Step 8: `Library.razor` umstellen**

Die Zweige `Rotunda`/`Room` durch einen ersetzen:

```razor
        @if (_shelfStyle == ShelfStyles.Library)
        {
            @* The 3D library holds the whole library at once (its cases are
               laid out from all of it), so it isn't revealed in batches. *@
            <LibraryRoom Sections="@sections" OnOpen="OpenBookAsync" />
        }
        else if (_shelfStyle == ShelfStyles.Leather)
```

und die Sentinel-Bedingung zu `@if (_shelfStyle != ShelfStyles.Library && _visibleBookCount < (_allItems?.Count ?? 0))`.

- [ ] **Step 9: i18n** — Schlüssel aus „Interfaces“ mit dem Helfer anlegen (Anker `settings.shelfStyle.leatherHint` bzw. `rotunda.bays`), die Einstellungs-Schlüssel `settings.shelfStyle.room*`/`rotunda*` bleiben bis Task 9 (alte Tests).

- [ ] **Step 10: Run tests** — `cd tests/frontend && dotnet test` → alle grün (bestehende `RotundaShelfTests`/`ShelfRoomTests` testen die Komponenten direkt und bleiben bis Task 9 grün).

- [ ] **Step 11: Commit**

```bash
git add frontend/LuminaChronica.Client/Models/ShelfStyles.cs frontend/LuminaChronica.Client/Components/LibraryRoom frontend/LuminaChronica.Client/wwwroot/Styles/library-room.css frontend/LuminaChronica.Client/wwwroot/index.html frontend/LuminaChronica.Client/wwwroot/js/libraryRoom frontend/LuminaChronica.Client/Pages/Library.razor frontend/LuminaChronica.Client/wwwroot/i18n/de.json frontend/LuminaChronica.Client/wwwroot/i18n/en.json tests/frontend/FakeI18nService.cs tests/frontend/LibraryRoomTests.cs tests/frontend/LibraryShelfStyleTests.cs
git commit -m "feat(library-room): style 3D-Bibliothek and its Blazor shell"
```

---

### Task 4: Szene, Qualitätsstufe, Theme, Assets und die Architektur der Rotunde

**Files:**
- Create: `js/libraryRoom/scene.js` (ersetzt den Platzhalter), `quality.js`, `theme.js`, `assets.js`, `rotunda.js`

**Interfaces:**
- Consumes: Szenen-Daten (Task 3), Assets (Task 2), `--shelf-*`-Tokens.
- Produces:
  - `createScene(container, dotNet, data) → Promise<Room>`; `Room` = `{ update(data), focusBook(id), pickBook(id), goTo(i), goHome(), dispose() }` und intern `{ renderer, scene, camera, quality, theme, assets, wake(), onFrame(fn), stage }`.
  - `quality.js`: `chooseQuality(renderer) → { level: "high"|"medium"|"low", pixelRatio, shadowSize, shadowLights, antialias }`, `watchFps(room, onDowngrade)`.
  - `theme.js`: `readTheme() → { key, wood, brass, brassHi, brassLo, ink, light, floor: textureId, wall: textureId, dome: textureId, rug: textureId, hdri: hdriId, sky: 0xRRGGBB, skyIntensity, props: [modelId…] }`; Tabelle pro `data-theme` (11 Themes + `system` hell/dunkel), Standard = `classic-library`.
  - `assets.js`: `createAssets(renderer) → { model(id) → Promise<THREE.Object3D|null>, material(textureId, { repeat, tint }) → Promise<THREE.MeshStandardMaterial>, environment(hdriId) → Promise<THREE.Texture|null>, dispose() }`; Fehler → `null` bzw. Farbmaterial, einmal `console.warn`.
  - `rotunda.js`: `buildRotunda(room, plan) → { group, radius, caseSlots: [{ index, tier, angle, position: Vector3, facing: Vector3 }], floorY(tier) }`. Maße (m): Radius `R = 5.6`, Regal 1.70 breit / 2.55 hoch / 0.38 tief, Ebenenhöhe 3.3, Kuppel ab `3.3 * tiers + 0.6`, Oberlicht-Öffnung Ø 2.2. Freie Plätze im Ring (weniger als 12 Regale) werden Fenster-Nischen (hohes Bogenfenster mit Mondlicht/Tageslicht-Glas, darunter eine Büste oder ein Leuchter aus `theme.props`). Galerie: Boden-Ring 1.2 m breit mit Messing-Geländer, Treppe weglassen (nicht begehbar, nur sichtbar).

- [ ] **Step 1: `quality.js`**

```js
// Picks how much the scene may cost on this device and lowers it when the
// frame rate stays low (spec §3.2).
export function chooseQuality(renderer) {
    const gl = renderer.getContext();
    const mobile = matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/.test(navigator.userAgent);
    const memory = navigator.deviceMemory ?? 4;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const level = mobile || memory <= 2 || maxTex < 8192 ? "low" : memory <= 4 ? "medium" : "high";
    return settings(level);
}

export function settings(level) {
    return {
        level,
        pixelRatio: Math.min(window.devicePixelRatio || 1, level === "high" ? 2 : level === "medium" ? 1.5 : 1),
        shadowSize: level === "high" ? 2048 : level === "medium" ? 1024 : 0,
        shadowLights: level === "high" ? 3 : level === "medium" ? 1 : 0,
        antialias: level !== "low",
    };
}

// Average over ~2 s of continuous rendering; below 40 fps step down once
// per 4 s, never below "low".
export function watchFps(room, onDowngrade) {
    let frames = 0, since = performance.now(), last = 0;
    room.onFrame((now) => {
        frames++;
        if (now - since < 2000) return;
        const fps = frames * 1000 / (now - since);
        frames = 0; since = now;
        if (fps < 40 && room.quality.level !== "low" && now - last > 4000) {
            last = now;
            onDowngrade(settings(room.quality.level === "high" ? "medium" : "low"));
        }
    });
}
```

- [ ] **Step 2: `theme.js`** — Tabelle (Auszug; alle 11 Themes + `system` eintragen, Werte aus den vorhandenen `--shelf-*`-Tokens ableiten):

```js
// The room in the theme's dress (spec §1: same architecture, the theme's
// materials, light and decor). Colours come from the --shelf-* tokens; the
// table picks textures, sky and props per theme.
const TABLE = {
    "classic-library": { floor: "herringbone_parquet", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffe2b0, skyIntensity: 2.2, props: ["vintage_grandfather_clock_01", "marble_bust_01", "brass_candleholders"] },
    "dark-library": { floor: "dark_wooden_planks", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0x9fb4ff, skyIntensity: 1.1, props: ["marble_bust_01", "Lantern_01", "wooden_candlestick"] },
    "alexandria": { floor: "marble_tiles", wall: "white_stucco", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "sepulchral_chapel_rotunda", sky: 0xfff0d0, skyIntensity: 2.6, props: ["marble_bust_01", "brass_candleholders", "decorative_book_set_01"] },
    "babylon": { floor: "blue_floor_tiles_01", wall: "plastered_wall_04", dome: "white_stucco", rug: "quatrefoil_jacquard_fabric", hdri: "reading_room", sky: 0xffd9a0, skyIntensity: 2.4, props: ["brass_candleholders", "Lantern_01", "decorative_book_set_01"] },
    // … skriptorium, ischtar, abendhafen, daemmergarten, nachtgarten, modern-light, system-light, system-dark
};

export function readTheme() {
    const html = document.documentElement;
    let key = html.dataset.theme || "classic-library";
    if (key === "system") key = matchMedia("(prefers-color-scheme: dark)").matches ? "system-dark" : "system-light";
    const s = getComputedStyle(html);
    const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    return {
        key,
        ...(TABLE[key] ?? TABLE["classic-library"]),
        wood: get("--shelf-wood", "#3a2315"),
        brass: get("--shelf-brass", "#d2ab52"),
        brassHi: get("--shelf-brass-hi", "#f1d995"),
        brassLo: get("--shelf-brass-lo", "#9c7428"),
        ink: get("--shelf-plaque-ink", "#2b1a08"),
        light: get("--shelf-light", "rgba(255,190,110,.22)"),
    };
}
```

- [ ] **Step 3: `assets.js`**

```js
import * as THREE from "../../lib/three/three.module.min.js";
import { GLTFLoader } from "../../lib/three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "../../lib/three/addons/loaders/RGBELoader.js";

const BASE = new URL("../../assets/library-room/", import.meta.url).href;

// Loads the room's CC0 assets once per room; a failure yields a plain
// stand-in (null model, colour-only material) and one warning, never a crash.
export function createAssets(renderer) {
    const cache = new Map();
    const textures = new THREE.TextureLoader();
    const gltf = new GLTFLoader();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const warned = new Set();
    const warn = (what, error) => { if (!warned.has(what)) { warned.add(what); console.warn("[library-room] asset", what, error); } };
    const once = (key, load) => { if (!cache.has(key)) cache.set(key, load()); return cache.get(key); };
    const tex = (url, srgb) => new Promise((resolve) => textures.load(url, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
    }, undefined, () => resolve(null)));

    return {
        model: (id) => once(`m:${id}`, () => gltf.loadAsync(`${BASE}models/${id}.glb`)
            .then((g) => { g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return g.scene; })
            .catch((e) => { warn(id, e); return null; })),
        material: async (id, { repeat = 1, tint } = {}) => {
            const [map, normalMap, arm] = await Promise.all([
                tex(`${BASE}textures/${id}_diff.webp`, true), tex(`${BASE}textures/${id}_nor.webp`), tex(`${BASE}textures/${id}_arm.webp`)]);
            if (!map) warn(id, "missing");
            for (const t of [map, normalMap, arm]) t?.repeat.set(repeat, repeat);
            return new THREE.MeshStandardMaterial({
                map, normalMap, roughnessMap: arm, metalnessMap: arm, aoMap: arm,
                roughness: 1, metalness: arm ? 1 : 0, color: tint ? new THREE.Color(tint) : 0xffffff,
            });
        },
        environment: (id) => once(`h:${id}`, () => new RGBELoader().loadAsync(`${BASE}hdri/${id}_1k.hdr`)
            .then((hdr) => { const env = pmrem.fromEquirectangular(hdr).texture; hdr.dispose(); return env; })
            .catch((e) => { warn(id, e); return null; })),
        dispose: () => { pmrem.dispose(); cache.clear(); },
    };
}
```

(Modelle werden pro Platz per `object.clone(true)` verwendet.)

- [ ] **Step 4: `rotunda.js`** — Architektur bauen:
  - Boden: Kreis `R + 0.6` mit `material(theme.floor, { repeat: 6 })`, in der Mitte Teppich (Kreis Ø 3.4, `theme.rug`, leicht erhöht 0.005).
  - Wand: Zylinder (innen sichtbar, `side: BackSide`) Radius `R + 0.45`, Höhe `3.3 * tiers + 0.6`, `material(theme.wall, { repeat: 4, tint: aufgehellte wood-Farbe })`.
  - Pilaster zwischen den 12 Plätzen: Kasten 0.28 × Höhe × 0.25 aus Holz (`walnut_veneer`, Tönung `theme.wood`), oben Gesims-Ring (Torus-artiger Profilring aus `LatheGeometry`).
  - Kuppel: Halbkugel (`SphereGeometry(R + 0.45, 64, 24, 0, 2π, 0, π/2)`, innen) mit `theme.dome`, Kassetten als Normal-Map-Wiederholung; oben Öffnung Ø 2.2 (Oberlicht), darüber ein emissiver Kreis in `theme.sky`.
  - Galerie für `tiers > 1`: Ringboden je Ebene auf `3.3 * t`, Breite 1.2, Messing-Geländer (Zylinder-Stäbe alle 0.18 m + Handlauf-Torus) aus `MeshStandardMaterial({ color: theme.brass, metalness: 1, roughness: 0.35 })`.
  - Freie Plätze (Index ≥ Regalanzahl auf Ebene 0): Bogenfenster (Box-Rahmen + Plane mit emissivem `theme.sky`, Sprossen), davor auf Sockel abwechselnd `theme.props[0..]`.
  - `caseSlots`: Position auf Radius `R` bei `angle` (0° = −Z, im Uhrzeigersinn), `facing` zur Mitte; Ebene `t` auf Höhe `3.3 * t`.
  - Mitte: `round_wooden_table_01` (skaliert auf Ø 1.4), darauf `vintage_oil_lamp` und `decorative_book_set_01`, daneben `ArmChair_01` (Blick zum Startregal abgewandt), etwas seitlich `vintage_grandfather_clock_01` an einer freien Wand oder neben Pilaster 6.

- [ ] **Step 5: `scene.js`** (Kern; Task 5–7 hängen sich über `onFrame`/Module ein)

```js
import * as THREE from "../../lib/three/three.module.min.js";
import { chooseQuality, watchFps } from "./quality.js";
import { readTheme } from "./theme.js";
import { createAssets } from "./assets.js";
import { buildRotunda } from "./rotunda.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The room: renderer, camera, a render loop that only runs while something
// changes (the candles keep a throttled 20 fps; nothing with reduced
// motion), resizing and visibility.
export async function createScene(container, dotNet, data) {
    const stage = container.querySelector(".library-room-stage");
    let quality = null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    quality = chooseQuality(renderer);
    renderer.setPixelRatio(quality.pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = quality.shadowLights > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 80);
    const frameHooks = new Set();
    const listeners = [];
    const room = {
        container, stage, dotNet, data, renderer, scene, camera, quality,
        theme: readTheme(), assets: createAssets(renderer), visible: true, disposed: false,
        raf: 0, timer: 0, busyUntil: 0,
        onFrame: (fn) => { frameHooks.add(fn); return () => frameHooks.delete(fn); },
        // Something changed: render at full rate for `ms`.
        wake: (ms = 0) => { room.busyUntil = Math.max(room.busyUntil, performance.now() + ms); schedule(); },
        on: (target, type, fn, options) => { target.addEventListener(type, fn, options); listeners.push(() => target.removeEventListener(type, fn, options)); },
    };

    const env = await room.assets.environment(room.theme.hdri);
    scene.environment = env;
    scene.background = new THREE.Color(room.theme.wood).multiplyScalar(0.15);
    room.architecture = await buildRotunda(room, data);
    scene.add(room.architecture.group);

    const resize = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        room.wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    listeners.push(() => ro.disconnect());
    resize();

    const io = new IntersectionObserver(([e]) => { room.visible = e.isIntersecting; if (room.visible) room.wake(); });
    io.observe(container);
    listeners.push(() => io.disconnect());
    room.on(document, "visibilitychange", () => { if (!document.hidden) room.wake(); });

    const themeObserver = new MutationObserver(() => room.retheme?.());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    listeners.push(() => themeObserver.disconnect());

    watchFps(room, (next) => { room.quality = next; renderer.setPixelRatio(next.pixelRatio); room.applyQuality?.(next); resize(); });

    let last = performance.now();
    function frame(now) {
        room.raf = 0;
        if (room.disposed || !room.visible || document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        let moving = false;
        for (const hook of frameHooks) moving = hook(now, dt) === true || moving;
        renderer.render(scene, camera);
        if (moving || now < room.busyUntil) room.raf = requestAnimationFrame(frame);
        else if (!reduceMotion()) { room.raf = -1; room.timer = setTimeout(() => { room.raf = requestAnimationFrame(frame); }, 50); }
    }
    function schedule() {
        if (room.raf === -1) { clearTimeout(room.timer); room.raf = 0; }
        if (!room.raf) { last = performance.now(); room.raf = requestAnimationFrame(frame); }
    }

    room.update = (next) => { room.data = next; room.rebuild?.(next); room.wake(); };
    room.dispose = () => {
        room.disposed = true;
        if (room.raf > 0) cancelAnimationFrame(room.raf);
        clearTimeout(room.timer);
        listeners.forEach((off) => off());
        scene.traverse((o) => { o.geometry?.dispose(); [].concat(o.material ?? []).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); }); });
        room.assets.dispose();
        renderer.dispose();
        renderer.domElement.remove();
    };
    // Filled in by Tasks 5–7.
    room.focusBook = room.pickBook = room.goTo = room.goHome = () => {};

    camera.position.set(0, 1.65, 0.8);
    camera.lookAt(0, 1.5, -5);
    room.wake(800);
    return room;
}
```

- [ ] **Step 6: Bauen und ansehen** — `cd frontend/LuminaChronica.Client && dotnet build`, Dev-Server neu starten, Playwright: Stil `library` in `localStorage("lumina_shelf_style")`, Bibliothek → Regal-Ansicht, Screenshot 1440×900. Erwartet: Rotunde mit Boden, Wand, Kuppel, Oberlicht, Fenster-Nischen, Tisch in der Mitte; Konsole ohne Fehler. Theme wechseln (Babylon, Alexandria) → Materialien wechseln (Screenshots).

- [ ] **Step 7: Commit**

```bash
git add frontend/LuminaChronica.Client/wwwroot/js/libraryRoom
git commit -m "feat(library-room): rotunda architecture, theme materials, quality levels"
```

---

### Task 5: Regale, Bücher, Hover-Kippen und Öffnen

**Files:**
- Create: `js/libraryRoom/shelf.js`, `js/libraryRoom/pick.js`
- Modify: `js/libraryRoom/scene.js` (Regale einhängen, `rebuild`, `focusBook`, `pickBook`)

**Interfaces:**
- Consumes: `architecture.caseSlots` (Task 4), Fälle aus `data.cases`.
- Produces:
  - `shelf.js`: `buildCase(room, caseData, slot) → { group, books: Mesh[], plaque, center: Vector3, normal: Vector3 }`; Buch-`userData = { id, title, author, recent, out, caseIndex, base }`.
  - `pick.js`: `attachPicking(room, cases)` setzt `room.pickBook(id)`, `room.hovered`; Tooltip `.library-room-tip`; ruft `dotNet.invokeMethodAsync("Open", id, l, t, w, h)`.

Regel für Bücher (aus `shelfRoom.js` übernehmen und auf die neuen Maße bringen): Geometrie `BoxGeometry(w/1000, h/1000, 0.18).translate(0, h/2000, -0.09)` → Drehpunkt Unterkante vorne; Kippen `rotation.x = out * 0.2` (≈ 11°), kein Anheben, kein Verschieben. Rücken-Textur per Canvas (Titel wie heute `spineCanvas`, Titelgröße an die Rückenlänge angepasst wie `TitleFit`), nur für Regale in der Nähe der Kamera (Abstand < 4 m), sonst Leder-Farbe. „Zuletzt gelesen“: Bücher lehnen mit dem Cover nach vorne (`tooledCover` aus `shelfRoom.js`), Fortschritt als dünner Messing-Balken unten auf dem Cover. Plakette mit Fachnamen oben am Regal (Canvas, Cinzel, Messing — wie `addPlaque` in `shelfRoom.js`), bei Fortsetzung „Fantasy (Fortsetzung)“. Regal-Korpus aus `walnut_veneer` getönt mit `theme.wood`, 5 Bretter, Rückwand dunkler, Kranz oben mit Messing-Leiste.

- [ ] **Step 1: `shelf.js` schreiben** (Korpus, Bretter, Plakette, Bücher wie oben; Funktionen `spineCanvas`, `tooledCover`, `plaqueCanvas` aus `wwwroot/js/shelfRoom.js` übernehmen und an mm/m anpassen).
- [ ] **Step 2: `pick.js` schreiben**

```js
import * as THREE from "../../lib/three/three.module.min.js";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hover tips a book out by its top (foot stays on the board) and names it;
// a click (or the second tap on touch) takes it out and opens it.
export function attachPicking(room, getBooks) {
    const ray = new THREE.Raycaster();
    const tip = room.container.querySelector(".library-room-tip");
    let pointer = null, armed = null;
    room.hovered = null;
    room.takenId = null;

    const ndc = (x, y) => {
        const r = room.renderer.domElement.getBoundingClientRect();
        return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    };
    const hit = (x, y) => {
        ray.setFromCamera(ndc(x, y), room.camera);
        return ray.intersectObjects(getBooks().filter((b) => b.visible), false)[0]?.object ?? null;
    };
    const showTip = (book) => {
        if (!book) { tip.classList.remove("is-shown"); return; }
        const box = new THREE.Box3().setFromObject(book);
        const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(room.camera);
        const r = room.renderer.domElement.getBoundingClientRect(), c = room.container.getBoundingClientRect();
        tip.querySelector("strong").textContent = book.userData.title;
        tip.querySelector("span").textContent = book.userData.author ?? "";
        tip.style.left = `${r.left - c.left + (top.x + 1) / 2 * r.width}px`;
        tip.style.top = `${r.top - c.top + (1 - top.y) / 2 * r.height - 8}px`;
        tip.classList.add("is-shown");
    };
    const setHovered = (book) => {
        if (book === room.hovered) return;
        room.hovered = book;
        room.container.style.cursor = book ? "pointer" : "";
        showTip(book);
        room.wake(600);
    };

    room.on(room.container, "pointermove", (e) => {
        if (e.pointerType !== "mouse" || room.dragging) return;
        pointer = { x: e.clientX, y: e.clientY };
        setHovered(hit(e.clientX, e.clientY));
    });
    room.on(room.container, "pointerleave", () => { pointer = null; setHovered(null); });
    room.on(room.container, "click", (e) => {
        if (room.dragged || e.target.closest(".library-room-ui, .library-room-index")) return;
        const book = hit(e.clientX, e.clientY);
        if (!book) return;
        // touch: first tap shows it, the second opens it
        if (e.pointerType === "touch" && armed !== book) { armed = book; setHovered(book); return; }
        room.pickBook(book.userData.id);
    });

    room.pickBook = (id) => {
        const book = getBooks().find((b) => b.userData.id === id);
        if (!book) return;
        const box = new THREE.Box3().setFromObject(book);
        const r = room.renderer.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(), xs = [], ys = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            v.set(x, y, z).project(room.camera);
            xs.push(r.left + (v.x + 1) / 2 * r.width);
            ys.push(r.top + (1 - v.y) / 2 * r.height);
        }
        const left = Math.min(...xs), top = Math.min(...ys);
        room.takenId = id;
        setHovered(null);
        room.wake(300);
        room.dotNet.invokeMethodAsync("Open", id, left, top, Math.max(...xs) - left, Math.max(...ys) - top);
    };

    // The taken book comes back when the spread closes.
    const spreadObserver = new MutationObserver(() => {
        if (room.takenId !== null && !document.querySelector(".book-spread")) { room.takenId = null; room.wake(300); }
    });
    spreadObserver.observe(document.body, { childList: true, subtree: true });
    room.on(window, "pagehide", () => spreadObserver.disconnect());

    room.onFrame((now, dt) => {
        let moving = false;
        for (const book of getBooks()) {
            const u = book.userData;
            book.visible = u.id !== room.takenId;
            const target = book === room.hovered || u.id === room.focusedId ? 1 : 0;
            if (Math.abs(target - u.out) < 0.002) u.out = target;
            else { u.out += (target - u.out) * (reduceMotion() ? 1 : Math.min(1, dt * 10)); moving = true; }
            book.rotation.x = u.recent ? u.lean * (1 - u.out) : u.out * 0.2;
        }
        if (room.hovered && moving) showTip(room.hovered);
        return moving;
    });
}
```

- [ ] **Step 3: In `scene.js` einhängen** — nach `buildRotunda`: für jeden Fall `buildCase(room, c, architecture.caseSlots[c.index])` hinzufügen, `room.cases = […]`, `attachPicking(room, () => room.cases.flatMap((c) => c.books))`; `room.rebuild = (data) => { alte Regale entfernen/dispose, neu bauen }`; `room.focusBook = (id) => { room.focusedId = id; room.goTo(caseOf(id)); }` (goTo kommt in Task 6, bis dahin nur `focusedId`).
- [ ] **Step 4: Prüfen (gemessen)** — Playwright 1440×900: Kamera fest auf das Startregal; ein Buch hovern; den projizierten Fußpunkt (`(x, base.y, base.z)` mit `.project(camera)`) vor/nach dem Hover vergleichen → Abweichung ≤ 1 px; Oberkante kommt näher (z wächst). Klick → `.book-spread` vorhanden; Esc → weg, Buch wieder sichtbar.
- [ ] **Step 5: Commit** `git add frontend/LuminaChronica.Client/wwwroot/js/libraryRoom && git commit -m "feat(library-room): bookcases, books, tip-out and opening"`

---

### Task 6: Geführte Kamera

**Files:**
- Create: `js/libraryRoom/camera.js`
- Modify: `js/libraryRoom/scene.js` (Kamera anhängen)

**Interfaces:**
- Consumes: `room.cases[i].center/normal`, `architecture.floorY(tier)`.
- Produces: `attachCamera(room)` setzt `room.goTo(i)`, `room.goHome()`, `room.dragging`, `room.dragged`; meldet `dotNet.invokeMethodAsync("CaseChanged", i | -1)`.

Verhalten:
- **Mitte** (Start): Position `(0, 1.65 + floorY(0), 0.6)`, Blick auf Regal 0 auf Augenhöhe. Ziehen dreht **frei um die Hochachse** (360°) und begrenzt nach oben/unten (−20° … +35°, damit man die Kuppel sieht). Mausrad in der Mitte: nichts (Seite scrollt).
- **Vor einem Regal**: Ziel = `center + normal * 2.0`, Höhe `floorY(tier) + 1.55`, Blick auf `center + (0, 1.25, 0)`. Fahrt 1.0 s, `easeInOutCubic`, entlang eines Bogens um die Mitte (Zwischenpunkt auf Radius 2.5), damit man nicht durch den Tisch fährt. Galerie-Regale: Kamera auf der Galerie (`floorY(1) + 1.55`).
- Dort: Ziehen dreht ±25° waagrecht / ±12° senkrecht um den Blickpunkt; Mausrad/Pinch ändert den Abstand 1.2 … 2.6 m (`preventDefault` nur in diesem Zustand); Klick auf ein anderes Regal im Bild → `goTo(dessen Index)`.
- `goHome()` und Esc (wenn kein `.book-spread` offen ist) fahren zurück.
- `prefers-reduced-motion`: Sprung statt Fahrt.
- Ziehen setzt `room.dragging` (während) und `room.dragged` (bis zum nächsten Klick-Ereignis, > 4 px Bewegung), damit Ziehen nicht als Klick zählt.
- Tastatur: im Raum (`tabindex=0` auf `.library-room`) ← → = vorheriges/nächstes Regal, Esc = Mitte.

- [ ] **Step 1: `camera.js` schreiben** (Zustände `home`/`case`, Animation per `room.onFrame`, `CaseChanged` nach Ankunft).
- [ ] **Step 2: Regal-Klick** — in `pick.js` zusätzlich: Klick ohne Buch-Treffer auf ein Regal (`intersectObjects(room.cases.map(c => c.group), true)`) → `room.goTo(index)`.
- [ ] **Step 3: `focusBook`** → `goTo(Regal des Buchs)` + `focusedId`.
- [ ] **Step 4: Prüfen** — Playwright: Fach-Knopf klicken → nach ~1.2 s `aria-pressed=true` auf dem Knopf, Screenshot zeigt das Regal formatfüllend; Ziehen ändert die Ansicht, löst kein Öffnen aus; Mausrad außerhalb eines Regalbesuchs scrollt die Seite (`scrollY` ändert sich); „Zurück zur Mitte“ erscheint und funktioniert; 390×844 dasselbe mit Touch-Emulation.
- [ ] **Step 5: Commit** `git commit -m "feat(library-room): guided camera between centre and cases"` (nur `js/libraryRoom/*`).

---

### Task 7: Licht und Deko — dann Zwischenstand für den User

**Files:**
- Create: `js/libraryRoom/lighting.js`
- Modify: `js/libraryRoom/rotunda.js` (Leuchter-Plätze), `scene.js` (`retheme`, `applyQuality`)

**Interfaces:**
- Consumes: `room.quality`, `room.theme`, `architecture`, `room.cases`, Kamera-Zustand.
- Produces: `attachLighting(room)` → `room.applyQuality(q)`, `room.retheme()` (baut Materialien/Licht/Deko des neuen Themes, alte entsorgt).

Licht:
- **Oberlicht:** `SpotLight` von oben durch die Öffnung (Farbe `theme.sky`, Stärke `theme.skyIntensity`, Kegel 18°, weich), wirft Schatten (wenn `shadowLights ≥ 1`); sichtbarer Lichtstrahl als Kegel-Mesh mit additivem, nach unten auslaufendem Verlauf (`ShaderMaterial`, Deckkraft 0.08) und langsam treibenden Staubpartikeln (`Points`, 300 Stück, nur bei `high`/`medium`, nicht bei reduzierter Bewegung).
- **Lesetisch:** `PointLight` in der Öllampe (warm 0xffb46b, Reichweite 4 m), Schatten bei `shadowLights ≥ 2`.
- **Leuchter:** `brass_candleholders` auf Konsolen an jedem 2. Pilaster in 2.6 m Höhe, je ein `PointLight` (warm, Reichweite 3.5 m, ohne Schatten), Flackern über `onFrame` mit gedrosselter Rate (sin-Summen wie heute in `shelfRoom.js`), bei reduzierter Bewegung ruhig. Nur die 4 der Kamera nächsten Leuchter-Lichter sind aktiv (`intensity = 0` sonst), damit die Lichtanzahl begrenzt bleibt.
- **„Licht kommt mit“:** ein schwaches warmes `PointLight` folgt der Kamera (0.6 m vor ihr, Stärke 0.4); vor einem Regal steigt es auf 1.0.
- **Umgebung:** `scene.environment` = HDRI (Task 4), `environmentIntensity`-Ersatz: Materialien `envMapIntensity = 0.35`.
- **Qualität:** `low` → keine Schatten, kein Staub, Strahl ohne Partikel, PixelRatio 1; `medium` → nur Oberlicht-Schatten 1024; `high` → Oberlicht 2048 + Lampe.

Deko (aus `theme.props`, nur im Raum, nie auf Regalbrettern): an den Fenster-Nischen (Task 4) und neben dem Lesetisch; Großvateruhr an einem Pilaster.

- [ ] **Step 1: `lighting.js` schreiben, einhängen, `retheme`/`applyQuality` füllen.**
- [ ] **Step 2: Bildreihe** — Playwright 1440×900, Mitte-Ansicht und ein Regalbesuch, für alle 11 Themes (Screenshots in den Scratchpad); 390×844 für 3 Themes. Konsole fehlerfrei.
- [ ] **Step 3: Bildrate messen** — in der Seite: 3 s `requestAnimationFrame` zählen während einer Kamerafahrt, je Qualitätsstufe (über `room.applyQuality(settings("high"|"medium"|"low"))` erzwungen). Ziel: `high` ≥ 50 fps auf dem Entwicklungsrechner, `low` ≥ 30 fps mit CPU-Drosselung ×4 (CDP `Emulation.setCPUThrottlingRate`).
- [ ] **Step 4: Commit** `git commit -m "feat(library-room): skylight, candles, lamp and theme decor"`.
- [ ] **Step 5: Zwischenstand** — `dotnet build`, Dev-Server neu, dem User schreiben (Deutsch): lokal unter http://localhost:5289, Einstellungen → Bibliothek → Regal-Stil → „3D-Bibliothek“; was zu sehen ist, was noch fehlt (Feinschliff), und um Feedback bitten. **Auf Antwort warten**, Rückmeldungen einarbeiten (eigene Commits), erst dann Task 8.

---

### Task 8: Feinschliff nach dem Feedback, Barrierefreiheit, Handy

**Files:**
- Modify: Module in `js/libraryRoom/`, `library-room.css`, `LibraryRoom.razor(.cs)` nach Bedarf

- [ ] **Step 1:** User-Feedback aus Task 7 umsetzen (je Punkt ein Commit).
- [ ] **Step 2: Tastatur/Screenreader** — Tab in die Bücherliste: Fokus fährt zum Regal und hebt das Buch hervor (`focusedId`), Enter öffnet; Fach-Knöpfe per Tab erreichbar; `.library-room` hat `tabindex="0"` und ←/→/Esc (Task 6); Tests in `LibraryRoomTests` decken Liste und Knöpfe ab (bestehen schon).
- [ ] **Step 3: Handy** — 390×844: Fach-Leiste scrollt waagrecht, „Zurück zur Mitte“ sichtbar, Wischen = Umsehen, erstes Tippen zeigt Titel, zweites öffnet; kein horizontales Scrollen der Seite (`document.documentElement.scrollWidth ≤ 390`).
- [ ] **Step 4: Fehlerfälle** — Asset-Ordner testweise umbenennen → Raum lädt mit Farb-Materialien, eine Warnung; Theme wechseln während des Ladens → kein Fehler; leere Bibliothek → leerer Raum, Leer-Hinweis der Seite bleibt.
- [ ] **Step 5: Commit** je Punkt.

---

### Task 9: Alte Stile entfernen, Doku, PR

**Files:**
- Delete: `Components/ShelfRoom/*`, `Components/RotundaShelf/*`, `Models/RotundaLayout.cs` (falls dort), `wwwroot/js/shelfRoom.js`, `wwwroot/js/rotunda.js`, `wwwroot/Styles/shelf-room.css`, `wwwroot/Styles/shelf-rotunda.css` (+ ihre `<link>` in `index.html`), `tests/frontend/ShelfRoomTests.cs`, `RotundaShelfTests.cs`, `RotundaLayoutTests.cs`
- Modify: i18n (Schlüssel `shelfRoom.*`, `rotunda.*`, `settings.shelfStyle.room*`, `settings.shelfStyle.rotunda*` entfernen — vorher `grep -rn` auf Verwendungen), `FakeI18nService.cs`, `CHANGELOG.md`, `documentation/Roadmap.md`, Spec-Status, Memory `project_lumina_bookshelf_styles.md`

- [ ] **Step 1: Entfernen** — `git rm` der Dateien; `grep -rn "ShelfRoom\|RotundaShelf\|rotunda\.\|shelfRoom\." frontend tests --include=*.cs --include=*.razor --include=*.json --include=*.html` → keine Treffer außer Kommentaren in der Historie-Doku.
- [ ] **Step 2: Tests** — `cd tests/frontend && dotnet test` → alle grün.
- [ ] **Step 3: Gesamtprüfung (gemessen)** — Playwright, kleines und großes Konto, 1440 und 390: Raum lädt, Fach-Fahrt, Kipp-Fußpunkt ≤ 1 px, Öffnen/Schließen, Bildrate (Task 7 Step 3), alle 11 Themes Bildreihe, Konsole fehlerfrei; Stil-Auswahl in den Einstellungen zeigt vier Stile; ein Browser mit gespeichertem `rotunda`/`room` landet in der 3D-Bibliothek.
- [ ] **Step 4: Doku** — CHANGELOG (Unreleased/Added: „3D-Bibliothek …“; Removed: „3D-Raum“ und „Rotunde“ gehen in der 3D-Bibliothek auf), Roadmap-Abschnitt „Planned: 3D-Bibliothek“ → „3D-Bibliothek Stufe 1 (#…)“ mit Prüfergebnissen und Lektionen, Spec §7 Stufe 1 als umgesetzt markieren, Memory aktualisieren.
- [ ] **Step 5: PR** — `git show --stat` prüfen, `git -c http.sslBackend=schannel push -u origin feat/library-room`, `gh pr create` (Deutsch, mit Prüfergebnissen), `gh pr checks --watch`, `gh pr merge --squash`, Deploy abwarten (`gh run watch`), lokal `dotnet build` + Server neu.
- [ ] **Step 6: Bericht an den User** (Deutsch): was live ist, was gemessen wurde, was in Stufe 2/3 kommt.
