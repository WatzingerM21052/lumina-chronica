# Bücherregal-Feinschliff — Analyse und Konzept

> **Hinweis:** Umgesetzt in #618–#623 (v4.1.0-beta.1). „3D-Raum“ und „Rotunde“ werden durch die „3D-Bibliothek“ ersetzt, siehe `2026-10-12-library-room-design.md`.

**Datum:** 2026-10-12
**Anlass:** User-Feedback nach #612–#617 (sieben Punkte, siehe §1).
**Basis:** `2026-10-11-bookshelf-rework-design.md`

## 1. Befunde (reproduziert)

| # | Feedback | Ursache (gemessen / gesehen) |
|---|---|---|
| 1 | Dashboard „Zuletzt gelesen“: erst Animation, dann blinkt es und wird dicker | `WorldJourney`: das Buch fliegt mit der generierten Vorderseite ein (`data-enter`, 1,4 s); das Cover-Bild kommt erst danach (Blob-Laden nach dem Dashboard-Abruf) und ersetzt die Vorderseite hart (`@if cover … else …`) → Blinken. Zusätzlich kann die Begrüßung nach dem Laden wachsen (440 → 680 px), wenn das Theme erst nach dem ersten Render aus dem Konto übernommen wird, und schiebt das Kapitel nach unten. |
| 2 | Klassisch: Deko nicht „smooth integriert“ | Objekte stehen auf einer Kante ohne sichtbare Oberseite, eigener Schlagschatten statt Kontaktschatten, Licht/Farbe passt nicht zum Theme-Licht, keine Lichtwirkung von Kerze/Laterne auf das Holz. |
| 2b | Öffnen-Animationen (Rotunde, 3D-Raum) wirken nicht gut | Rotunde: eine flache Doppelseite skaliert aus der Mitte, Deckel klappt als leere Fläche; 3D-Raum: Buch fliegt sehr nah an die Kamera, daneben eine Karte. Kein gemeinsames Erlebnis zwischen den Stilen. |
| 3 | Klassisch: komische Dinge bei den Büchern | Die 3D-Seitenflächen (Cover, Oberkante) sind auch in Ruhe sichtbar: durch die Perspektive ragen sie als schräge „Fähnchen“ über niedrigere Nachbarn und als helle/farbige Streifen in Lücken; am Reihenende steht eine ganze Cover-Seite. |
| 4 | Lederrücken: rote Bänder komisch; Kippen nach links ins Nachbarbuch | Bändchen hängt über das Brett und bewegt sich nicht mit; `rotate(-9deg)` dreht in der Bildebene → Kollision. |
| 5 | 3D-Raum: „Regal im Regal“, kippt mit der Maus, scrollt im Fenster | Gerahmte Bühne (abgerundete Box mit eigenem Hintergrund) in der Seitenkarte; Kamera folgt der Maus (Parallaxe); Kamera fährt per Scroll-Fortschritt, nicht 1:1 mit der Seite. |
| 6 | Rotunde: rote Bänder; Deko in eigenen Nischen braucht Platz | Leere Nischen nur für Deko (min. 10 Nischen). |
| 7 | Gesamt: Design, Animationen, Hover, Assets überdenken | s. u. |

## 2. Leitlinien für alle Stile

1. **Ruhezustand ist makellos:** von vorn sichtbar ist nur, was man von vorn sähe. 3D-Flächen erscheinen nur während einer Bewegung.
2. **Bewegung ist physikalisch und kollisionsfrei:** Bücher bewegen sich nach vorn (z) und kippen um die Unterkante zum Betrachter, nie seitlich in den Nachbarn.
3. **Ein gemeinsames Öffnen-Erlebnis** (`BookSpread`, §3) für Klassisch, Lederrücken, Rotunde und 3D-Raum.
4. **Deko gehört zum Möbel:** steht auf einer sichtbaren Fläche, mit Kontaktschatten, im Licht des Themes, nie in eigener Nische.
5. **Keine Markierungen, die nicht zum Buch gehören** (rote Bänder raus). Fortschritt zeigt die Karte/Doppelseite; im Fach „Zuletzt gelesen“ genügt die Position.
6. Reduzierte Bewegung: kein Flug, kein Klappen, nur Überblenden.

## 3. `BookSpread` — das Buch wird herausgenommen und aufgeschlagen

