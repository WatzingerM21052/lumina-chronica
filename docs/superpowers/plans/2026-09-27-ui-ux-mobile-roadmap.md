# UI/UX & Mobile — Arbeitsplan

**Stand:** 2026-09-27. Wird nach jedem Schritt aktualisiert (Status-Spalte).
**Arbeitsweise:** Die Punkte werden der Reihe nach abgearbeitet, jeder als eigener PR gegen `main`.
Vor jedem PR laufen die Tests. UI-Änderungen werden per Screenshot gegen ein lokales Backend
(`wrangler dev --local`, Testdaten) bei 1280px und 390px geprüft. Nach grüner CI wird gemergt;
das Frontend deployt dann automatisch, das Backend-Deploy wird bei Bedarf manuell angestoßen.

## 1. Bestandsaufnahme der Issues

| Issue | Thema | Stand |
|---|---|---|
| #496 | UI/UX-Durchgang aller Eingabe-Flows | **In Arbeit.** Teil 1 (#499: Dialog-Formulare, Dropzones, Link-Buttons) und Teil 2 (#500: Buch-bearbeiten in Abschnitten, Profil-Ausrichtung) sind gemergt; Teil 3 (#501: Projekt-Kopf, Detail-Köpfe auf dem Handy) ist im Review. |
| #493 | Mobile Design Overhaul | **Offen, entschieden:** oben keine Navbar, unten eine schwebende Leiste (siehe §2). Befund: jede eingeloggte Seite scrollt bei 390px seitlich (Header). |
| #498 | Statistik-Seite neu gestalten | Offen. Die Seite hatte schon 5 Durchgänge (Rework 1/2, Polish A–C, Visuals Round 2). |
| #497 | Logo & Favicon neu | Offen. Aktuell: Konturlinien-Kerze plus Buch (#140). |
| #358 | Core App Experience Rework | **Weitgehend erledigt:** Dashboard, Statistik, Bibliothek, Offline, Einstellungen und Profil haben je einen Rework-Durchgang bekommen (Roadmap). **Noch offen:** Theme-Auswahl als Vorschau-Karten (heute nur Buttons), gruppierte Benachrichtigungs-Einstellungen, die zwei neuen Themes „Alexandria“ und „Babylon“ (+ optionale Raum-Navigation), `app.css` gliedern (3196 Zeilen, keine Abschnitte). |
| #269 | Premium Design Worldbuilding Suite | Nicht begonnen. Nur als Schwester-Issue von #315 erwähnt. |
| #239, #143 | Bibel-Seite Experience Mode / Dark-Academia-Theme | #143 teilweise umgesetzt (Bible reader theme, Roadmap), #239 (Phase 2) nicht begonnen. |
| #189 | Reader „Realistische Ansicht“ für EPUB | Mehrfach versucht und wieder abgeschaltet (Roadmap); offen. |
| #270, #14, #15 | KI-Assistent, KI-Epic, native Apps | Langfristig; nicht in diesem Plan. |
| #2, #3, #16, #17, #18 | Allgemeine Epics (Frontend, Backend, Deployment, Doku, QA) | Sammel-Epics ohne konkrete Stories. |

## 2. Leitplanken aus der Recherche

- **Navigation nach Fensterbreite** (Material 3): Unter 600px kompakte Bottom-Navigationsleiste mit
  3–5 Zielen; 600–839px Navigation Rail; ab 840px die bestehende Desktop-Navigation oben.
- **Schwebende Tab-Leiste** (iOS 26 HIG): zentrierte „Pille“ über dem Inhalt, darf beim Scrollen
  minimieren; was nicht passt, landet unter „Mehr“.
- **Web-Technik:** `viewport-fit=cover`; `padding-bottom: max(…, env(safe-area-inset-bottom))`;
  `100dvh` statt `100vh`; Touch-Ziele mindestens 44×44px; sichtbare Beschriftungen; `aria-current="page"`.
- **Formulare** (NN/g): Mehrstufige Abläufe nur für lange, einmalige Erfassungen; unter etwa 6 Feldern ein
  einseitiges Formular; beim Bearbeiten benannte Abschnitte statt Schritte.
- **Auswahl mit Suche** (WAI-ARIA APG): editierbare Combobox mit Listen-Autovervollständigung; der Fokus
  bleibt im Eingabefeld; Pfeiltasten, Enter, Escape.
