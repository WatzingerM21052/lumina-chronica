# Offline-Bibliothek Rework — Design

**Stand:** 2026-09-19
**Status:** Genehmigt, zur Umsetzung
**Teil von:** Issue #358 (Core App Experience Rework), Baustein "Offline Library — The Travelling Library"

## Ausgangslage

`OfflineLibrary.razor` (`/offline`) ist aktuell komplett schmucklos: Überschrift, ein Absatz Fließtext, eine simple `<ul>`-Liste mit Titel/Autor/Format/Größe pro Buch, zwei Buttons ("Lesen"/"Entfernen"). Kein Hero, keine Atmosphäre — im Gegensatz zu Dashboard/Statistics/Library, die bereits das "Living Library of Alexandria"-Rework durchlaufen haben.

**Immersionsgrad laut Issue #358**: "ruhig" — zwischen Library (atmosphärisch, aber content-first) und Settings (deutlich ruhiger, keine Show).

## Harte technische Einschränkung

Offline gespeicherte Bücher (`OfflineBookSummary`, `wwwroot/js/offlineStorage.js`) haben **keine gecachten Cover** — nur `Id`, `Title`, `Author`, `Format`, `SizeBytes`, `SavedAt`. `BookCard` (der normale Cover-Renderer der App) kann hier nicht wiederverwendet werden, ohne Cover-Caching neu zu bauen — das wäre ein neues Storage-/Backend-System und explizit außerhalb des Scopes dieses Reworks (Issue #358: "keine neuen Backend-Systeme"). Diese Seite bekommt deshalb bewusst eine eigene, cover-lose Kartendarstellung.

## Design

### 1. Hero-Banner (klein, ruhig, kein Parallax)

- Nutzt das bereits vorhandene, fertige Bild `wwwroot/images/Designimages/02_travelling_library_offline_hero.png` (Reisetruhe voller Bücher im Zugabteil, Laterne, Kompass, Sonnenuntergangslandschaft).
- Deutlich kleiner als Dashboards `.home-hero` (38vh): ca. **140–160px Höhe**, `overflow: clip`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-card)` — gleiche Bausteine wie die bestehenden Heroes, nur kompakter.
- **Kein Parallax, keine Scroll-Kompaktierung** — statisches Bild, ein dezenter Scrim (`linear-gradient` dunkel→transparent von unten) für Textlesbarkeit, Seitentitel ("Offline Bücher") als Overlay-Text auf dem Bild statt als separate `<h1>` darüber.
- `prefers-reduced-motion` ist hier ohnehin irrelevant, da nichts animiert wird.

### 2. Speicherzeile

Bleibt eine ruhige Textzeile ("Insgesamt X MB belegt") — keine neue Fortschrittsanzeige, keine Kontingent-Abfrage. Nur stimmiger ins neue Layout eingebettet (z. B. direkt unter dem Hero, dezente Typografie).

### 3. Buch-Karten (statt `<ul>`-Liste)

Kompakte, ruhige Karten in einem Grid/Flex-Layout (kein Regal-Look — das ist bewusst Library vorbehalten). Jede Karte:
- Ein **selbst gezeichnetes Buch-Platzhalter-Icon** — exakt dieselbe Inline-SVG wie `BookCard.razor`s `.book-card-cover-placeholder` (zwei sich überlappende Buchseiten-Pfade, `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"`), damit kein neues visuelles Vokabular entsteht und kein "kaputtes Bild"-Eindruck.
- Titel, Autor (falls vorhanden), Format + Größe.
- "Lesen"/"Entfernen"-Buttons, Funktionalität unverändert.

### 4. Leerzustand (kombiniertes Icon)

Eigene, page-spezifische Markup (nicht über die geteilte `EmptyState`-Komponente, da deren `Ornament`-Parameter nur ein einzelnes Text-Glyph rendert, kein SVG — dieser Sonderfall rechtfertigt keine Erweiterung der geteilten Komponente für einen einzigen Verwendungsfall). Selbst gezeichnetes Koffer-Icon mit angedeuteten Buchrücken darin, im selben Strichstil wie alle bestehenden Icons dieser App:

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
  <path d="M9 8V6a3 3 0 0 1 3-3 3 3 0 0 1 3 3v2" />
  <rect x="3" y="8" width="18" height="12" rx="2" />
  <path d="M8 11.5v5M12 11.5v5M16 11.5v5" stroke-width="1.1" />
  <rect x="10.3" y="7.6" width="3.4" height="1.6" rx="0.4" />
</svg>
```
(Koffer-Umriss mit Griff und Schließe oben, drei vertikale Linien im Korpus deuten gestapelte Buchrücken an — "ein Koffer voller Bücher", ohne ein zweites, mit dem Buch-Platzhalter konkurrierendes Icon-Motiv zu erfinden.)

Kombiniert mit dem bestehenden `❦`-Ornament (App-weite Konsistenz mit Discover/PublicProfile) als kleine Zierde ober- oder unterhalb des Koffer-Icons, plus warmherzigem Text (z. B. "Noch keine Bücher für unterwegs gepackt.").

### 5. Technische Umsetzung

- Neue Datei `frontend/LuminaChronica.Client/Pages/OfflineLibrary.razor.css` (Blazor-CSS-Isolation, gleiche Konvention wie `Home.razor.css`/`Statistics.razor.css`) — keine Ergänzung der großen `app.css`.
- Keine Funktionsänderung: Speichern/Lesen/Entfernen, Fehlerbehandlung bei Storage-Fehlern bleiben exakt wie heute (per Issue #358 explizit als Nicht-Regressions-Punkt genannt).
- Keine neue Farbpalette — bestehende Tokens (`--color-bg-paper`, `--color-primary`, `--color-border`, Theme-Tokens) funktionsfähig in allen 4 Themes.
- Bestehendes Motion-System (falls überhaupt Übergänge nötig sind, z. B. Karten-Hover) — keine neuen Dauern.

## Tests

- Bestehende bUnit-Tests für `OfflineLibrary.razor` (falls vorhanden) müssen weiterhin grün sein — Kern-Interaktionen (Laden, Entfernen, Leerzustand, Fehlerfall) dürfen sich nicht ändern, nur die Darstellung.
- Neue/angepasste Tests bei Bedarf für die neue Karten-Struktur (z. B. dass Titel/Autor/Format weiterhin korrekt gerendert werden).

## Nicht im Scope

- Kein Cover-Caching für Offline-Bücher (siehe "Harte technische Einschränkung" oben).
- Keine echte Speicherkontingent-Anzeige (`navigator.storage.estimate()`) — bewusst zurückgestellt, siehe Entscheidung oben.
- Keine Bestätigungs-Dialoge o. ä. neue Interaktionsmuster — reine Darstellungsüberarbeitung.
