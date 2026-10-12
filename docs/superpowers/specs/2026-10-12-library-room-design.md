# 3D-Bibliothek — begehbarer Bibliotheksraum

**Datum:** 2026-10-12
**Anlass:** User-Feedback nach v4.1.0-beta.1: der „3D-Raum“ ist nur eine 3D-Kopie von „Klassisch“, die „Rotunde“ wirkt flach („2D-Pfusch“, keine Tiefe). Gewünscht: ein immersiver High-End-Raum mit mehreren Regalen, in dem man sich bewegt, und dynamischem Licht.
**Ersetzt:** die Stile „3D-Raum“ (`ShelfRoom`) und „Rotunde“ (`RotundaShelf`) aus `2026-10-11-bookshelf-rework-design.md` §6/§7 und `2026-10-12-bookshelf-polish-design.md`.

## 1. Entscheidungen (mit dem User, 2026-10-12)

| Frage | Entscheidung |
|---|---|
| Bewegung | **Geführt**: Klick auf ein Regal (oder ein Fach in der Liste) → die Kamera fährt hin; dort leicht umsehen. Kein freies Laufen. |
| Bestehende Stile | **Ein** neuer Stil „3D-Bibliothek“ ersetzt „3D-Raum“ und „Rotunde“. Danach: Klassisch, Lederrücken, 3D-Bibliothek, Legacy. |
| Raum | Wächst mit der Bibliothek: **Lesezimmer** (klein) → **Rotunde** (mittel) → **Saal** (sehr groß). |
| Bauweise | **In Stufen**: 1 = Grundlage + Rotunde (gilt anfangs für alle Größen), 2 = Lesezimmer, 3 = Saal. Jede Stufe für sich fertig und live. |
| Themes | Das Theme **färbt** den Raum: gleiche Architektur, Materialien, Lichtfarbe und Deko aus dem Theme. |
| Buch anklicken | Erst wie in den anderen Stilen (3D herausziehen → bestehendes `BookSpread`), später als Feinschliff ein echtes 3D-Buch im Raum. |
| Handy / schwache Geräte | Überall der volle Raum mit **automatischer Qualitätsstufe**; ohne WebGL steht Klassisch da. Später evtl. ein Qualitäts-Schalter in den Einstellungen. |

## 2. Ansatz

Der Raum wird in three.js (r160, vendored unter `wwwroot/lib/three`) **aus Bausteinen per Code** gebaut — Wände, Boden, Kuppel, Regale passen sich der Anzahl der Fächer an. Möbel und Deko sind **echte 3D-Modelle** (CC0, Poly Haven, glTF/GLB), Oberflächen echte PBR-Materialien (CC0-Texturen), Reflexionen und weiches Umgebungslicht aus einer CC0-HDRI. Licht und Schatten in Echtzeit.

Verworfen: ein fertig modellierter Raum mit eingebackenem Licht (wächst nicht mit, pro Theme ein eigener Raum, Licht nicht dynamisch); eine andere Engine (three.js ist schon da, kein Gewinn).

## 3. Bausteine (Stufe 1)

### 3.1 Blazor

- **`Components/LibraryRoom/LibraryRoom.razor(.cs)`** ersetzt `ShelfRoom` und `RotundaShelf` in `Library.razor`.
  - Parameter wie die anderen Stile: `Sections`, `OnOpen` (`EventCallback<BookOpenRequest>`).
  - Gibt der Szene Fächer und Bücher (Id, Titel, Autor, Farbe, Breite/Höhe aus `ShelfLineLayout.SizeFor`, Fortschritt).
  - Rendert: die Bühne (Canvas), eine **Fach-Liste** (Knöpfe, sichtbar, wie die Rotunde heute), einen **„Zurück zur Mitte“**-Knopf, einen Ladezustand und eine unsichtbare **Bücherliste** (Links) für Tastatur und Screenreader — Fokus auf einen Link fährt die Kamera zu dessen Regal, Enter öffnet das Buch.
  - `[JSInvokable] Open(id, rect)` → `OnOpen` mit `BookSpreadSource(null, rect)`; `[JSInvokable] Ready()` / `Failed()` für Ladezustand und Ersatz.
  - Ohne WebGL oder wenn die Szene nicht startet: `ClassicShelf` mit Hinweis (wie heute in `ShelfRoom`).
