# Bibliothek: Regal ohne Pagination + einstellbare Raster-Seitengröße — Design

**Stand:** 2026-09-19
**Status:** Entwurf, zur Review

## Problem

Die Bibliotheksansicht (`Library.razor`) paginiert serverseitig mit `pageSize=20`, für Regal- und Raster-Ansicht identisch. Das Regal gruppiert Bücher (`LibraryShelfGrouping.Group()`) aber immer nur innerhalb der aktuell geladenen Seite — bei mehr als 20 Büchern in einer Kategorie (z. B. einem Genre) reißt die Gruppe an der Seitengrenze ab: Seite 1 zeigt ein halb volles Regalfach, Seite 2 zeigt dieselbe Kategorie nochmal von vorne. Das wirkt nicht wie ein durchgehendes Regal.

Gewünscht:
1. Regal-Ansicht: alle gefilterten Bücher auf einmal, kein Seitenwechsel — einfach scrollen.
2. Raster-Ansicht: weiterhin paginiert, aber mit wählbarer Seitengröße.

## Rahmenbedingungen

- Backend-Limit `MAX_PAGE_SIZE = 100` pro Request (`backend/src/routes/books.ts`) — bleibt unverändert, keine Backend-Änderung in diesem Scope.
- Bibliotheksgröße aktuell < 100 Bücher, soll aber nicht künstlich auf diese Größe begrenzt bleiben (User: "momentan sinds unter 100 bücher aber falls mal richtig genutzt womöglich mal mehr").
- `LibraryShelfGrouping.Group()`s Signatur (`IReadOnlyList<Book>` hinein) bleibt unverändert — nur die Menge der übergebenen Bücher wächst.

## Architektur: eine gemeinsame, vollständige Datenquelle

`LoadBooksAsync()` wird zu `LoadAllBooksAsync()`. Bei jedem Wechsel von Suche/Filter/Sortierung/Favoriten-Toggle (und beim initialen Laden) wird die **komplette** gefilterte Ergebnismenge geholt, nicht mehr eine einzelne 20er-Seite:

1. Request Seite 1 mit `pageSize=100`.
2. Falls `response.Total > response.Items.Count`: weitere Seiten (`page=2,3,...`, `pageSize=100`) sequenziell nachladen, bis alle Items da sind.
3. Alle Items in `_allItems` (`List<Book>`) zusammenführen.

Bei aktuell < 100 Büchern ist das exakt **ein** Request — nicht mehr als heute. Der Mehrseiten-Loop greift erst, wenn die gefilterte Menge über 100 wächst.

**Fehlerfall**: schlägt irgendeine Seite in der Kette fehl, wird der Ladevorgang abgebrochen und die bestehende `_errorMessage`-Anzeige greift — keine stillen Teilergebnisse (kein "Regal zeigt nur die ersten 100 von 250 Büchern, ohne Hinweis").

Beide Ansichten (Regal, Raster) lesen ab jetzt aus `_allItems`. Serverseitige Pagination (`_page`, `_result.Page`, das alte `PageSize`-Konstrukt) entfällt für die Anzeige selbst.

## Regal-Ansicht: vollständige Gruppierung + Lazy-Rendering

`LibraryShelfGrouping.Group(_allItems, _sort, _genreFilters, _tagFilters)` liefert immer die vollständige Gruppenliste — das behebt den Abriss-Bug strukturell, da es kein Seitenkonzept mehr gibt, über das eine Gruppe "hinausfallen" könnte.

Damit nicht potenziell hunderte 3D-CSS-Buch-Elemente auf einmal ins DOM gerendert werden (heute irrelevant bei < 100 Büchern, aber die Mechanik soll für später stehen):

**Korrektur gegenüber der ersten Idee (Batching nach Gruppen-Anzahl)**: die Standard-Sortierung ("Hinzugefügt") gruppiert nach `GroupByRecency` in nur **vier** festen Buckets ("Diese Woche"/"Diesen Monat"/"Dieses Jahr"/"Älter") — bei einer großen Bibliothek könnten hunderte Bücher in einem einzigen Bucket ("Älter") landen. Ein Batching nach Gruppen-Anzahl (z. B. "6 Gruppen sichtbar") würde dann gar nichts begrenzen, weil schon die erste sichtbare Gruppe hunderte Bücher enthalten könnte. Batching erfolgt deshalb nach **Buch-Anzahl über alle Gruppen hinweg**, nicht nach Gruppen-Anzahl:

- Neuer State: `_visibleBookCount` (int), initial auf einen Startwert gesetzt, der die erste Bildschirmfüllung plus Puffer abdeckt (Default: 40 Bücher).
- Gerendert wird: die Gruppen in Reihenfolge durchlaufen, pro Gruppe so viele ihrer Bücher rendern, wie das verbleibende Budget (`_visibleBookCount` minus bereits gerenderter Bücher) noch erlaubt — eine Gruppe kann dabei auch nur teilweise gerendert werden (der Rest kommt beim nächsten Nachlade-Schritt einfach als Fortsetzung derselben Gruppe hinzu, kein Neustart). Sobald das Budget erschöpft ist, werden keine weiteren Gruppen mehr begonnen.
- Nach dem letzten gerenderten Buch steht ein unsichtbarer Sentinel-Marker (`<div class="shelf-load-more-sentinel" @ref="_loadMoreSentinelRef">`), nur vorhanden, solange noch nicht alle Bücher sichtbar sind.
- Neue JS-Funktion in `shelf-physics.js` (dieselbe Datei, die bereits für den Shelf-DOM importiert wird): `observeLoadMore(sentinelEl, dotNetHelper, methodName)` — ein `IntersectionObserver` mit großzügigem `rootMargin` (z. B. `"600px 0px"`, analog zu `lazyCover.js`s Vorlauf-Muster), der beim Näherkommen den C#-Callback `[JSInvokable] RevealMoreGroups()` auslöst.
- `RevealMoreGroups()` erhöht `_visibleBookCount` um eine feste Batch-Größe (Default: +40) und begrenzt auf die Gesamtzahl der gefilterten Bücher.
- Der Observer wird bei jedem Render neu aufgesetzt, solange der Sentinel existiert (das JS-Modul disconnected dabei intern immer erst den alten Observer, analog zu `lazyCover.js` — siehe dortigen Kommentar). Ein neuer Filter/Suche/Sortierung setzt `_visibleBookCount` auf den Startwert zurück.

