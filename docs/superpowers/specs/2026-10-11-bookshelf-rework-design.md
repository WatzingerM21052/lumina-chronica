# Bücherregal-Rework: vier Regal-Stile — Design

**Datum:** 2026-10-11
**Status:** Entwurf, wartet auf Freigabe
**Vorschau:** `.superpowers/brainstorm/…/regal-vorschau-abcd.html` (lokal, nicht im Repo)

## 1. Ziel

Die Regal-Ansicht der Bibliothek (`/library`, Ansichtsschalter „Regal“) bekommt vier
neue Stile plus das bisherige Regal als „Legacy“. A ist der Standard, B–D und Legacy wählt man
in den Einstellungen. Alle vier
sollen auf jedem Theme, am Desktop und am Handy (390 px) fehlerfrei und hochwertig
aussehen, mit echten, freien Assets als Deko.

| Stil | Name in der UI | Technik | Kern |
|---|---|---|---|
| A | Klassisch (Standard) | CSS-3D, baut auf `ShelfRow`/`ShelfBook` auf | Holzschrank, Messingschilder, Buch dreht beim Hover das Cover nach vorne |
| B | Lederrücken | flaches DOM, fotorealistische Rücken | Bünde, Goldlinien, Titelschild, Schimmer, schwebende Cover-Karte |
| C | 3D-Raum | three.js (WebGL) | echtes Licht und Schatten, Kamera folgt der Maus, Buch kommt beim Klick nach vorne |
| D | Rotunde | CSS-3D-Ring | runde Lesehalle, drehen, Laterne am Zeiger, Buch öffnet sich als Doppelseite |
| – | Legacy | heutiges Regal | unverändert: heutige Optik **und** heutige Gruppierung (Woche/Monat, Anfangsbuchstabe, Genre je nach Sortierung) |

Nicht Teil davon: Rasteransicht, Alexandrias Schriftrollen-Ansicht, Bibel, Home-Seite.

## 2. Regalinhalt (für A–D gleich; Legacy behält seine Gruppierung)

- **Oberstes Fach „Zuletzt gelesen“:** die Bücher aus `GET /api/dashboard` →
  `continueReading` (schon vorhanden, mit Prozent). Nur, wenn es welche gibt.
- **Danach ein Fach pro Genre**, alphabetisch; Bücher ohne Genre in „Ohne Genre“ ganz
  unten. Ein Buch aus „Zuletzt gelesen“ steht zusätzlich auch in seinem Genre.
- **Die Sortierung der Werkzeugleiste ordnet innerhalb der Fächer**
  (zuletzt hinzugefügt / Titel / Autor / Genre ≙ Titel). Bisher bestimmte die Sortierung
  die Gruppierung (Woche/Monat, Anfangsbuchstabe) — das entfällt in der Regal-Ansicht.
  Die Rasteransicht bleibt unverändert.
- Filter (Genre, Tag, Suche) wirken wie heute; „Zuletzt gelesen“ wird mitgefiltert.
- Leere Fächer gibt es nicht. Ein Genre-Filter → nur dieses Fach.
- Umsetzung: neue reine Funktion `LibraryShelfGrouping.GroupForShelf(books, recent, sort, labels)`
  mit eigenen Unit-Tests; `Group(...)` bleibt für alte Aufrufer.

Gemeinsames Datenmodell für alle Stile: `ShelfSection(Label, Kind: Recent|Genre|NoGenre, Books, Progress?)`.
Ein Stil bekommt nur diese Liste und rendert sie, er kennt weder API noch Filter.

## 3. Stil-Auswahl

- Einstellungen → Karte „Darstellung“ → neue Zeile **„Regal-Stil“** mit vier kleinen
  Vorschaukacheln (statische Bilder je Stil, wie die Theme-Vorschauen).
- Gespeichert in `localStorage` über `libraryPreferences.js` (`lumina_shelf_style`:
  `classic|leather|room|rotunda|legacy`), Standard `classic`. Kein Backend.
- Die bestehenden Regal-Optionen bleiben: Buchgröße (Zoom) gilt für A und B; C und D
  zoomen über ihre Kamera und blenden den Zoom-Schalter aus. Der Cover-Text-Schalter
  gilt für A und B.