- **`ShelfStyles`**: neuer Wert `library` („3D-Bibliothek“); `room` und `rotunda` werden beim Lesen auf `library` abgebildet (`Normalize`), damit niemand auf einem verschwundenen Stil landet. Einstellungen zeigen Klassisch, Lederrücken, 3D-Bibliothek, Legacy.
- `ShelfRoom`, `RotundaShelf`, `RotundaLayout`, `shelfRoom.js`, `rotunda.js`, `shelf-room.css`, `shelf-rotunda.css` und ihre Tests/i18n-Schlüssel werden entfernt, sobald `LibraryRoom` live ist (gleicher PR).

### 3.2 JavaScript (`wwwroot/js/libraryRoom/`)

Kleine Module mit je einer Aufgabe statt einer großen Datei:

| Modul | Aufgabe |
|---|---|
| `index.js` | `supported()`, `init(container, dotNet, data)`, `update`, `focusBook`, `pickBook`, `goTo(sectionIndex)`, `goHome()`, `dispose` — die Schnittstelle zu Blazor |
| `scene.js` | Renderer, Tonemapping, Bildschleife (läuft nur bei Bewegung; Kerzen mit gedrosselter Rate; nichts bei „Bewegung reduzieren“), Größe, Sichtbarkeit |
| `quality.js` | misst beim Start (Gerät, GPU-Stufe, erste Frames) und wählt **hoch / mittel / sparsam** (Schattenauflösung, Anzahl Schattenlichter, Pixel-Ratio, Anti-Aliasing); senkt die Stufe, wenn die Bildrate dauerhaft unter ~40 fps fällt |
| `layout.js` | reine Logik: aus den Fächern die Regale (ein Fach pro Regal, lange Fächer über mehrere Regale), deren Plätze im Grundriss und die Kamerapositionen. Ohne three.js testbar. |
| `rotunda.js` | Grundriss Rotunde: Ring aus Regalen um die Mitte, Kuppel mit Oberlicht, Boden, Lesetisch in der Mitte; ab ca. 12 Regalen eine **Galerie** (2. Ring auf einer Empore mit Geländer) |
| `shelf.js` | ein Regal: Korpus, Bretter, Plakette mit Fachnamen, Bücher (Rücken-Textur mit Titel wie heute, nur für Regale in der Nähe — Speicher), Kippen oben heraus (Drehpunkt Unterkante vorne, Fuß bleibt) |
| `camera.js` | Startblick aus der Mitte auf „Zuletzt gelesen“; `goTo` fährt in ~1 s (ease) vor ein Regal; dort Umsehen per Ziehen/Wischen (begrenzt auf ±25° / ±12°) und Annähern per Mausrad/Pinch (begrenzt); `goHome` zurück; bei reduzierter Bewegung springt sie |
| `lighting.js` | Oberlicht-Strahl (Tag/Mond je Theme, mit Staub im Licht), Lesetisch-Lampe, Leuchter an den Regalen mit flackernden Kerzen; das Regal, vor dem man steht, wird etwas heller („man kommt mit dem Licht näher“); Schatten nach Qualitätsstufe |
| `theme.js` | pro Theme: Materialien (Holz, Wand, Boden, Kuppel, Messing), Lichtfarben, HDRI, Deko-Liste; liest wie heute die `--shelf-*`-Tokens als Grundfarben und reagiert auf Theme-Wechsel |
| `assets.js` | lädt GLB-Modelle, Texturen (KTX2/Basis oder WebP) und HDRI nach, mit Cache und Ersatz bei Fehlern |
| `pick.js` | Raycast für Hover/Klick, Titel-Hinweis über dem Buch, Bildschirm-Rechteck für `BookSpread` |

### 3.3 Assets

- Ablage: `wwwroot/assets/library-room/` (Modelle, Texturen, HDRI) mit `CREDITS.md` (Quelle, Autor:innen, Lizenz CC0).
- Kandidaten (vor Gebrauch auf Poly Haven prüfen): Lesetisch, Leselampe, Kerzenleuchter, Sessel, Globus, Teppich, Bücherstapel, Pult; Texturen für Holzboden, Putz/Stuck, Marmor, glasierte Ziegel (Babylon), Holz der Regale; eine Innenraum-HDRI.
- Budget: insgesamt **≤ 15 MB**, pro Theme nur das, was es nutzt; geladen erst, wenn der Stil gewählt und sichtbar ist. Texturen 1K (2K nur für Boden/Regale bei „hoch“).
- Komprimierung im bestehenden Werkzeugweg (`tools/render-decor` wird um ein Pack-Skript erweitert).

