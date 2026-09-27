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
| A1 | Projekt-Detailkopf wie BookDetail, Detail-Köpfe stapeln auf dem Handy | PR #501 im Review |
| A2 | **Sprachauswahl**: Combobox mit ISO-639-1-Liste, Namen über `Intl.DisplayNames`, Suche beim Tippen, „Eigene Sprache“ als Ausnahme; bestehende Freitext-Werte bleiben gültig; Anzeige als Name statt Code (Upload, Bearbeiten, Detail, Bibliotheks-Karten) | offen |
| A3 | **Projekt bearbeiten als Dialog** (wie Buch/Regal), statt Inline-Formular | offen |
| A4 | **Bibliotheks-Werkzeugleiste entzerren**: Suche breit, Filter/Sortierung gebündelt, Ansicht (Regal/Raster/Größe) als eigene Gruppe; eindeutige Beschriftungen („Sortieren: Hinzugefügt“) | offen |
| A5 | **Worldbuilding-Formulare** (Charakter, Ort, Lore, Zeitleiste, Dateien): Screenshot-Befund, gleiche Muster (Dialog statt Inline, wo sinnvoll; Dropzones; Abschnitte) | offen |
| A6 | **Suche vereinheitlichen** (Bibliothek, Entdecken, Metadaten): Löschen-Button im Feld, Debounce, leere Zustände | offen |
| A7 | **Einstellungen** (Rest aus #358): Theme-Vorschau-Karten, Benachrichtigungen gruppiert | offen |

### Block B — Handy (#493)

| # | Schritt | Status |
|---|---|---|
| B1 | Grundlagen: Breakpoint-Tokens (compact <600 / medium 600–839 / expanded ≥840), `viewport-fit=cover`, Safe-Area, `dvh`; kein horizontales Scrollen mehr auf irgendeiner Seite | offen |
| B2 | **Schwebende Bottom-Navigationsleiste** unter 600px, oben keine Navbar; Home, Bibliothek, Projekte, Entdecken, Mehr (Statistik, Offline, Einstellungen, Profil, Benachrichtigungen, Impressum); im Reader ausgeblendet; optional Minimieren beim Scrollen | offen |
| B3 | Navigation Rail für 600–839px (Tablet hochkant) | offen |
| B4 | Seiten-Durchgang bei 390px/412px, jede Seite einzeln (inkl. Tab-Leisten, Werkzeugleisten, Tabellen) | offen |
| B5 | Dialoge auf dem Handy als Bottom-Sheet | offen |

### Block C — Statistik (#498)

C1 Befund per Screenshots in allen Themes → C2 Richtung mit dem Nutzer abstimmen → C3 Umsetzung.

### Block D — Logo & Favicon (#497)

D1 3–5 Kandidaten als SVG → D2 Vergleichsseite, der Nutzer wählt → D3 alle Größen + Header + E-Mail-Logo ersetzen.

### Block E — Kleinere offene Punkte

- Reader- und Toast-Meldungen nutzen noch kurze echte Verzögerungen (nicht deploy-blockierend).
- `user_settings.language` wird nie geschrieben → E-Mails immer Deutsch.
- CI als Pflicht-Check in den Branch-Regeln (Repo-Einstellung des Nutzers).
- Resend-Domain-Verifizierung für `luminachronica.com` (Stand unbekannt).

### Danach (Backlog, nicht in diesem Plan)

Themes Alexandria/Babylon (#358), Worldbuilding Premium Design (#269), Bibel-Seite (#239/#143),
EPUB Realistische Ansicht (#189), `app.css` gliedern, Regal-Deko, KI (#270/#14), native Apps (#15),
recipemaster.at-Vergleich (braucht lokale Chrome-Session).

## 4. Lokal testen mit echten Daten (so wurde der UI-Durchgang gemacht)

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
- **Veraltete Zeile** in `documentation/Roadmap.md`, Abschnitt Password-reset Phase 2: „Not yet started: Phase 3 …“. Die Phasen 3 bis 5 sind inzwischen erledigt; beim nächsten Doku-Update bereinigen.