- **Offen, braucht eine lokale Session mit Claude in Chrome:** direkter Vergleich mit recipemaster.at.
  Aus der Cloud-Umgebung ist die Seite gesperrt.

Quellen: [Material 3 Navigation bar](https://m3.material.io/components/navigation-bar),
[Android: Build adaptive navigation](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation),
[Apple HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars),
[Safe Area Insets for Mobile Layouts](https://screenmetriclab.com/guides/safe-area-insets-mobile-layouts),
[NN/g Wizards](https://www.nngroup.com/articles/wizards/),
[WAI-ARIA APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

## 3. Reihenfolge

### Block A — Eingabe-Flows fertigstellen (#496)

| # | Schritt | Status |
|---|---|---|
| A1 | Projekt-Detailkopf wie BookDetail, Detail-Köpfe stapeln auf dem Handy | erledigt (#501) |
| A2 | **Sprachauswahl**: Combobox mit ISO-639-1-Liste, Namen über `Intl.DisplayNames`, Suche beim Tippen, „Eigene Sprache“ als Ausnahme; bestehende Freitext-Werte bleiben gültig; Anzeige als Name statt Code (Upload, Bearbeiten, Detail, Bibliotheks-Karten) | erledigt 2026-09-28. Abweichend: feste Sprachliste mit DE/EN-Namen statt `Intl.DisplayNames` (synchron, testbar, unabhängig von geladenen ICU-Daten); Bibliotheks-Karten zeigen keine Sprache, dort war nichts zu tun. |
| A3 | **Projekt bearbeiten als Dialog** (wie Buch/Regal), statt Inline-Formular | erledigt 2026-09-28 |
| A4 | **Bibliotheks-Werkzeugleiste entzerren**: Suche breit, Filter/Sortierung gebündelt, Ansicht (Regal/Raster/Größe) als eigene Gruppe; eindeutige Beschriftungen („Sortieren: Hinzugefügt“) | erledigt 2026-09-28 |
| A5 | **Worldbuilding-Formulare** (Charakter, Ort, Lore, Zeitleiste, Dateien): Screenshot-Befund, gleiche Muster (Dialog statt Inline, wo sinnvoll; Dropzones; Abschnitte) | Erledigt 2026-09-28: Teil 1 (Projekt-Tabs, #508), Teil 2 (Detailseiten Charakter/Ort/Lore, `DialogGuard`) |
| A6 | **Suche vereinheitlichen** (Bibliothek, Entdecken, Metadaten): Löschen-Button im Feld, Debounce, leere Zustände | offen |
| A7 | **Einstellungen** (Rest aus #358): Theme-Vorschau-Karten, Benachrichtigungen gruppiert | offen |
| A8 | **Konto-Menü** (Nutzerwunsch 2026-09-27): Klick auf Avatar + Name öffnet ein kompaktes Dropdown mit Profil, Einstellungen, Sicherheit, Abmelden (Vorbild recipemaster.at, nicht 1:1). „Sicherheit“ bündelt Passwort, E-Mail-Änderung (M-6) und OAuth-Verknüpfungen, die heute auf Profil/Einstellungen verteilt sind. Auf dem Handy landen dieselben Einträge unter „Mehr“ (B2). | offen, Aufteilung mit dem Nutzer abstimmen |

### Block B — Handy (#493)

| # | Schritt | Status |
|---|---|---|
| B1 | Grundlagen: Breakpoint-Tokens (compact <600 / medium 600–839 / expanded ≥840), `viewport-fit=cover`, Safe-Area, `dvh`; kein horizontales Scrollen mehr auf irgendeiner Seite | erledigt 2026-09-28 (Breakpoints als Konvention oben in `app.css`, da Custom Properties in `@media` nicht gehen; alte 40rem-Regeln wandern beim Anfassen um) |
| B2 | **Schwebende Bottom-Navigationsleiste** unter 600px, oben keine Navbar; Home, Bibliothek, Projekte, Entdecken, Mehr (Statistik, Offline, Einstellungen, Profil, Benachrichtigungen, Impressum); im Reader ausgeblendet; optional Minimieren beim Scrollen | erledigt 2026-09-28 (`Layouts/BottomNav`; „Mehr“ als neues `DialogSize.BottomSheet`; die Glocke bleibt oben, weil ihr Zähler dort ohne Öffnen sichtbar ist; Minimieren beim Scrollen weggelassen) |
| B3 | Navigation Rail für 600–839px (Tablet hochkant) | erledigt 2026-09-28, **anders gelöst**: statt einer Rail nutzt 600–839px dieselbe schwebende Bottom-Leiste, zentriert und handybreit (iPadOS-Muster) — eine Rail hätte genau dort ~80px Breite gekostet und ein zweites Navigationsmuster eingeführt. 840–1199px: Logo-Schriftzug und „Profil“-Text weg (nur Icons), damit die Navbar einzeilig bleibt |
| B4 | Seiten-Durchgang bei 390px/412px, jede Seite einzeln (inkl. Tab-Leisten, Werkzeugleisten, Tabellen) | offen |
| B5 | Dialoge auf dem Handy als Bottom-Sheet | offen |

### Block C — Statistik (#498)

C1 Befund per Screenshots in allen Themes → C2 Richtung mit dem Nutzer abstimmen → C3 Umsetzung.

### Block D — Logo & Favicon (#497)

D1 3–5 Kandidaten als SVG → D2 Vergleichsseite, der Nutzer wählt → D3 alle Größen + Header + E-Mail-Logo ersetzen.

### Block E — Kleinere offene Punkte

- Reader- und Toast-Meldungen nutzen noch kurze echte Verzögerungen (nicht deploy-blockierend).
- `user_settings.language` wird nie geschrieben → E-Mails immer Deutsch.
- ~~CI als Pflicht-Check in den Branch-Regeln~~ erledigt (geprüft 2026-09-28: beide Checks sind Pflicht, „strict“).
- Resend-Domain-Verifizierung für `luminachronica.com` (Stand unbekannt).

### Block F — Design-Durchgang 2026-09-28 (neue Befunde)

Rundgang durch alle Seiten in Brave (Dark Library + Classic Library, 1920px) und per Playwright bei 390px, mit Testkonto und
Beispieldaten (10 Bücher, 2 Regale, Projekt mit Charakteren/Orten/Lore/Zeitleiste). Was schon in A–D steht, ist hier
nicht wiederholt, nur bestätigt.

**Bestätigt, bereits geplant:**
- Handy (B1/B2): Auf **jeder** Seite scrollt die Seite bei 390px 12px seitwärts (der Header mit Profil-Link ist zu breit);
  die sieben Navigationspunkte stapeln sich senkrecht im Header und belegen gut die Hälfte des Bildschirms. Zusätzlich
  zu breit: die Button-Zeile im Bibliotheks-Kopf, der Lesekalender. Das ist der dringendste Punkt der ganzen App.
- Einstellungen (A7): Checkboxen statt Schaltern, Theme als Textknöpfe ohne Vorschau.
- Konto-Menü (A8): „Abmelden“ steht mitten im Profil zwischen „Verknüpfte Konten“ und „Konto löschen“.
- Statistik (C): Kennzahlen-Leiste nutzt nur die halbe Breite, die Lesekalender-Karte ist großteils leer, das
  Jahresziel-Formular (Eingabe über die volle Breite + zwei Knöpfe) wirkt wie ein Rohformular.

**Sofort behoben (PR „design quick wins“):** „Backend: online“ nicht mehr auf der Startseite (nur noch eine Warnung, wenn der
Server nicht erreichbar ist); native Bedienelemente (Scrollleisten, Auswahllisten) folgen per `color-scheme` dem Theme,
im Dark-Theme waren sie weiß; leere Checkboxen waren im Dark-Theme fast unsichtbar (Rand ~1,3:1), jetzt ≥ 3:1 in allen
Themes; die Sprachwahl nennt jede Sprache in sich selbst („Deutsch“, „English“).

| # | Befund | Vorschlag | Aufwand |
|---|---|---|---|
| F1 | **Seitenköpfe uneinheitlich**: Bibliothek = Karte mit Titel + Aktionen, Projekte = nacktes `h1` + Knopf, Entdecken = `h1` mit kursivem Untertitel, Statistik/Offline/Einstellungen = Foto-Hero, Profil = zentriertes Siegel über linksbündigem Inhalt | eine `PageHeader`-Komponente (Titel, optional Untertitel/Hero-Bild, Aktionen rechts, auf dem Handy darunter); Heros bleiben, aber mit gleicher Titelposition | M |
| F2 | **Buchdetail zeigt den Lesefortschritt nicht**: bei 62 % gelesen steht dort nur „Lesen“ | Fortschrittsbalken + „Weiterlesen (62 %)“ als Hauptknopf, „Von vorn beginnen“ im Menü | S |
| F3 | **Projekt-Übersicht ist dünn**: nur Beschreibung + Kommentare; die Tab-Leiste steht über dem Titel | Tabs unter den Kopf; auf der Übersicht Kennzahlen (Charaktere, Orte, Lore, Ereignisse) als klickbare Kacheln | M |
| F4 | **Karten-Raster in Projekten/Charakteren/Orten**: kleine Querformat-Vorschauen (≈130px), viel Leerraum rechts; Charaktere ohne Bild zeigen nur ein graues Feld | Hochformat-Karten wie bei Büchern, Raster `auto-fill, minmax(10rem, 1fr)`; Platzhalter mit Initialen statt leerem Icon | S–M |
| F5 | **Burgunder (`--color-secondary`) liest sich im Dark-Theme wie ein Fehler-Rot**: Fortschrittsbalken auf Buchkarten, Datum in der Zeitleiste („JAHR 312“) | Fortschritt in Gold (`--color-accent-text`, wie schon bei der großen Karte), Zeitleisten-Datum in `--color-text-secondary` + Kapitälchen | S |
| F6 | **Native `<select>`s** (Buchgröße, Sortieren, Pro Seite, Entdecken-Sortierung) weichen von den übrigen Bedienelementen ab: 16px statt 14px Schrift, 41px statt 40px Höhe, eigener Pfeil | ein gemeinsamer `select`-Stil in `app.css` (Höhe/Radius/Pfeil wie Eingabefelder) | S |
| F7 | **Profil**: eine schmale Spalte (24rem), rechte Hälfte leer; Google/GitHub ohne Logos; Kopf zentriert, Inhalt linksbündig | zusammen mit A8 und der Profil-Redesign-Idee (2 Spalten: Identität links, Einstellungen rechts) | M–L |
| F8 | **Zurück-Links** sind unterstrichener Fließtext direkt über dem Titel | kleiner „Ghost“-Link mit Pfeil-Icon und festem Abstand, überall gleich (7 Seiten) | S |
| F9 | Beziehungs-Bearbeiten, Relationships und Lore-Seite | in #509 bereits behoben (Liste, Rückfrage beim Löschen, Lore-Karte) | erledigt |

Reihenfolge-Vorschlag: B1/B2 (Handy) zuerst, weil jede Seite betroffen ist; dann F5, F6, F8, F2 (klein, sichtbar);
dann F1 + F4 zusammen (Seitenköpfe und Raster teilen sich Layout-Regeln); F3 und F7 gemeinsam mit A8.

**Stand 2026-09-28 abends (PR „layout polish“):** B1–B3 erledigt; F2, F5, F6, F8 erledigt; F7 zur Hälfte (Layout: eine
zentrierte Kartenspalte, „Abmelden“ in der Identitätskarte, Gefahrenzone als eigene Karte — die Aufteilung in ein
Konto-Menü bleibt A8). Dazu aus einem zweiten Durchgang mit Messskript (Button-Abstände, Randabstände, versetzte
Kanten, Raster-Abstände) und ganzseitigen Screenshots bei 1440/700/390px:
- schmale, ruhige Scrollleisten überall (`scrollbar-width: thin`, Farbe aus dem Theme, transparente Spur); in Dialogen
  liegt die Leiste mit `--space-3` Abstand zu den Feldern im Kartenrand; waagerechte Streifen (Lesekalender,
  Projekt-Tabs) ohne sichtbare Leiste
- `scrollbar-gutter: stable`: der zentrierte Inhalt sprang beim Wechsel zwischen kurzen und langen Seiten 5px seitwärts
- einheitliche Bedienelement-Höhe 40px (Buttons, Felder, Selects)
- Projekt-Tabs als Unterstrich-Leiste statt sieben Einzelknöpfen, wischbar auf schmalen Schirmen
- Kommentare auf 48rem begrenzt (liefen bei 1440px 1360px breit)
- Startseite: „Weiterlesen“-Karten unten bündig, „Ganze Bibliothek ansehen →“ als ruhiger Link
- Statistik: Kennzahlen füllen die Zeile, Beschriftungen auf einer Höhe (Icons machten Werte höher)

Das Messskript meldet danach auf 18 Seiten keine Button-Abstände < 8px, keine Inhalte < 8px am Kartenrand und keine
Kanten, die 1–7px versetzt sind (die drei Treffer sind gewollt: Segment-Knöpfe füllen ihren Rahmen, versteckte
Datei-Inputs, 1px beim Hero-Titel).

**Noch offen und geplant (größer, eigene PRs):**

| # | Was | Vorschlag |
|---|---|---|
| F1 | Seitenköpfe | `PageHeader`-Komponente: Titel + optionaler Untertitel links, Aktionen rechts; Seiten mit Foto-Hero (Startseite, Statistik, Offline, Einstellungen) behalten den Hero, aber gleiche Titelposition/-größe; Bibliothek verliert die dunkle Sonderkarte zugunsten des Standards |
| F3 | Projekt-Übersicht | Projekttitel (klein) immer über den Tabs, damit auch „Charaktere“/„Karte“ zeigen, wo man ist; Übersicht mit Kennzahl-Kacheln (Charaktere, Orte, Lore, Ereignisse, Bücher), die zum Tab springen |
| F4 | Karten-Raster | **erledigt 2026-09-28**: Projekt/Charakter/Lore hochkant (2:3), Orte quer; Initialen statt Icon (`CardInitials`); doppeltes `ProjectCard.razor.css` entfernt. Handy: 3 Spalten in allen Rastern, Startseiten-Abschnitte als Wisch-Reihen, Kennzahlen in einer Zeile, kleinere Überschriften, Footer weg solange die Bottom-Leiste da ist (Nutzerwunsch) |
| F7/A8 | Profil/Konto-Menü | Avatar-Menü oben rechts (Profil, Einstellungen, Sicherheit, Abmelden); „Sicherheit“ bündelt Passwort, E-Mail, verknüpfte Konten — Aufteilung mit dem Nutzer abstimmen |
| A7 | Einstellungen | Checkboxen → Schalter; Theme als Vorschaukarten |
| C | Statistik | Jahresübersicht + Genres in Karten im selben Raster wie Jahresziel/Kalender; Jahresziel-Formular kompakter (Stepper statt Vollbreite-Feld) — Richtung mit dem Nutzer abstimmen (C2) |
| B4/B5 | Handy | Seiten-Durchgang bei 390/412px mit Blick auf Dichte; Formular-Dialoge als `BottomSheet` |
| F9 | **Kompakter/minimalistischer** (Nutzerwunsch 2026-09-28) | Jede Seite darauf prüfen, wo viele Knöpfe/Dropdowns neben- oder untereinander stehen, und zusammenfassen: seltene Aktionen in ein „⋯“-Menü (z. B. Buchseite: Offline speichern, Bearbeiten, Löschen hinter „⋯“, nur „Weiterlesen“ + „Regale“ sichtbar), Filter/Einstellungen hinter einen „Filter“-Knopf oder aufklappbare Bereiche (Bibliotheks-Werkzeugleiste), selten genutzte Formularteile einklappbar. Erledigt: Regal-Auswahl als Dropdown (#514); Bibliotheks-Werkzeugleiste einzeilig mit Icon-Ansicht und aufklappbaren Filtern, Follower-Dialog ohne doppelten Schließen-Knopf (#515); Bearbeiten/Löschen/Offline/Sortieren überall als Icon-Knöpfe `.btn-icon`/`.btn-icon-sm` mit Tooltip + versteckter Beschriftung, Kommentar-Löschen in der Kopfzeile. Offen: „⋯“-Menü, wo trotzdem viele Aktionen zusammenkommen; Formulare mit einklappbaren Nebenbereichen. |

### Danach (Backlog, nicht in diesem Plan)

Themes Alexandria/Babylon (#358), Worldbuilding Premium Design (#269), Bibel-Seite (#239/#143),
EPUB Realistische Ansicht (#189), `app.css` gliedern, Regal-Deko, KI (#270/#14), native Apps (#15),
recipemaster.at-Vergleich (braucht lokale Chrome-Session).

## 4. Lokal testen mit echten Daten (so wurde der UI-Durchgang gemacht)

> **Lokal beim Nutzer (nicht Cloud):** Interaktionen im echten Browser des Nutzers (Brave) über die
> Claude-in-Chrome-Extension testen, nicht headless. Playwright nur, wo die Extension nicht reicht
> (z. B. 390px-Viewport, weil sich das maximierte Brave-Fenster nicht verkleinern lässt). Die Schritte
> unten beschreiben die Cloud-Umgebung.

Aus einer Cloud-Session sind die Live-API und externe Seiten meist gesperrt. Backend und Frontend lassen sich aber lokal starten:

1. **Abhängigkeiten:** `npm ci` in `backend/` und `tests/backend/`. Das .NET-10-SDK gibt es in der Cloud per `apt-get install -y dotnet-sdk-10.0`, der Download von dot.net ist dort gesperrt.
2. **`backend/.dev.vars`** (per gitignore ausgeschlossen, nur lokale Platzhalter):
   ```
   JWT_SECRET="local-dev-secret-not-for-production-use"
   PASSWORD_CODE_SECRET="local-dev-code-secret-not-for-production-use"
   RESEND_API_KEY=
   FRONTEND_URL="http://localhost:5289"
   ```
3. **Lokale D1 migrieren:** `cd backend && npx wrangler d1 migrations apply lumina-chronica-db --local`
4. **Backend:** `npx wrangler dev --local --port 8787 --ip 127.0.0.1`
5. **Frontend:** `ASPNETCORE_ENVIRONMENT=Development dotnet run --project frontend/LuminaChronica.Client --urls http://localhost:5289`.
   `wwwroot/appsettings.Development.json` zeigt bereits auf `http://127.0.0.1:8787`.
6. **Testdaten über die API:**
   - Nutzer: `POST /api/auth/register` (JSON: username, email, password). Den Token aus der Antwort merken.
   - Bücher: `POST /api/books/upload` (multipart, Pflicht: `title` und `file`, z. B. eine kleine `.md`-Datei).
   - Regal: `POST /api/shelves` (multipart, Pflicht: `name`).
   - Projekt: `POST /api/projects` (multipart, Pflicht: `title`, `type=WORLD`).
7. **Screenshots mit Playwright:** Das globale Paket `playwright` liegt unter `$(npm root -g)`, Chromium unter `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Für eingeloggte Seiten den Token per `addInitScript` in `localStorage["lumina_auth_token"]` setzen. Pro Seite bei 1280px und 390px aufnehmen und `document.documentElement.scrollWidth - innerWidth` prüfen, das deckt horizontales Überlaufen auf.
8. **Stolperfallen:**
   - Nach CSS- oder Razor-Änderungen muss der Dev-Server neu gestartet werden, weil gescoptes CSS beim Build gebündelt wird.
   - Den Server per PID beenden (`ps -eo pid,args | awk '/[b]lazor-devserver/ {print $1}'`), nicht per `pkill -f` mit einem Muster, das auch in der eigenen Shell-Befehlszeile steht.
   - Footer-Buttons im Dialog tragen den CSS-Scope der aufrufenden Komponente. Regeln in `Dialog.razor.css` brauchen deshalb `::deep`.

## 5. Kleine Notizen aus der Session (2026-09-27)

- **M-6:** Bei reinen Google/GitHub-Konten reicht die Sitzung als Nachweis für die Änderung der E-Mail-Adresse, die alte Adresse wird benachrichtigt. Vom Nutzer bestätigt: „reicht“.
- **H-1 und M-6** sind im Backend deployt (manueller `backend-deploy.yml`-Lauf).
- ~~Veraltete Zeile in `documentation/Roadmap.md`, Abschnitt Password-reset Phase 2~~: bereinigt 2026-09-28.
- **Review 2026-09-27:** Das vollständige Review liegt bewusst nur lokal beim Nutzer (`docs/reviews/`, nicht committet, weil das Repo öffentlich ist und es offene Sicherheitspunkte beschreibt). Umgesetzt sind K-1, K-2, H-1, M-1 bis M-4, M-6 bis M-8, N-1, N-2, N-11. Noch offen, ohne Details: M-5, M-9 (Rest), N-3 bis N-7, `.dev.vars.example`.