## 4. Verhalten

- **Betreten:** Ladezustand (ruhig, im Theme), dann blendet der Raum ein; Kamera in der Mitte, leicht erhöht, Blick auf „Zuletzt gelesen“.
- **Zu einem Regal:** Klick aufs Regal oder auf ein Fach in der Liste → Kamerafahrt; die Liste markiert das Fach. „Zurück zur Mitte“ (Knopf, Esc) fährt zurück.
- **Bücher:** Hover zeigt Titel/Autor über dem Buch und kippt es oben heraus; Klick zieht es heraus → `BookSpread` öffnet es; Schließen stellt es zurück (3D-Buch ist solange verborgen).
- **Seiten-Scroll:** der Raum hat eine feste Höhe im Inhalt (wie die Rotunde heute, ca. 70 vh, min. 480 px); das Mausrad zoomt nur, wenn der Zeiger im Raum ist **und** man vor einem Regal steht — sonst scrollt die Seite normal.
- **Handy:** Wischen = Umsehen, Tippen = Hover+Öffnen in zwei Schritten (erstes Tippen hebt hervor, zweites öffnet), Fach-Liste als waagrecht scrollbare Leiste.

## 5. Fehlerfälle

- Kein WebGL / Szene startet nicht → Klassisch mit Hinweis.
- Ein Asset lädt nicht → einfacher Ersatz (z. B. Deko fehlt, Material als Farbe), kein Absturz; Konsole meldet es einmal.
- Theme-Wechsel während des Ladens → neue Theme-Assets, alte verworfen.
- Bibliothek leer → Raum mit leeren Regalen und dem gewohnten Leer-Hinweis der Bibliothek.
- Zu schwaches Gerät (sparsam reicht nicht, < 20 fps) → Hinweis „Für dein Gerät ist das klassische Regal flüssiger“ mit Knopf zum Wechseln.

## 6. Tests und Prüfung

- **bUnit** (`LibraryRoomTests`): Bücherliste vollständig, Fokus → `focusBook`, Enter/Klick → `pickBook`, `Open` → `OnOpen` mit Rechteck, Ersatz ohne WebGL, `ShelfStyles.Normalize` bildet `room`/`rotunda` auf `library` ab.
- **Logik** (`layout.js` per Node-Test im bestehenden Vitest-Setup oder als C#-Spiegel): Anzahl Regale, Galerie ab der Schwelle, lange Fächer über mehrere Regale, Plätze ohne Überlappung.
- **Browser (gemessen, nicht nur angesehen):** 1440 und 390 px, kleines und großes Testkonto, alle 11 Themes als Bildreihe; Kippen: Fuß-Punkt projiziert vorher/nachher gleich; Plaketten nicht über Büchern; Bildrate je Qualitätsstufe; `BookSpread` öffnen/schließen. Nach jeder JS-Änderung `dotnet build` (Integritäts-Hash).
- **Zwischenstand für den User** vor dem Feinschliff: Rotunde mit Licht und Materialien, ohne Deko-Feinheiten — wirkt der Raum dort nicht, wird früh korrigiert.

## 7. Stufen

1. **Grundlage + Rotunde** (dieses Dokument im Detail): `LibraryRoom`, Module, Assets für alle Themes, Ersetzen von 3D-Raum und Rotunde. Anfangs für alle Bibliotheksgrößen die Rotunde.
2. **Lesezimmer** für kleine Bibliotheken (bis ca. 3 Regale): Kamin, Sessel, Teppich, Regale an drei Wänden. Eigener Grundriss in `readingRoom.js`, Auswahl in `layout.js`.
3. **Saal** für sehr große Bibliotheken (über ca. 12–24 Regale, Schwelle nach Stufe 1 festlegen): Mittelgang, Nischen, hohe Fenster mit Lichtstrahlen, Pult am Ende. `hall.js`.

Später (notiert, nicht Teil der Stufen): echtes 3D-Buch, das sich im Raum aufschlägt; Qualitäts-Schalter in den Einstellungen (Automatisch / Hoch / Sparsam).