- **Rückfall:** kein WebGL → C fällt auf A zurück, mit einem kurzen Hinweis-Toast einmal
  pro Sitzung. `prefers-reduced-motion` → keine Flacker-, Schimmer- und Drehanimationen,
  Übergänge sofort; alle Stile bleiben bedienbar.

## 4. Theme-Anpassung

Jedes Theme liefert einen Satz Regal-Tokens (in der jeweiligen Theme-CSS, Standard in
`tokens.css`):

```
--shelf-wood-image   Holztextur (url)       --shelf-wood-tint   Färbung über der Textur
--shelf-back-image   Rückwand (url)         --shelf-brass       Metallfarbe (Schilder, Linien)
--shelf-light        Farbe des Lichts        --shelf-ambient     Grundhelligkeit 0–1
--shelf-decor-left / --shelf-decor-right   Deko-Bild (url) oder none
```

C liest dieselben Tokens per `getComputedStyle` (Farben → Licht/Material, Bild-URLs → Texturen),
D nutzt `--shelf-light` für die Laterne. Ein Theme-Wechsel zur Laufzeit wird übernommen
(C hört auf das bestehende Theme-Event und tauscht Materialien, ohne neu zu bauen).

Zuordnung (11 Themes; Holz/Deko vorläufig, wird mit den Assets in Phase 3 festgelegt):

| Theme | Holz / Metall | Deko links · rechts |
|---|---|---|
| classic-library | Nussbaum · Messing | Globus · Kerzenleuchter |
| dark-library | dunkle Eiche · Altmessing | Sanduhr · Öllampe |
| skriptorium | helle Eiche · Bronze | Tintenfass mit Feder · Kerze |
| alexandria | Zeder · Gold | Schriftrollen-Köcher · Öllampe |
| babylon | dunkles Holz · Lapis/Gold | Tonkrug · Öllampe |
| ischtar | Ebenholz · Gold | Keramikvase · Räuchergefäß |
| abendhafen | Treibholz · Messing | Kompass · Schiffslaterne |
| daemmergarten / nachtgarten | Walnuss · Kupfer | Topfpflanze · Laterne |
| modern-light / system | helle Esche · Edelstahl | Topfpflanze · Vase |

Deko-Regeln: höchstens zwei Objekte, nur am Schrankrand bzw. (D) in leeren Nischen, nie
zwischen Büchern; `pointer-events: none`, `aria-hidden`; am Handy nur eins.

## 5. Assets

- **Quelle:** bevorzugt Poly Haven (CC0): Holz-/Ledertexturen und 3D-Modelle (glTF).
  Ausweichquellen nur CC0/Public Domain. Jedes Asset in `CREDITS.md` mit Quelle und Lizenz.
- **Deko für A/B/D:** die glTF-Modelle werden einmalig mit einem kleinen three.js-Skript
  (Playwright, transparenter Hintergrund, einheitliches warmes Licht von links oben) als
  WebP gerendert (2×, ~300 px hoch). So wirken alle Deko-Objekte gleich beleuchtet und
  haben keine falschen Transparenz-Karos. Skript liegt unter `tools/render-decor/`.
- **Deko für C:** dieselben glTF-Modelle direkt in der Szene (Draco-komprimiert, je < 400 KB).
- **Budget:** Texturen als WebP ≤ 200 KB je Stück; three.js + Szene nur bei Stil C nachladen
  (`import()`), vendored unter `wwwroot/lib/three/` wie gsap/pdfjs.

## 6. Die Stile im Detail

Gemeinsam: Jedes Buch ist ein echter `<a href="library/books/{id}">` mit `aria-label`
(Titel, Autor) — in C und D als unsichtbare, fokussierbare Liste, deren Fokus das Buch in der
Szene hervorhebt. Enter/Klick führt zur Detailseite bzw. öffnet die Detail-Ebene. Cover
kommen aus `ShelfBook`s bestehender Logik (Blob-URL + `CoverColorService`-Farbe); ohne
Cover wird ein Einband aus Farbe + Titel gezeichnet. Fortschritt in „Zuletzt gelesen“ als
dünne Linie am Rücken.

**A · Klassisch.** Neue Komponente `ClassicShelf`, abgeleitet vom bestehenden Regal
(`shelf-physics.js` wird für Hover/Touch mitbenutzt). Das bestehende `ShelfRow`/`ShelfBook`
bleibt unverändert als Legacy erhalten; A darf deshalb nichts an dessen CSS ändern
(eigene Klassen `classic-shelf-*`). Neu: Theme-Tokens statt fester Farben, Messingschilder mit Fach-Namen,
korrekte 3D-Geometrie (Cover-Fläche, Oberkante, Seitenschnitt), Reihen werden bis zum
Rand gefüllt, Deko am Schrankrand, Kerzen-/Lichtschein aus `--shelf-light`.