Gemeinsame Komponente (Dialog), aufgerufen mit Buch, Fortschritt und dem Bildschirm-Rechteck des angeklickten Buchs.

- **Flug:** Ein echtes 3D-Buch (Vorderseite mit Cover-Bild oder geprägtem Einband, Rücken, Schnitt, Rückseite, richtige Dicke) startet am Rechteck des angeklickten Buchs, Rücken zum Betrachter, und dreht sich beim Flug zur Mitte (FLIP, 650 ms) mit dem Cover nach vorn.
- **Aufschlagen:** Der Deckel schwingt um den Rücken auf (−165°, 900 ms, Ease mit leichtem Nachschwingen); links erscheint der Vorsatz mit dem Cover als Tafel, rechts die Seite mit Titel, Autor, Beschreibung, Genre, Fortschritt, „Weiterlesen“/„Lesen“, „Details“.
- **Schließen:** umgekehrt: Deckel zu, Buch fliegt an seinen Platz zurück (Esc, Hintergrund, „Zurück ins Regal“); Fokus zurück auf das Buch.
- Cover-Bild wird vor dem Flug geladen (höchstens 400 ms warten, sonst Einband ohne Bild, Bild blendet später ein).
- Handy: kein Deckel-Klappen; das Buch gleitet hoch und die Seiten liegen untereinander.
- Ersetzt RotundaTome und die Karte des 3D-Raums.

## 4. Stile

**Klassisch**
- Seitenflächen/Oberkante in Ruhe unsichtbar (`opacity` 0, beim Herausziehen eingeblendet); Tiefe in Ruhe nur über Schattierung am Rücken.
- Hover: Buch gleitet ~22 px nach vorn und 6 px hoch, dreht sich leicht (−25°) Richtung Betrachter, sodass ein Streifen des Covers sichtbar wird; kein volles Herausdrehen mehr (das übernimmt `BookSpread` beim Klick).
- Gesims bekommt eine sichtbare Oberseite (Perspektivband), Deko steht darauf mit Kontaktschatten (Ellipse), Theme-Farbabstimmung per `filter` aus Tokens (`--shelf-decor-filter`), warmer Lichtschein der Kerze/Laterne auf Gesims und oberstem Fach.
- „Zuletzt gelesen“ cover-forward bleibt; Fortschritts-Badge bleibt (gehört zur Ausstellung).

**Lederrücken**
- Bänder entfernt.
- Hover: Kippen nach vorn (`rotateX(-14deg)` um die Unterkante, `perspective` am Fach), leichtes Anheben, Schimmer; Karte bleibt.
- Klick: `BookSpread`.

**Rotunde**
- Bänder entfernt.
- Keine Deko-Nischen: Bücher werden auf mindestens 8 Nischen verteilt; Deko steht auf einem umlaufenden Kranzgesims über den Nischen (jede zweite Nische ein Objekt).
- Klick: `BookSpread` statt `RotundaTome`.

**3D-Raum (neu gedacht)**
- Kein Fenster: Die Leinwand ist durchsichtig, so breit wie der Inhalt, und der Schrank scrollt 1:1 mit der Seite (die Kamera bildet genau den sichtbaren Ausschnitt des Schranks ab, wie bei einem DOM-Element). Kein eigener Bühnen-Hintergrund, kein Rahmen.
- Keine Maus-Parallaxe. Licht: warmes Raumlicht + Kerze auf dem Gesims (Theme-Licht).
- Hover: Buch gleitet nach vorn; Klick: Buch gleitet heraus, dann `BookSpread` (Start-Rechteck = projiziertes Buch).

**Dashboard (Punkt 1)**
- Das Kapitel „Zuletzt gelesen“ startet seine Einflug-Animation erst, wenn das Cover da ist (oder feststeht, dass es keins gibt; höchstens 2,5 s); das Bild liegt über der generierten Vorderseite und blendet weich ein, statt sie zu ersetzen.

## 5. Prüfung

Je Stil: Bildfolgen (Hover, Klick/Öffnen, Schließen) bei 1440 und 390 px, alle Themes im Ruhezustand, Brave-Check (sichtbares Fenster), Cover langsam geladen (künstliche Verzögerung).

## 6. Reihenfolge (je PR)

1. Dashboard-Fix
2. `BookSpread` + Klassisch (Ruhezustand, Hover, Deko-Integration)
3. Lederrücken + Rotunde
4. 3D-Raum neu