## Raster-Ansicht: clientseitige Pagination mit wählbarer Seitengröße

Bestehendes Pager-UI (`Seite X von Y`, Zurück/Weiter) bleibt visuell gleich, arbeitet aber ab jetzt rein clientseitig auf `_allItems`:

```
_allItems.Skip((_rasterPage - 1) * _rasterPageSize).Take(_rasterPageSize)
```

Kein Netzwerk-Request mehr pro Seitenwechsel oder Seitengrößen-Wechsel.

Neues Dropdown neben den bestehenden Sortier-Controls: feste Stufen **20 / 40 / 60 / 100** pro Seite. Auswahl wird in `localStorage` gemerkt (Schlüssel z. B. `lumina_library_raster_page_size`), damit sie über Sessions hinweg erhalten bleibt. Neues, kleines JS-Modul `libraryPreferences.js` (`getRasterPageSize()` / `setRasterPageSize(value)`), lazy importiert — gleiches Interop-Muster wie `TokenStore`/`auth.js` und `ThemeService`/`theme.js`. Beim Ändern der Seitengröße wird `_rasterPage` auf 1 zurückgesetzt.

## Betroffene Dateien (Übersicht, Detailplanung folgt in der Implementierungsplanung)

- `frontend/LuminaChronica.Client/Pages/Library.razor` — Hauptänderung: Fetch-Loop, `_allItems`, Lazy-Render-State, Raster-Client-Pagination, neues Dropdown.
- `frontend/LuminaChronica.Client/wwwroot/js/shelf-physics.js` — neue `observeLoadMore`-Funktion.
- `frontend/LuminaChronica.Client/wwwroot/js/libraryPreferences.js` — neu, localStorage-Wrapper für die Raster-Seitengröße.
- `frontend/LuminaChronica.Client/Models/LibraryShelfGrouping.cs` — keine Signaturänderung, nur mehr Input-Bücher.
- Tests: `tests/frontend/LibraryPageTests.cs` (neue Fälle), ggf. `tests/frontend/LibraryShelfGroupingTests.cs` (falls Randfälle mit sehr vielen Gruppen sinnvoll sind).

## Tests

- **Mehrseiten-Fetch-Loop**: bUnit-Test mit gemocktem `ApiClient`, der > 200 Test-Bücher über 3 Backend-Seiten (100/100/rest) verteilt zurückgibt — prüft, dass `_allItems` am Ende alle Bücher enthält und die Gruppierung über den vollständigen Satz läuft, nicht nur über Seite 1. (Ein Test mit nur 2 Büchern würde den Loop gar nicht auslösen — bewusst groß genug seeden.)
- **Fehlerfall im Loop**: eine der Folgeseiten schlägt fehl → `_errorMessage` wird gesetzt, kein Teil-Rendering.
- **Raster-Seitengröße**: Wechsel der Dropdown-Auswahl reslict `_allItems` ohne zusätzlichen `ApiClient`-Call (Call-Count-Assertion) und setzt `_rasterPage` zurück auf 1.
- **Lazy-Render-Zähler**: `RevealMoreGroups()` erhöht `_visibleBookCount` korrekt und kappt bei der Gesamtzahl der gefilterten Bücher; ein Aufruf reicht in bUnit aus, um "vollständig geladen" direkt zu prüfen, ohne einen echten `IntersectionObserver` zu brauchen (reiner C#-Logik-Test, kein echtes Scroll-Verhalten — das braucht Live-Verifikation, siehe unten).
- **Nicht bUnit-testbar, braucht Live-Verifikation**: das tatsächliche Scroll-getriggerte Nachladen im echten Browser (`IntersectionObserver` + echtes Scrollen) — bei der Verifikation echtes Scroll-Wheel-Input verwenden (`computer`-Tool), nicht `window.scrollTo()`/`javascript_tool`, siehe bekannter Automatisierungs-Quirk in diesem Projekt.

## Bestehende Zustände bleiben erhalten

Lade-, Fehler- und Leer-Zustände (`_errorMessage`, `LoadingIndicator`, `EmptyState`, "Keine Bücher gefunden.") hängen heute an `_result`. Mit `_allItems`/`_totalCount` als neuem Datenmodell müssen dieselben Bedingungen (kein Ergebnis + keine aktiven Filter → EmptyState; kein Ergebnis + aktive Filter → "Keine Bücher gefunden."; Fehler → `_errorMessage`) 1:1 erhalten bleiben, nur auf die neuen Felder umgelegt — keine UX-Änderung an diesen Zuständen.

## Nicht im Scope

- Keine Backend-Änderungen (Pagination-API, `MAX_PAGE_SIZE` bleiben unverändert).
- Keine Änderung an `LibraryShelfGrouping`s Gruppierungslogik selbst (Genre/Datum/Alphabet-Buckets) — nur an der Menge der übergebenen Bücher.
- Kein Umbenennen der bestehenden (etwas verwirrenden) `LibraryViewMode.Grid`/`.List`-Enum-Namen — unrelated Refactoring, nicht Teil dieser Aufgabe.