**B · Lederrücken.** Neue Komponente `LeatherShelf`. Rücken mit Lederkorn-Textur,
Bünden, Goldlinien, Titelschild, Eckprägung; Hover kippt das Buch leicht, Schimmer läuft
darüber, eine Cover-Karte mit Titel/Autor/Fortschritt schwebt darüber. Touch: erstes Tippen
zeigt die Karte, zweites öffnet.

**C · 3D-Raum.** Neue Komponente `ShelfRoom` + `shelfRoom.js`. Ein Schrank, so hoch wie
Fächer nötig; die Zeichenfläche bleibt beim Scrollen stehen (`position: sticky`), das
Scrollen fährt die Kamera am Schrank entlang. Bücher als Instanzen mit Rücken-/Cover-
Texturen (Canvas aus Titel/Farbe bzw. echtes Cover). Hover → Buch rutscht heraus, Klick →
Buch kommt nach vorne mit Karte („Weiterlesen“ / „Details“), nochmal Klick oder Esc stellt
es zurück. Kerze/Lampe als flackerndes Punktlicht. Handy: Pixelverhältnis ≤ 1,5, Schatten
vereinfacht, Tippen statt Hover. Bei > 300 Büchern werden nur die Fächer in Kameranähe
gebaut. Aufräumen beim Verlassen der Seite (Renderer, Texturen, Listener).

**D · Rotunde.** Neue Komponente `ShelfRotunda` + `shelfRotunda.js`. Jede Nische ist ein
Fach (Genre, „Zuletzt gelesen“ vorne zum Start); volle Fächer laufen in die nächste
Nische weiter; Anzahl Nischen mindestens 10 (leere Nischen bekommen Deko). Drehen per
Ziehen, Pfeilen, Mausrad und Tastatur (←/→); oben steht der Name der vorderen Nische.
Dunkler Raum, Laterne am Zeiger (Handy: feste Laterne in der Mitte, Wischen dreht).
Klick → Buch öffnet sich zur Doppelseite (Cover links; Titel, Autor, Beschreibung, Genre,
Seiten, Fortschritt, „Weiterlesen“/„Details“ rechts), Esc/„Zurück ins Regal“ schließt;
Fokus wird dabei gefangen und zurückgegeben (wie `Dialog`).

## 7. Qualitätssicherung

- **Legacy-Schutz:** die bestehenden Regal-Tests laufen unverändert weiter grün.
- **bUnit:** `GroupForShelf` (Reihenfolge, Ohne Genre unten, Sortierung im Fach, Filter,
  Doppelvorkommen), Einstellungszeile, Stil-Umschaltung rendert die richtige Komponente,
  zugängliche Linkliste in C/D.
- **Visuell (Pflicht vor jedem Merge):** Skript macht Screenshots aller Stile × 11 Themes
  × Desktop 1440 px und Handy 390 px, mit 0, 3 und ~120 Büchern sowie Hover-/Offen-Zustand.
  Geprüft wird: keine Überläufe, keine abgeschnittenen Schilder, Deko nicht über Büchern,
  Kontrast der Schilder ≥ 4.5, keine Konsolenfehler. Brave-Check (claude-in-chrome) für die
  Interaktion.
- **Leistung:** C hält 60 fps auf dem Desktop mit 150 Büchern und lädt nichts, solange
  ein anderer Stil gewählt ist.

## 8. Phasen (je ein PR)

1. Fächer-Logik `GroupForShelf` + „Zuletzt gelesen“ + Stil-Einstellung (vorerst nur Legacy wählbar) + Regal-Tokens je Theme
2. A `ClassicShelf` (Geometrie, Schilder, Füllung, Licht) und als Standard schalten
3. Assets: Texturen + gerenderte Deko, `CREDITS.md`, Deko in A
4. B Lederrücken
5. D Rotunde
6. C 3D-Raum
7. Visueller Gesamtcheck aller Stile × Themes, Doku (CHANGELOG, Roadmap)

Nur Frontend; kein Backend-Deploy nötig.
