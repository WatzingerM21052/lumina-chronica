Du machst eine vollständige Analyse des Repos lumina-chronica (Blazor-WASM-Frontend auf GitHub Pages + Cloudflare-Workers/Hono/D1-Backend). Antworte und schreibe auf DEUTSCH.

Schwerpunkt: Wie lassen sich Design, Struktur und UX der App verbessern und moderner machen? Code-Bugs sind zweitrangig; die wurden am 2026-09-27 schon separat geprüft, siehe den Umsetzungsstand in `docs/superpowers/plans/2026-09-27-ui-ux-mobile-roadmap.md`.

Bitte analysiere gründlich:
1. **Design-System & Styles**: `frontend/LuminaChronica.Client/wwwroot/Styles` und die `*.razor.css`-Dateien. Prüfe Tokens (Farben, Radius, Schatten, Abstände, Typo), die vier Themes und Konsistenz. Wo wird hartkodiert statt Tokens zu nutzen, und wo gibt es Doppelungen?
2. **Interaktionsmuster**: Unterseiten vs. Dialoge/Modale/Sheets/Drawer, Inline-Editing, Toasts, Empty States, Loading-States und Formulare. Wo würde ein Dialog, ein Sheet, Inline-Editing oder eine Command-Palette die App deutlich moderner machen? Gib konkrete Seiten und Flows an (Bibliothek, Buchdetail, Projekte, Welt-/Lore-Seiten, Profil, Einstellungen, Discover, Statistik).
3. **Die Dialog-Primitive** (`Components/Dialog`): Bewerte die API und schlage die Zielarchitektur vor. Zu klären sind: natives `<dialog>` vs. CSS-Overlay, Fokus-Trap/-Rückgabe, Stacking, Sheet-Variante für Mobile, Motion und reduced-motion.
4. **Informationsarchitektur & Navigation**: NavMenu, Seitenhierarchie, URL-Struktur, Wege zu den Kernaktionen. Was ist umständlich?
5. **Komponenten-Struktur & Techniken**: Wiederverwendung, zu große Razor-Dateien (z. B. `BookDetail.razor`), Zustandsverwaltung, i18n-Muster, JS-Interop. Welche Refactorings würden Design-Änderungen billiger machen?
6. **Mobile & Barrierefreiheit**: Touch-Ziele, Breakpoints, Kontrast, Tastaturbedienung.
7. **Docs**: `docs/`, `documentation/` (Roadmap, Architecture, Database), die Specs in `docs/superpowers/specs`, README und CHANGELOG. Was ist veraltet, widersprüchlich oder fehlt?
8. **Ideen-Backlog**: Profil-Redesign (Dark Mode, 2 Spalten), KI-Vorschläge für Tags/Genres, Buchsuche/-import über eine externe API, Datenschutz/Impressum professioneller. Wie passen diese Ideen in eine moderne Gesamtrichtung, und in welcher Reihenfolge sollten sie angegangen werden?

Regeln:
- Nur lesen und analysieren. Nichts deployen, keine Migrationen, nicht auf `main` pushen, keine PRs mergen.
- Tests darfst du laufen lassen: `cd tests/backend && npm ci && npx vitest run` und `dotnet test tests/frontend/LuminaChronica.Client.Tests.csproj`.
- Jede Aussage belegst du mit `Datei:Zeile`. Unsicheres markierst du als [Vermutung].
- Designreferenzen wie recipemaster.at sind Inspiration, keine Vorlage zum Kopieren.

Ergebnis: Schreib das Dokument `docs/reviews/2026-09-27-fable-design-analysis.md` mit folgenden Teilen:
- Zusammenfassung
- Ist-Analyse pro Bereich
- konkrete Verbesserungsvorschläge mit Aufwand (S/M/L) und Nutzen, wo sinnvoll mit ASCII-Skizzen der Layouts
- vorgeschlagene Zielarchitektur für Dialoge und Design-System
- priorisierte Roadmap in Phasen

Committe das Dokument auf einem neuen Branch `review/fable-design-analysis`, pushe den Branch und öffne einen **Draft-PR** gegen `main` (nicht mergen).

Schreib ganz oben ins Dokument, welches Modell du laut deiner System-Umgebung bist.
