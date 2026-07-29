# Lumina Chronica — Extracted Technical Specification Summary

> Source: Master Project Bible, Teile 3–9 (PDFs in `Docs/`). This file consolidates ALL concrete, actionable technical detail extracted from those documents for use in scaffolding the real repository. Exact names/casing/hex values are preserved verbatim from source wherever given. The source documents are written in German; German terms are preserved alongside an English gloss where useful. Where a document specifies nothing for a requested category, that is stated explicitly rather than the section being omitted.
>
> Status: COMPLETE — all 7 source documents (Teil 3, Teil 4, Teil 5, Implementation Blueprint, AI Development Guidelines, Teil 8, Teil 9) have been fully read and extracted. See "Open Questions / Ambiguities" at the bottom for gaps, contradictions, and decisions a human needs to make before scaffolding.

---

## Teil 4 — Database Design & API Specification

Source: `Lumina Chronica Database Design & API Specification Teil 4.pdf` (21 pages, read directly in full). Sections in source: §43–§58.

### 43. Database Philosophy

Strict separation between four kinds of data (§43.1 Grundprinzip):
1. Inhaltliche Daten (content data)
2. Benutzerbezogene Daten (user-related data)
3. Dateien (files)
4. Berechtigungen (permissions)

Example given: "Ein Buch besteht aus: Buchinhalt + Metadaten + Benutzerinteraktionen + Datei" — these are stored separately.

**Storage separation (§43.2):**

| Store | Used for (verbatim list) |
|---|---|
| **Cloudflare D1** | Benutzer (users), Bücherinformationen (book info), Beziehungen (relationships), Fortschritte (progress), Einstellungen (settings), Projekte (projects) |
| **Cloudflare R2** | EPUB Dateien, PDFs, Cover, Bilder (images), Karten (maps), Projektdateien (project files) |

**Database Philosophy Summary (end of doc, verbatim):**
```
D1 = Information
R2 = Files
API = Security + Logic
Frontend = Experience
```

### 44. Entity Relationship Overview

Verbatim ASCII ER tree from source:

```
USER
 |
 +---- BOOK
 |
 +---- SHELF
 |
 +---- PROJECT
 |
 +---- READING_PROGRESS
 |
 +---- STATISTICS

BOOK
 |
 +---- BOOK_FILE
 |
 +---- BOOK_TAG
 |
 +---- BOOK_RATING
 |
 +---- COMMENT

PROJECT
 |
 +---- CHARACTER
 |
 +---- LOCATION
 |
 +---- TIMELINE_EVENT
 |
 +---- PROJECT_FILE
```

### 45–51. Database Tables (D1 / SQLite)

All tables below are exactly as named in source (lowercase snake_case). Where the source gives only a bare field list (no explicit type), it is marked "type not specified" — do not assume INTEGER/TEXT.

#### `users` (§45.1)
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER | Primärschlüssel (primary key) |
| username | TEXT | Öffentlicher Name (public name) |
| email | TEXT | Login-Adresse |
| password_hash | TEXT | Verschlüsseltes Passwort (hashed password) |
| avatar_url | TEXT | Profilbild |
| role_id | INTEGER | Benutzerrolle (user role) |
| created_at | DATETIME | Erstellung |
| last_login | DATETIME | Letzte Anmeldung |

Example JSON:
```json
{
"id":1,
"username":"Matthias",
"email":"example@mail.com",
"role":"USER"
}
```
Note: example shows `"role":"USER"` as a string even though the table has `role_id INTEGER` — implies a joined/denormalized view in API responses vs. the raw FK in storage.

#### `roles` (§45.2)
| Feld | Typ |
|---|---|
| id | INTEGER |
| name | TEXT |
| permissions | JSON |

Role name examples given: `USER`, `AUTHOR`, `MODERATOR`, `ADMIN`.

#### `user_settings` (§45.3)
| Feld | Typ |
|---|---|
| id | INTEGER |
| user_id | INTEGER |
| theme | TEXT |
| reader_mode | TEXT |
| font_size | INTEGER |
| language | TEXT |

Example:
```json
{
"theme":"paper",
"reader_mode":"book",
"font_size":18
}
```
Note: `"theme":"paper"` here does not match the theme names given in Teil 5 (Classic Library / Modern Light / Dark Library / System) — flagged in Open Questions.

#### `books` (§46.1)
| Feld | Typ | Beschreibung |
|---|---|---|
| id | INTEGER | ID |
| owner_id | INTEGER | Besitzer (owner) |
| title | TEXT | Titel |
| author | TEXT | Autor |
| description | TEXT | Beschreibung |
| cover_url | TEXT | Cover |
| language | TEXT | Sprache |
| genre | TEXT | Genre |
| visibility | TEXT | Sichtbarkeit |
| created_at | DATETIME | Datum |

Visibility enum values: `PRIVATE`, `SHARED`, `PUBLIC`.

#### `book_files` (§46.2)
| Feld | Typ |
|---|---|
| id | INTEGER |
| book_id | INTEGER |
| file_url | TEXT |
| format | TEXT |
| size | INTEGER |

Example: `{"format":"EPUB","size":523400}`

#### `book_metadata` (§46.3)
| Feld | Typ |
|---|---|
| id | INTEGER |
| book_id | INTEGER |
| isbn | TEXT |
| publisher | TEXT |
| release_date | DATE |
| pages | INTEGER |

#### `tags` (§46.4)
| Feld | Typ |
|---|---|
| id | INTEGER |
| name | TEXT |

Examples given: Fantasy, Romance, Science Fiction, History.

*(Note: source renders the table name oddly split as "t / ags" due to a PDF layout artifact — the intended name is `tags`.)*

#### `book_tags` (§46.4, many-to-many)
Source label shows as `t_book_tags` due to the same PDF split artifact as above (a leading "t" from "Book Tags Table" bled into the code block) — the intended table name is almost certainly **`book_tags`**, consistent with how it's referenced in §44's ER overview (`BOOK_TAG`). Flagged in Open Questions as needing confirmation.

| Feld |
|---|
| book_id |
| tag_id |

#### `shelves` (§47.1)
| Feld | Typ |
|---|---|
| id | INTEGER |
| owner_id | INTEGER |
| name | TEXT |
| description | TEXT |
| cover_url | TEXT |
| visibility | TEXT |

Examples: Fantasy Sammlung, Schulbücher, Lieblingswerke.

#### `shelf_books` (§47.2, many-to-many)
| Feld |
|---|
| shelf_id |
| book_id |

#### `reading_progress` (§48.1)
| Feld | Typ |
|---|---|
| id | INTEGER |
| user_id | INTEGER |
| book_id | INTEGER |
| chapter | INTEGER |
| position | FLOAT |
| percentage | FLOAT |
| last_opened | DATETIME |

Example: `{"book":"Der Hobbit","chapter":5,"percentage":67}`

#### `bookmarks` (§48.2) — explicitly marked **"Spätere Version"** (later version, i.e. not V1)
| Feld |
|---|
| id |
| user_id |
| book_id |
| location |
| note |

(No types given — not specified in this document.)

#### Highlights — (§48.3) — explicitly marked **"Spätere Version"**, no table name given, only a description: stores "markierte Textstellen" (highlighted text passages) and "persönliche Notizen" (personal notes). No field list.

#### `projects` (§49.1)
| Feld | Typ |
|---|---|
| id | INTEGER |
| owner_id | INTEGER |
| title | TEXT |
| description | TEXT |
| type | TEXT |
| cover_url | TEXT |
| visibility | TEXT |

Projektarten (project type enum): `WORLD`, `NOVEL`, `RPG`, `CUSTOM`.

#### `project_members` (§49.2)
| Feld |
|---|
| project_id |
| user_id |
| permission |

Permission enum: `VIEW`, `EDIT`, `OWNER`.

#### `characters` (§49.3)
| Feld |
|---|
| id |
| project_id |
| name |
| description |
| image_url |
| age |
| origin |
| personality |
| biography |

(No types given.)

#### `locations` (§49.4)
| Feld |
|---|
| id |
| project_id |
| name |
| description |
| image_url |
| coordinates |

#### `timeline_events` (§49.5)
| Feld |
|---|
| id |
| project_id |
| title |
| description |
| date |

#### `project_files` (§49.6)
No field list given — only purpose: stores Karten (maps), Dokumente (documents), Bilder (images).

#### `followers` (§50.1, user-follows-user)
| Feld |
|---|
| follower_id |
| following_id |
| created_at |

#### `ratings` (§50.2)
| Feld |
|---|
| id |
| user_id |
| book_id |
| rating |
| created_at |

Rating range: 1–5 Sterne (stars).

#### `comments` (§50.3) — explicitly marked **"Spätere Version"**
| Feld |
|---|
| id |
| user_id |
| target_type |
| target_id |
| content |
| created_at |

(Polymorphic comment target via `target_type`/`target_id` — no enum of valid `target_type` values given.)

#### `user_statistics` (§51)
No field list given — only purpose: stores gelesene Bücher (books read), Lesedauer (reading duration), Seiten (pages), Aktivität (activity).

Example: `{"booksRead":50,"readingTime":3200}`

### 52–56. API Specification

**API Standard (§52):** Format = **REST + JSON**. Base URL = **`/api`**.

No versioning scheme, pagination convention, rate limiting, or standard error-response envelope is specified anywhere in this document — not specified in this document (flagged in Open Questions).

#### Authentication API (§53)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | Request body: `{"username":"User","email":"mail@test.com","password":"password"}` |
| POST | `/api/auth/login` | Response body: `{"token":"jwt-token","userId":1}` — implies JWT-based auth |

#### Book API (§54)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/books` | Query params: `?page=1&genre=fantasy&search=dragon` |
| POST | `/api/books/upload` | Multipart upload: Datei (file) + Metadaten (metadata) |
| GET | `/api/books/{id}` | Get single book |
| DELETE | `/api/books/{id}` | Delete book |

#### Reader API (§55)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/reading/{bookId}` | Get progress |
| POST | `/api/reading/update` | Body: `{"bookId":5,"chapter":3,"percentage":42}` |

#### Project API (§56)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List projects |
| POST | `/api/projects/{id}/characters` | Add character to project |

No other endpoints (shelves, tags, ratings, followers, comments, statistics, settings CRUD) are documented anywhere in this file, despite corresponding tables existing — not specified in this document (flagged in Open Questions).

### 57. Permission Logic

Every request checks, in order (verbatim flow):
```
Ist User eingeloggt?           (Is user logged in?)
↓
Hat User Zugriff?              (Does user have access?)
↓
Welche Rechte besitzt User?    (What rights does the user have?)
↓
Aktion erlauben/verweigern     (Allow/deny action)
```
No per-endpoint auth table (e.g. "this endpoint requires role X") is given beyond this generic 4-step logic plus the `PRIVATE/SHARED/PUBLIC` visibility enum on books/shelves/projects and the `VIEW/EDIT/OWNER` permission enum on project_members. Endpoint-level auth requirements (e.g. is `/api/books/upload` auth-required, is `GET /api/books` public) are **not specified explicitly** in this document — flagged in Open Questions.

### 58. Database Rules

**"Nie" (Never) — explicit rules, verbatim:**
- Dateien direkt in D1 speichern (Never store files directly in D1)
- Passwörter unverschlüsselt speichern (Never store passwords unencrypted)
- private Inhalte ohne Prüfung zurückgeben (Never return private content without a permission check)

### R2 bucket structure / key naming

**Not specified in this document.** The doc states *what* goes in R2 (EPUB files, PDFs, covers, images, maps, project files) and that `books.cover_url`, `book_files.file_url`, `characters.image_url`, `locations.image_url`, `shelves.cover_url`, `projects.cover_url` are URL/path fields pointing at stored files, but gives no exact R2 key/path naming convention (e.g. no `{userId}/{bookId}/cover.jpg`-style pattern). Flagged in Open Questions.

### Migration file naming convention

Only one example given, in the **Implementation Blueprint (Teil 7)** section, not Teil 4 itself: first migration is named **`001_initial.sql`** (see Teil 6/7 section below). Teil 4 itself gives no migration naming convention. Flagged in Open Questions since `001_initial.sql` (3-digit, no leading zeros pattern shown beyond that one example) is the only data point — Cloudflare D1's own tooling (`wrangler d1 migrations create`) actually generates `NNNN_name.sql` (4-digit) by default, which is not confirmed either way here.

---

## Teil 5 — UI/UX Design System & User Experience Specification

Source: `Lumina Chronica – UI-UX Design System Teil 5.pdf` (17 pages, read directly in full). Sections in source: §59–§72.

### Design Philosophy (§59)

Core design goal (§59.1): Lumina Chronica should not feel like a normal web app. Target feeling (verbatim German quote): **"Ich betrete meine persönliche digitale Bibliothek."** ("I am entering my personal digital library.")

The UI combines (verbatim):
```
Klassische Bibliothek
+
Modernes digitales Produkt
+
Persönlicher Kreativraum
```
(Classic Library + Modern digital product + Personal creative space)

**Design references (§59.2):**
- **Klassische Bibliothek** (Classic Library) inspiration elements: warme Farben (warm colors), Papieroptik (paper look/texture), elegante Schrift (elegant typeface), ruhige Atmosphäre (calm atmosphere), hochwertige Buchdarstellung (high-quality book presentation)
- **Moderne Apps** (Modern apps) inspiration:
  - Spotify → persönliche Sammlungen (personal collections), Empfehlungen (recommendations), Nutzererfahrung (user experience)
  - Notion → Organisation, Projekte, flexible Inhalte (flexible content)
  - Kindle → Lesekomfort (reading comfort), Reader-Fokus

**Explicitly NOT wanted (§59.3), verbatim list:**
- sterile Business-App
- überladenes Enterprise-System (overloaded enterprise system)
- Gaming-Oberfläche (gaming UI)
- Social-Media-Klon
- futuristisches Neon-Design

### Brand Identity (§60)

**Logo (§60.1):** Minimalist combination of: **Buch (Book) + Weltkarte/Globus (World map/Globe) + Lichtsymbol (Light symbol)**.

Symbolic meaning given:
- Buch → Wissen (knowledge), Geschichten (stories)
- Welt → Entdeckung (discovery), eigene Welten (own worlds)
- Licht → Lumina, Erkenntnis (insight/realization)

**Banner / Hero Design (§60.2):** For homepages/large areas. Elements: geöffnetes Buch (open book), dezente Weltkarte (subtle world map), Lichtstrahlen (light rays), alte Bibliotheksatmosphäre (old-library atmosphere).

### 61. Color System

**IMPORTANT:** This document does **not** give exact hex codes anywhere. Colors are specified only as **named color concepts**, not hex values. This is a significant gap for scaffolding CSS — flagged prominently in Open Questions.

**§61.1 Primary Theme** — direction: "Warme Bibliotheksfarben" (warm library colors). Named color concepts given (no hex):
```
Parchment Beige
Warm Brown
Dark Wood
Gold Accent
Soft White
```

**§61.2 Theme System** — user can select a theme. Four themes named, each with only qualitative properties (no hex, no token names):

| Theme name (exact, as in source) | Properties given (verbatim, translated) |
|---|---|
| **Classic Library** (marked "Standard" = default) | Beige Hintergrund (beige background), braune Elemente (brown elements), goldene Akzente (gold accents). Feeling: "Alte Bibliothek" (Old library) |
| **Modern Light** | hell (bright), minimalistisch, clean |
| **Dark Library** | dunkle Holztöne (dark wood tones), angenehmer Nachtmodus (pleasant night mode) |
| **System** | Übernimmt Betriebssystem (follows OS theme preference) |

No color tokens (background/surface/text-primary/text-secondary/border/accent/success/warning/error) are defined for any theme, and no hex values exist anywhere in the document. This entire sub-area is left to implementation discretion — flagged in Open Questions as the single biggest gap for scaffolding actual CSS/theme files.

### 62. Typography System

Goal (§62.1 intro): "Lesbarkeit zuerst" (Readability first).

**UI Typography (§62.1)** — for: Menüs (menus), Buttons, Einstellungen (settings). Properties (qualitative only): modern, klar (clear), gut lesbar (well readable). **No specific font family named for UI text.**

**Book Typography (§62.2)** — for the Reader. Options: Serifenschriften (serif typefaces), klassische Buchschriften (classic book typefaces), moderne Leseschriften (modern reading typefaces). Example fonts given (exact names, verbatim):
```
Literata
Merriweather
Georgia
System Serif
```
These four are given as *examples/options* for reader body text, not a definitive single choice — flagged in Open Questions (which one is default?).

**Text Hierarchie (§62.3)** — only abstract levels named, no px/rem sizes or weights given anywhere:
```
H1: Große Überschrift     (Large heading)
H2: Bereich                (Section)
Body: Normaler Text        (Normal text)
Caption: Zusatzinformationen (Additional information)
```
No exact font sizes, weights, or line-heights are specified anywhere in the document — flagged in Open Questions.

### 63. Global Layout

**Main Application Layout (§63.1)** — verbatim ASCII layout:
```
------------------------------------------------
Logo                    Navigation      Profile
------------------------------------------------

                  Content Area

------------------------------------------------
Footer
------------------------------------------------
```

**Navigation (§63.2)** — main nav items, in order, each with a literal emoji icon in source (codepoints confirmed via byte-level PDF decoding, cross-checked across two independent extraction passes):

| Nav item (German) | Icon | Unicode codepoint |
|---|---|---|
| Home | 🏠 | U+1F3E0 |
| Bibliothek (Library) | 📚 | U+1F4DA |
| Projekte (Projects) | 🌎 | U+1F30E (globe showing Americas) |
| Entdecken (Discover) | 🌍 | U+1F30D (globe showing Europe-Africa — distinct emoji from Projekte's, not a typo) |
| Statistik (Statistics) | 📊 | U+1F4CA |
| Profil | 👤 | U+1F464 |
| Einstellungen (Settings) | ⚙ | U+2699 |

No icon library/set (e.g. Lucide, Font Awesome, Material Icons) is named anywhere — the nav uses literal emoji characters, not a systematized icon font/SVG set. The mobile bottom nav (§63.3) has no icons at all, only text labels.

**Responsive Navigation (§63.3):**
- Desktop: Sidebar oder Top Navigation (sidebar or top nav — not decided which)
- Tablet: kompakte Sidebar (compact sidebar)
- Mobile: Bottom Navigation, items: Home, Bibliothek, Projekte, Suche (Search), Profil

### 64. Page Specifications (full page/screen list with descriptions)

#### 64.1 Home Dashboard
Ziel (goal): Persönlicher Einstiegspunkt (personal entry point).

Layout (verbatim structure):
```
Willkommen zurück      (Welcome back)
Weiterlesen            (Continue reading)
[ Buchkarte ]          (Book card)
Deine Bibliothek       (Your library)
[ Statistik ]
Empfehlungen           (Recommendations)
Aktuelle Projekte      (Current projects)
```

Components on this page:
- **Continue Reading Card** — shows: Cover, Titel, Fortschritt (progress), letzte Position (last position)
- **Library Overview** — shows: Anzahl Bücher (book count), Regale (shelves), gelesene Bücher (books read)
- **Discover Section** — shows: Empfehlungen (recommendations), Trends

#### 64.2 Library Page
Described as: "Wichtigster Verwaltungsbereich" (most important management area).

Views (Ansichten):
- **Grid View** — `[Cover] [Cover] [Cover]` / `Titel Titel Titel`
- **List View** — `Cover | Titel | Autor | Fortschritt`
- **Custom View** — marked "Später" (later version): benutzerdefinierte Layouts (user-defined layouts)

#### 64.3 Book Detail Page
Layout (verbatim structure):
```
   COVER

Titel
Autor
Genre
Tags

Beschreibung
Kapitel

[ Lesen beginnen ]     (Start reading)
```
Additional info shown: Bewertung (rating), Statistiken, ähnliche Bücher (similar books).

#### 64.4 Reader UI
Described as: "Der wichtigste Bildschirm" (the most important screen).

**Reader Principles** — the reader must: ruhig wirken (feel calm), Ablenkung vermeiden (avoid distraction), angenehm lesbar sein (be pleasantly readable).

**Reader Layout** (verbatim):
```
Zurück   Kapitel   Einstellungen     (Back / Chapter / Settings)

              Buchinhalt              (Book content)

Seite   Fortschritt   Navigation      (Page / Progress / Navigation)
```

**Reader Controls** — functions: Kapitel wechseln (change chapter), Schrift ändern (change font), Theme ändern (change theme), Lesezeichen (bookmarks), Vollbild (fullscreen).

**Page Turning Mode** (optional) — animation: "Seite wird umgeblättert wie echtes Buch" (page turns like a real book).

#### 64.5 Project Page
Ziel: Kreativer Arbeitsbereich (creative workspace). Example structure (project named "Aldoria" in example):
```
Aldoria
Übersicht    (Overview)
Karte        (Map)
Charaktere   (Characters)
Orte         (Locations)
Timeline
Dokumente    (Documents)
Bücher       (Books)
```

#### 64.6 Character Page
Layout: Bild (Image), Name, Kurzbeschreibung (short description), Eigenschaften (traits), Geschichte (history/backstory), Beziehungen (relationships).

### 65. Components Design

#### 65.1 Book Card
"Verwendet überall" (used everywhere). Contains: Cover, Titel, Autor, Fortschritt. **Variants (exact names): Small, Normal, Large.**

#### 65.2 Project Card
Contains: Bild, Titel, Beschreibung, Fortschritt.

#### 65.3 Shelf Card
Contains: Regalbild (shelf image), Name, Anzahl Bücher (book count).

#### 65.4 Modal System
Used for: Einstellungen (settings), Upload, Bearbeitung (editing). Design direction: nicht aggressiv (not aggressive), weich (soft), Bibliotheksstil (library style).

### The "4 mandatory UI states" pattern

**Not present in this document as an explicitly named "4 states" pattern.** No section titled anything like "Mandatory UI States" or enumerating exactly 4 required states (e.g. loading/empty/error/success) exists in Teil 5. The document does separately cover:
- **§70 Empty States** — "Leere Bereiche sollen hilfreich sein" (empty areas should be helpful). Example (verbatim):
  ```
  Deine Bibliothek ist noch leer.
  Füge dein erstes Buch hinzu
  und beginne deine Sammlung.
  [ Buch hinzufügen ]
  ```
- **§71 Error Design** — "Fehler sollen freundlich sein" (errors should be friendly). Explicit anti-example vs. example:
  - Not: `ERROR 500`
  - Instead: `Dein Buch konnte gerade nicht geladen werden. Bitte versuche es erneut.` (Your book could not be loaded right now. Please try again.)

No explicit "Loading state" or "Success/populated state" sections exist as named counterparts — if a "4 mandatory states" (loading/empty/error/success) pattern is required, only 2 of the 4 (Empty, Error) are documented here; Loading and Success/Content states are not explicitly specified as a formal pattern anywhere in Teil 5. **Flagged as a likely gap vs. the user's own recollection of a "4 mandatory UI states" concept — possibly defined in a different Teil (2, 3, or elsewhere) not covered by this extraction, or an implicit expectation not yet written down.** Flagged in Open Questions.

### CSS approach / component library

**Not specified in this document.** No mention of Tailwind, MudBlazor, Bootstrap, CSS custom properties/variables, BEM, or any other CSS methodology or component library anywhere in Teil 5. Flagged in Open Questions.

### Icon system

**Not explicitly named.** The navigation list (§63.2) shows icon glyphs next to each nav item (Home/Library/Projects/Discover/Statistics/Profile/Settings), implying an icon-per-nav-item convention, but no icon library/set (e.g. Lucide, Font Awesome, Material Icons, Heroicons) is named anywhere in the document, and no sizing convention is given. Flagged in Open Questions.

### 66. Animations

Grundprinzip (core principle): "Animationen sollen Atmosphäre schaffen" (animations should create atmosphere), not distraction.

**Erlaubt (Allowed):** sanfte Übergänge (smooth transitions), Hover-Effekte, Seitenwechsel (page transitions/page turns).

**Vermeiden (Avoid):** übertriebene Animationen (excessive animations), lange Ladeeffekte (long loading effects).

No exact durations, easing curves, or timing values are given anywhere — not specified in this document.

### 67. Accessibility

Must support: Tastatursteuerung (keyboard control), Screenreader, ausreichende Kontraste (sufficient contrast), skalierbare Schrift (scalable text). No specific WCAG level (A/AA/AAA) or contrast ratios are named — not specified in this document.

### 68. Mobile Experience

Priority order for mobile (verbatim, numbered):
```
1. Lesen        (Reading)
2. Bibliothek   (Library)
3. Projekte     (Projects)
4. Community
```

**Mobile Reader** optimized for: Hochformat (portrait orientation), Wischen (swiping), Offline-Nutzung (offline use).

### 69. User Experience Rules

Four numbered rules, verbatim:
- **Regel 1:** Der Benutzer soll immer wissen: "Wo bin ich?" (The user should always know: "Where am I?")
- **Regel 2:** Der nächste Schritt soll offensichtlich sein. (The next step should be obvious.)
- **Regel 3:** Komplexität verstecken. (Hide complexity.) Example: not "Metadatenverwaltung" (metadata management) but "Buch bearbeiten" (Edit book) — i.e., use task-oriented, plain-language labels instead of technical/administrative ones.
- **Regel 4:** Persönliche Inhalte fühlen sich persönlich an. (Personal content should feel personal.)

### 72. Final UX Principle

Closing principle for the entire app (verbatim, stated as a design mantra):
> **"Weniger Verwaltung. Mehr Bibliothek."** ("Less administration. More library.")

Document ends with literal marker: **"End of Part 5"**

### Spacing/layout system, breakpoints, border-radius, shadows, z-index

**Not specified anywhere in this document.** No spacing scale (4px/8px grid etc.), no container widths, no responsive breakpoint pixel values, no border-radius values, no shadow/elevation tokens, and no z-index scale are given anywhere in Teil 5. All flagged in Open Questions as needing to be defined by the implementer.

---

## Teil 6/7 — Implementation Blueprint & Development Plan

Source file on disk: `Lumina Chronica – Implementation Blueprint Teiil 7.pdf` (note double-"i" typo in filename). Extracted via background research agent (agent read the PDF directly). The document's own title page reads **"Teil 7 – Implementation Blueprint & Development Plan"** (internal section numbers §89–§111), so despite the user's task brief calling this "Teil 6/7", the document itself self-identifies as **Teil 7** — this collides with the separately-numbered "AI Development Guidelines Teil 7" file (see next section). This numbering collision is a real ambiguity in the source material, not a transcription error — flagged prominently in Open Questions.

19 pages, written in German with English section headers. Intentionally high-level: a phase/sprint roadmap, not a code cookbook. Contains no C#/Razor/SQL code bodies — only table names, one JSON snippet, and ASCII directory-tree pseudocode.

### 89. Development Philosophy

Core principle: Lumina Chronica is not built as one giant complete project. Development follows this cycle (verbatim):
```
Kleine funktionierende Version   (Small working version)
↓
Verbesserung                     (Improvement)
↓
Erweiterung                      (Extension)
↓
Professionalisierung             (Professionalization)
```

### 90. Development Strategy

**MVP First.** "Die erste Version muss bereits einen echten Nutzen bieten." (The first version must already provide real value.)
- Not: "Viele Features ohne fertiges Fundament" (Many features without a finished foundation)
- Instead: "Eine kleine, aber hochwertige Bibliothek" (A small but high-quality library)

### 91. Version Overview (full roadmap)

```
V0.1  Projektgrundlage           (Project foundation)
V0.2  Technisches Fundament      (Technical foundation)
V0.3  Persönliche Bibliothek     (Personal library)
V1.0  Digital Reader
V1.5  Komfort & Personalisierung (Comfort & personalization)
V2.0  Worldbuilding
V3.0  Community
V4.0  AI Features
V5.0  Mobile Apps
```

Note: this version list (V0.1/V0.2/V0.3/V1.0/V1.5/V2.0/V3.0/V4.0/V5.0) differs slightly from the Teil 9 milestone list (V0.1/V0.2/V0.5/V1.0/V1.5/V2.0/V3.0/V4.0/V5.0 — Teil 9 has **V0.5 "Bibliothek MVP"** where this document has **V0.3 "Persönliche Bibliothek"**). Flagged as a contradiction in Open Questions.

### 92. Phase 0 — Project Setup

Goal: professional dev environment.

**Repository** — create:
```
Lumina-Chronica/
```
Structure:
```
frontend/
backend/
database/
documentation/
tests/
```

**Git Setup** — establish: `main` branch, `develop` branch, GitHub Actions, README.

**Documentation** — create:
```
README.md
Architecture.md
Roadmap.md
Database.md
```

### 93. Phase 1 — Technical Foundation

**93.1 Frontend Setup** — Technologies: Blazor WebAssembly, .NET, Razor Components. Folder structure to create:
```
frontend/
  Pages/
  Components/
  Services/
  Models/
```
Implement: Routing, Layout, Navigation, Theme-System. First pages/routes:
```
/          Home
/library
/projects
/settings
/login
```

**93.2 Backend Setup** — "Cloudflare Worker erstellen" (create Cloudflare Worker). Set up: Worker project, API routing, environment variables. First API endpoint:
```
GET /api/status
```
Response (verbatim JSON):
```json
{
"status":"online"
}
```

**93.3 Database Setup** — Cloudflare D1. Create tables: `users`, `roles`, `settings`. First migration file, exact name: **`001_initial.sql`**.

**Phase 1 result checklist (verbatim):**
```
☑ Frontend läuft         (Frontend runs)
☑ Backend läuft          (Backend runs)
☑ Datenbank verbunden    (Database connected)
☑ Deployment funktioniert (Deployment works)
```

### 94. Phase 2 — Authentication System

Goal: users can have accounts. Implement: Registrierung (registration), Login, Logout, Sessionverwaltung (session management). New DB tables: `users`, `roles`, `user_settings`. New frontend pages: Login, Register, Profile. Result: a user can create an account / log in / see their profile.

### 95. Phase 3 — Library Core

Labeled **"Wichtigste Phase"** (most important phase) — "Hier entsteht die eigentliche Bibliothek" (this is where the actual library comes into being).

**95.1 Book Database** — implement tables: `books`, `book_files`, `book_metadata`.

**95.2 Book Upload** — functions: select file, upload, save, capture metadata. **V1 supported file formats (explicit):**
```
EPUB
PDF
TXT
Markdown
```

**95.3 Library Interface** — page: `/library`. Functions: display books, search, filter, sort. Views: Grid, List.

Result: "Der Benutzer besitzt eine digitale Bibliothek." (The user owns a digital library.)

### 96. Phase 4 — Reader System

Labeled **"Wichtigste Benutzerfunktion"** (most important user function).

**96.1 Basic Reader** — implement: EPUB rendering, PDF viewer, TXT/Markdown rendering.

**96.2 Reader Controls** — functions: Schriftgröße (font size), Theme, Navigation, Kapitel (chapters).

**96.3 Progress Saving** — persist: `book`, `chapter`, `position`, `percentage`.

Result: "Ein Benutzer kann Bücher lesen und später weitermachen." (A user can read books and continue later.)

### 97. Phase 5 — Organization System

Goal: personal order/organization.

- **Regale (Shelves)** — table: `shelves`. Functions: create/edit/delete/add books.
- **Tags** — implement tables: `tags`, `book_tags`.
- **Favoriten (Favorites)** — add table: `favorites`.

Result: "Die Bibliothek fühlt sich persönlich an." (The library feels personal.)

### 98. Phase 6 — Dashboard & Statistics

Goal: more overview. **Dashboard** page `Home` contains: zuletzt gelesen (recently read), Fortschritt (progress), Bibliotheksgröße (library size), Empfehlungen (recommendations). **Statistik** — implement table: `user_statistics`; displays: gelesene Bücher (books read), Seiten (pages), Zeit (time), Genres.

Result: "Der Nutzer sieht seine Entwicklung." (The user sees their progress/development.)

### 99. Phase 7 — Offline Reading

Goal: reading without internet. Technology named: Browser Storage, IndexedDB, Service Worker. Feature: "Offline Bücher" collection. Flow (verbatim):
```
Buch auswählen        (Select book)
↓
Offline speichern      (Save offline)
↓
Ohne Internet lesen     (Read without internet)
```

### 100. Version 1.0 Release — Definition of Done

**"Lumina Chronica V1.0 ist fertig wenn:"** (V1.0 is done when:) — verbatim checklist:
```
Benutzer
☑ Account erstellen
☑ Login
☑ Profil

Bibliothek
☑ Bücher hinzufügen
☑ Bücher verwalten
☑ Suchen
☑ Sortieren

Reader
☑ Bücher lesen
☑ Fortschritt speichern
☑ Themes

Organisation
☑ Regale
☑ Tags

Deployment
☑ GitHub Pages
☑ Cloudflare Backend
```

Note: this is the authoritative V1.0 scope boundary — everything below (V1.5+) is explicitly post-MVP.

### 101. Version 1.5 — Personal Experience

Goal: the app should feel personal.
- Erweiterte Themes (extended themes): eigene Farben (custom colors), eigene Reader Designs (custom reader designs)
- Verbesserter Reader (improved reader): Animationen, bessere Kapitelansicht (better chapter view), Lesezeichen (bookmarks)
- Erweiterte Statistik (extended statistics): Jahresübersicht (yearly overview), Lesekalender (reading calendar), Ziele (goals)

### 102. Version 2.0 — Worldbuilding System

Goal: Lumina Chronica becomes a creative tool. New main page: `/projects`.

**Projekte** — create/share/manage.

**Welten (Worlds)** — structure:
```
World
├── Map
├── Characters
├── Locations
├── Timeline
├── Lore
└── Books
```

**Charakterverwaltung (Character management)** — implement: Name, Bild (image), Beschreibung (description), Geschichte (history), Beziehungen (relationships).

### 103. Version 3.0 — Community

Goal: people share their works. Public library page: `/discover`. **Profile:** public books, projects, activities. **Social:** follow, ratings, comments.

### 104. Version 4.0 — AI Integration

Goal: AI as an assistant.
- **Reader AI** — functions: Zusammenfassung (summarization), Worterklärung (word explanation), Fragen beantworten (answering questions)
- **Creator AI** — functions: Charakterideen (character ideas), Lore-Vorschläge (lore suggestions), Konsistenzprüfung (consistency checking)

Explicit design principle (verbatim): **"KI unterstützt den Benutzer. KI ersetzt nicht die Kreativität."** (AI supports the user. AI does not replace creativity.)

### 105. Version 5.0 — Mobile Applications

Goal: native usage. Candidate frameworks listed as **options, not a decision**: .NET MAUI, Flutter, React Native. Target features: offline reading, synchronization, push notifications.

### 106–110. Recommended First Development Sprint (explicit sprint plan)

**Sprint 1** (Dauer/Duration: 1–2 Wochen):
```
☑ Repository erstellen
☑ Blazor Projekt erstellen
☑ Cloudflare Worker erstellen
☑ D1 Datenbank verbinden
☑ Grundlayout bauen
☑ Navigation erstellen
☑ Erste Deployment Pipeline
```
Sprint result: "Eine leere, aber funktionierende Lumina-Chronica-App." (An empty but functioning app.)

**Sprint 2 — Authentication:** Login, Registrierung, Benutzerprofil, Rollen.

**Sprint 3 — Bibliothek:** Buchmodell (book model), Upload, Speicherung (storage), Anzeige (display).

**Sprint 4 — Reader:** EPUB, PDF, Fortschritt (progress).

**Sprint 5 — Polishing:** Design, Themes, Fehlerbehandlung (error handling), Mobile Optimierung.

### 111. Final Development Rule

"Jede Version muss:" (Every version must:)
```
1. Nutzbar sein                              (Be usable)
2. Stabil sein                                (Be stable)
3. Dokumentiert sein                          (Be documented)
4. Eine Grundlage für die nächste Version bilden (Form a foundation for the next version)
```

Final vision statement (verbatim):
> Lumina Chronica beginnt als: **"Eine kostenlose persönliche Online-Bibliothek."**
> und entwickelt sich zu: **"Einer vollständigen Plattform für Lesen, Wissen, Kreativität und eigene Welten."**

Document ends with literal marker: **"End of Part 7"**

### Coding patterns / component templates / service layer patterns / architectural patterns / testing guidance

**None of these are present in this document.** Specifically:
- **Coding patterns/examples:** none beyond the one JSON stub, the `GET /api/status` route, the `001_initial.sql` filename, and ASCII folder/entity trees. No C#, Razor, JS/TS, or full SQL statements anywhere.
- **Component templates:** none — no `.razor`/`.razor.cs` pairing convention, no base classes, no naming convention beyond the bare `Pages/ Components/ Services/ Models/` folder list.
- **Service layer patterns:** none — no interfaces named, no DI setup shown, no repository pattern illustrated. `Services/` folder is named but its internal organization is not described.
- **Named architectural patterns:** none — no MVVM, Clean Architecture, Repository, CQRS, vertical slices, etc. named anywhere.
- **Testing guidance:** none — no framework named (no xUnit/bUnit/etc.), no test naming/structure guidance. Only a bare empty `tests/` folder appears in the repo structure with no further description.
- **State management / HTTP client / validation:** not discussed anywhere.
- **Error handling:** named only as a Sprint 5 checklist bullet ("☑ Fehlerbehandlung") with zero implementation detail.

These gaps are flagged collectively in Open Questions — if actual code patterns/component templates are needed, they are not present in this Teil and were not found elsewhere in the documents processed so far.

---

## Teil 9 — GitHub Project Management & Issue System

Source: `Lumina Chronica – Master Project Bible Teil 9.pdf` (9 pages, extracted via background research agent). This is the final part of the 9-part series and self-identifies internally as **"Teil 9 – GitHub Project Management & Issue System."** It is entirely process/tooling documentation (not vision/architecture/appendix/glossary as might have been guessed) — it defines how development work is organized and tracked on GitHub. Sections in source: §127–§136. Document ends with literal marker "End of Part 9," confirming this is the final part with nothing following it.

### §127. Ziel (Goal)

GitHub is the "zentrale Entwicklungsplattform" (central development platform). All tasks are organized via: Projects, Milestones, Epics, Issues, Pull Requests. Explicit rule (verbatim): **"Es werden keine größeren Änderungen ohne entsprechendes Issue umgesetzt."** (No larger changes are implemented without a corresponding issue.)

### §128. Projektstruktur (Project Structure)

```
Lumina Chronica
├── Epic
├── Milestone
├── Feature
├── Issue
└── Pull Request
```

### §129. Labels (full taxonomy, exact values)

**Typ (Type):** feature, bug, enhancement, documentation, refactoring, performance, security, design, testing

**Bereich (Area):** frontend, backend, database, reader, library, projects, community, authentication, statistics, ui, api, deployment

**Priorität (Priority):** priority-critical, priority-high, priority-medium, priority-low

**Version:** v0.1, v0.2, v1.0, v1.5, v2.0, v3.0, v4.0, v5.0

**Aufwand (Effort):** XS, S, M, L, XL

### §130. Epics (full ordered list — 18 total, names only, no descriptions given)

| # | Epic |
|---|---|
| 1 | Foundation |
| 2 | Frontend |
| 3 | Backend |
| 4 | Authentication |
| 5 | Library |
| 6 | Reader |
| 7 | Organization |
| 8 | Dashboard |
| 9 | Projects & Worldbuilding |
| 10 | Discovery |
| 11 | Community |
| 12 | Statistics |
| 13 | Offline |
| 14 | Artificial Intelligence |
| 15 | Mobile |
| 16 | Deployment |
| 17 | Documentation |
| 18 | Quality Assurance |

### §131. Milestones (full ordered list)

| Milestone | Description (German verbatim) | Gloss |
|---|---|---|
| V0.1 | Projektstart | Project start |
| V0.2 | Technisches Fundament | Technical foundation |
| V0.5 | Bibliothek MVP | Library MVP |
| V1.0 | Reader Release | Reader release |
| V1.5 | Personalisierung | Personalization |
| V2.0 | Worldbuilding | Worldbuilding |
| V3.0 | Community | Community |
| V4.0 | KI | AI |
| V5.0 | Mobile | Mobile |

*Note: contradicts the version list in the Implementation Blueprint (Teil 7 §91), which has V0.1/V0.2/V0.3/V1.0 instead of V0.1/V0.2/V0.5/V1.0 — see Open Questions.*

### §132. Standard-Issue-Template

Every issue follows this structure (verbatim fields):
- **Titel** — "Kurzer, präziser Titel." (Short, precise title.)
- **Beschreibung** — "Was soll umgesetzt werden?" (What should be implemented?) / "Warum wird diese Funktion benötigt?" (Why is this feature needed?)
- **Ziele** — "Welche Ergebnisse werden erwartet?" (What results are expected?)
- **Technische Anforderungen** — betroffene Komponenten (affected components), Datenbankänderungen (DB changes), API-Anpassungen (API adjustments), UI-Änderungen (UI changes)
- **Nicht Bestandteil** (Out of scope) — "Klare Abgrenzung des Umfangs." (Clear delimitation of scope.)
- **Akzeptanzkriterien** (Acceptance Criteria) — "Messbare Kriterien, wann das Issue abgeschlossen ist." (Measurable criteria for completion.)
- **Abhängigkeiten** (Dependencies) — references to other issues/epics.
- **Labels** — must be tagged across all 5 categories: Typ, Bereich, Priorität, Version, Aufwand.
- **Definition of Done** (checklist, verbatim):
  - Code implementiert
  - Tests erfolgreich
  - Dokumentation aktualisiert
  - Review abgeschlossen
  - Merge erfolgt

### §133. Nummerierungsstrategie (Issue Numbering Strategy)

| Issue Number Range | Area |
|---|---|
| #0001–0099 | Foundation |
| #0100–0199 | Frontend |
| #0200–0299 | Backend |
| #0300–0399 | Authentication |
| #0400–0499 | Library |
| #0500–0599 | Reader |
| #0600–0699 | Organization |
| #0700–0799 | Dashboard |
| #0800–0899 | Worldbuilding |
| #0900–0999 | Community |
| #1000–1099 | AI |
| #1100–1199 | Mobile |
| #1200–1299 | Documentation |
| #1300–1399 | Testing & QA |

**Gap noted in source structure:** Epics "Discovery" (#10), "Statistics" (#12), "Offline" (#13), and "Deployment" (#16) from §130 have no corresponding numeric range here — the table jumps from Worldbuilding directly to Community, AI, Mobile, Documentation, Testing & QA. Flagged in Open Questions.

### §134. GitHub Projects Workflow (board columns, in order)

```
Backlog → Ready → In Progress → Review → Testing → Done
```
(Each column has an emoji icon in source; icons for "In Progress" and "Testing" did not extract cleanly as identifiable Unicode — column names/order are reliable, exact icon glyphs are not.)

Optional additional columns: Ideas, Blocked, Future Version.

### §135. Release Workflow

"Jeder Release besitzt" (Every release includes): Milestone, Release Notes, Changelog, Versions-Tag (version tag), Dokumentationsprüfung (documentation review), Abschließende QA (final QA).

### §136. Langfristige Vision (Long-Term Vision)

Closing statement (verbatim, key sentences):
> "Das GitHub-Repository soll nicht nur Quellcode enthalten." (The GitHub repository should not contain only source code.)
> "Es soll gleichzeitig als vollständige technische Dokumentation, Roadmap und Wissensbasis für Lumina Chronica dienen." (It should simultaneously serve as complete technical documentation, roadmap, and knowledge base for Lumina Chronica.)
> "Jeder Entwickler oder jede KI soll das Projekt anhand der Dokumentation verstehen und neue Funktionen implementieren können, ohne grundlegende Architekturentscheidungen neu treffen zu müssen." (Every developer or AI should be able to understand the project via the documentation and implement new features without having to re-make fundamental architecture decisions.)

This is explicitly the stated purpose of the entire 9-part Master Project Bible series.

Document ends with literal marker: **"End of Part 9."**

---

## Teil 3 — Technical Architecture Specification

Source: `Lumina Chronica Technical Architecture Specification Teil 3.pdf` (extracted via background research agent). **This document is unusually short — 2 pages total, headed literally "SUMMARY."** It is a condensed architecture overview, not a granular technical spec. Confirmed complete (no additional pages, no embedded images/diagrams hiding extra detail, no alternate file). Much of the granular detail one would expect here (exact `wrangler.toml` bindings, `.razor` folder conventions, package versions, ports, router library) is **absent from this document** and was not found in any other Teil either — flagged prominently in Open Questions.

### Architecture Overview

Goal (verbatim, translated): modern, low-cost, scalable web app. Requirements: as-free-as-possible infrastructure, easy maintenance, easy extensibility, low operating cost, good performance, future scalability. **Final Architecture Decision: Static Frontend + Serverless Backend Architecture.**

### Repository structure (top level only)

Repository Model: **Monorepo**. Top-level structure given:
```
frontend/
backend/
shared/
documentation/
database/
scripts/
tests/
README.md
```
Stated rationale: supports Entwicklung (development), Dokumentation, Versionierung, Deployment, Zusammenarbeit (collaboration). **No subfolder structure below this top level is given anywhere in Teil 3.** Note this differs slightly from the Implementation Blueprint's Phase 0 repo structure (`frontend/ backend/ database/ documentation/ tests/` — no `shared/`, no `scripts/`) — see Open Questions.

### Frontend project structure

- Technology: **Blazor WebAssembly**
- Hosting: **GitHub Pages**
- Deploy chain (verbatim): `Git Push → GitHub Actions → Build Blazor WASM → Deploy GitHub Pages`
- Recommended (not mandated) folder categories: **Pages, Components, Services, Models, Styles**
- Frontend responsibilities: UI Darstellung (rendering), Navigation, Benutzerinteraktion (user interaction), Reader Interface, lokale Zustände (local state), API Kommunikation
- Explicit exclusions from frontend: direkte Datenbankzugriffe (direct DB access), geheime Schlüssel (secret keys), sensible Logik (sensitive logic) — these belong in the backend only

**Not specified:** exact `.razor` file/folder tree, file naming convention, component taxonomy beyond the bare category names, state-management library.

### Backend project structure

- Technology: **Cloudflare Workers**
- Folder/file categories: **routes, services, middleware, models, utils**
- Named route files (exact, verbatim, `.ts` extension):

| File | Domain |
|---|---|
| `auth.ts` | Authentication |
| `books.ts` | Books |
| `users.ts` | Users |
| `projects.ts` | Projects |
| `statistics.ts` | Statistics |

- Backend responsibilities: Authentifizierung, Autorisierung, API, Datenzugriff, Upload-Verarbeitung, Business Logic

**Router/framework library: not named anywhere** (no itty-router, Hono, etc.). The `.ts` extension implies TypeScript but this is inferred, not stated. Not specified: exact placement of `services/`/`middleware/`/`models/`/`utils/` relative to `routes/`, entrypoint filename (no `index.ts`/`worker.ts` named).

### Frontend/backend/D1/R2 wiring

- **D1**: SQLite-compatible, serverless, cheap ("günstig"). Stores: Benutzer, Bücher-Metadaten, Beziehungen, Fortschritte, Projekte, Einstellungen. Explicitly does **not** store: große Dateien, EPUB/PDF, Bilder.
- **R2**: for Buchdateien, Cover, Bilder, Projektdateien, Karten. Example top-level key prefixes named (only these two, no further nesting given): **`books/`** and **`projects/`**.
- Overall data-flow chain (verbatim): `USER → Blazor WebAssembly → GitHub Pages → Cloudflare Workers API → D1/R2/Auth`
- Auth flow (verbatim): `User Login → Provider → Token → Frontend session → API validates token → Access granted`
- API style: **REST**, base path **`/api/`**. Endpoint groups named only categorically: auth, books, reading progress, projects.

**No `wrangler.toml` is shown. No binding names (D1 binding, R2 bucket binding, KV, etc.) are given anywhere in this document.**

### Local dev setup expectations

Required tools (verbatim list): **.NET SDK; Visual Studio/Rider/VS Code; Node.js; Cloudflare Wrangler; SQLite Tools; Git; GitHub.** No versions, no install commands, no dev server ports, no package manager choice, no `wrangler dev`/`dotnet run` commands, no localhost URLs given.

Dev workflow (verbatim): `Feature Idee → Issue → Planung → Development Branch → Testing → Pull Request → Review → Merge`

### Build/deploy pipeline

- Frontend: GitHub Actions → GitHub Pages (chain given above).
- Backend: "Cloudflare Deployment/Worker Update" — stated only at this generality; no `wrangler deploy` command, no workflow YAML, no filenames given.
- Testing strategy named only categorically: Frontend (Komponenten, Navigation, Reader), Backend (API, Auth, Datenbank), plus "User Tests mit echten Nutzern" (user tests with real users). No framework names (no xUnit/bUnit/Playwright/Vitest etc.) anywhere.

### Environment variables / config

**None named anywhere in this document.** No `wrangler.toml`, no `appsettings.json`, no `.env`, no secret names, no config filenames. The only related concept is "Token" in the auth flow, with no header/cookie/variable name given.

### Naming conventions

**None stated.** No PascalCase/camelCase/kebab-case rule, no class-naming convention, no file-suffix/prefix convention. The only concrete naming evidence is the 5 backend route filenames and the folder names listed above — given as literal strings, not as general rules.

### Other concrete technical detail

| Item | Value |
|---|---|
| Frontend tech | Blazor WebAssembly |
| Frontend host | GitHub Pages |
| Backend tech | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite-compatible) |
| Object storage | Cloudflare R2 |
| API style | REST, base `/api/` |
| Auth candidates (priority order) | 1. Cloudflare Access/Auth Integration, 2. OAuth Provider, 3. eigenes Auth System (custom) |
| Permission model | Private, Shared, Public |
| Initial (v1) scale target | 100–1000 Bücher, 100–500 Nutzer |
| Future scale target | 10,000+ Nutzer, 100,000+ Bücher |
| Performance — frontend | Lazy Loading, Component Splitting, Caching, Pagination |
| Performance — backend | efficient queries, API pagination, response caching |
| Performance — storage | direct file URLs, CDN usage, compression |
| Security rules | never store passwords in plaintext, private files must not be public, validate all input, check permissions |
| Future mobile tech candidates | .NET MAUI, React Native, Flutter |
| Future search tech | own search indices, full-text search |
| Future AI | separate AI backend |
| Closing architectural principle | "Einfach starten, professionell skalierbar bleiben" (Start simple, remain professionally scalable) |

**No version numbers are given anywhere** — no .NET version, no Blazor version, no Workers runtime/compatibility date, no NuGet/npm package names beyond the unnamed router library gap above.

---

## AI Development Guidelines

Source file on disk: `Lumina Chronica – AI Development Guidelines Teil 7.pdf` (extracted via background research agent). **Numbering collision, important:** the document's own page-1 heading reads **"Teil 6 – AI Development Instructions & Coding Guidelines"** — i.e. the file is named "Teil 7" on disk but self-identifies internally as **Teil 6**. This directly collides with the Implementation Blueprint document (`Implementation Blueprint Teiil 7.pdf`), whose internal section numbering (§89–111) and title page self-identify as **Teil 7**. So there are two candidate "Teil 6/7" documents with conflicting self-identification. This is a genuine, unresolved ambiguity in the source material — flagged prominently in Open Questions. Content-wise this document is unambiguously the AI/coding-guidelines material (§73–88, 17 pages, ends with "End of Master Project Bible" — note: NOT "End of Part 6" or "End of Part 7").

### Framing

Opening statement (§73): the AI should not simply generate code — it should work as **Softwarearchitekt, Entwickler, UI/UX-Designer, Qualitätssicherer** (Software Architect, Developer, UI/UX Designer, Quality Assurance) simultaneously.

### Coding conventions (§76–78)

**Clean Code (§76.1)** — code must be lesbar/verständlich/wartbar (readable/understandable/maintainable). Explicit example:
```
Schlecht (bad):  var x = GetData();
Besser (better): var userLibrary = GetUserLibrary();
```

**Naming (§76.2)** — names must explain meaning:
```
Nicht (not):  BookManager2, DataHandler, Helper
Besser:       BookService, ReadingProgressService, StorageService
```

**Single Responsibility (§76.3):**
```
Nicht: BookService doing Upload + Database + UI + Authentication + Statistics (all in one class)
Besser: BookService, UploadService, StatisticsService (split apart)
```

**Reusable Components (§76.4):**
```
Nicht:  HomeBookCard, LibraryBookCard  (duplicated per-context components)
Besser: BookCard with variants: Small, Normal, Large
```

**Frontend component file structure (§77.1)** — exact convention:
```
Components/
  BookCard/
    BookCard.razor
    BookCard.razor.cs
    BookCard.css
```
i.e. one folder per component, containing `.razor`, `.razor.cs` code-behind, and `.css`, co-located.

**Backend API naming (§78.1):**
```
Nicht:  /api/getBooksNow
Besser: /api/books
```
(RESTful noun-based routes, not verb-decorated ad-hoc names — confirms the REST style stated in Teil 3/4.)

**State management (§77.2):**
```
Nicht:      globale Variablen (global variables), unkontrollierte Zustände (uncontrolled state)
Bevorzugt:  Services, Dependency Injection, klare Models (clear Models)
```

**UI empty-state example (§77.3)** — matches Teil 5's Empty States section almost verbatim:
```
Nicht nur: "Keine Bücher"
Sondern:   "Deine Bibliothek ist noch leer. Füge dein erstes Buch hinzu. [ Buch hinzufügen ]"
```

### Stack-specific "never touch without justification" list (§74.2) — critical rule

> Bereits getroffene Entscheidungen dürfen nicht ohne Grund geändert werden. Nicht automatisch ändern:
> - **Blazor WebAssembly**
> - **Cloudflare Architektur**
> - **Monorepo**
> - **D1 Datenbank**
> - **R2 Storage**
> - **modulare Struktur**

Translation: already-made decisions may not be changed without reason; do NOT automatically change: Blazor WebAssembly / Cloudflare architecture / Monorepo / D1 database / R2 storage / modular structure. If the AI believes a change to any of these is warranted, it must explicitly justify: Warum? (Why?) / Welche Vorteile? (What advantages?) / Welche Nachteile? (What disadvantages?) / Welche Auswirkungen? (What impacts?) before proceeding.

### Review process expectations

No formal human-reviewer role or CI-gate mechanics are defined. What is defined:
- **Issue Workflow (§81):** `Idea → Issue → Discussion → Implementation → Review`
- **Git Workflow (§80):** branches `main`, `develop`, `feature/name`, `bugfix/name`. Commit format: `type: description`, e.g. `feat: add book upload system`, `fix: repair reader progress saving`, `docs: update architecture bible`.
- **Quality Checklist Before Completion (§87)** — the de facto Definition of Done / pre-merge checklist, verbatim categories:
  - **Funktion**: Funktioniert Feature? Edge Cases behandelt?
  - **Code**: sauber? verständliche Namen? keine unnötigen Duplikate?
  - **UI**: Responsive? Loading State? Error State? Empty State?
  - **Sicherheit**: Berechtigungen geprüft? Eingaben validiert?
  - **Zukunft**: passt Architektur? keine unnötigen Einschränkungen?

  Note: this checklist's UI category names **Loading State, Error State, Empty State** as three of the required states to verify — plus implicitly a fourth "populated/success" state (a component must render *something* when data loads successfully). This is the closest thing found across all 7 documents to the user's recalled "4 mandatory UI states" pattern, though it is phrased as a checklist item here, not as a dedicated named pattern, and Teil 5 (UI/UX) never names all 4 together — see Open Questions.

### Always-do rules (verbatim/near-verbatim, consolidated)

- Before any larger change: 1. Understand existing architecture 2. Check the change's effects 3. Consider existing functions 4. Choose a suitable implementation strategy (§74.1)
- Desired workflow: `Anforderung → Analyse → Plan → Implementierung → Test → Dokumentation` (Requirement → Analysis → Plan → Implementation → Test → Documentation) (§74.1)
- Principle: "Einfach starten, sauber erweitern" (Start simple, extend cleanly) (§74.3)
- Every larger feature follows a mandatory 5-phase workflow (§75): **1. Requirement Analysis 2. Planning 3. Implementation 4. Testing 5. Documentation** — each phase demonstrated with a worked "Offline Books" example in the source.
- Always check (security, §78.3): Wer ist der Nutzer? Hat er Zugriff? Darf er diese Aktion durchführen? (Who is the user? Does he have access? Is he allowed to perform this action?)
- All user input must be validated (§78.2): Upload-Dateien, Texte, IDs, Berechtigungen (upload files, texts, IDs, permissions)
- DB schema changes require (§79.1): Migration → Testen → Anwenden (Migration → Test → Apply), plus documentation and review
- Data integrity rules (§79.2): keine kaputten Beziehungen (no broken relationships), keine Duplikate ohne Grund (no duplicates without reason), Foreign Keys beachten (respect foreign keys)
- AI code output must always be structured as (§82): **Änderung (Change) → Dateien (Files) → Grund (Reason) → then Code** — worked example given verbatim:
  ```
  Änderung: Reader bekommt Fortschritts-Speicherung.
  Betroffene Dateien: Reader.razor, ReadingService.cs, ReadingProgress.cs
  Grund: Fortschritt muss zwischen Sitzungen erhalten bleiben.
  ```
- Debugging must always follow (§83): Fehler reproduzieren → Ursache finden → kleinste sinnvolle Änderung → testen (reproduce error → find root cause → smallest sensible change → test)
- Every new feature needs 4 documented aspects (§84): Beschreibung (what), User Benefit (why), Technical Impact (which systems), Future Compatibility (fits later development?)
- Decision priority order when multiple solutions exist (§85): **1. Einfachheit (Simplicity) 2. Wartbarkeit (Maintainability) 3. Benutzererlebnis (UX) 4. Performance 5. Erweiterbarkeit (Extensibility)** — "not technically impressive, but long-term sensible"
- Documentation locations, exact filenames (§86): a `documentation/` folder containing `README.md`, `Architecture.md`, `Features.md`, `Database.md`

### Never-do rules (verbatim/near-verbatim, consolidated)

- Never: "Idee bekommen → direkt Code schreiben → bestehende Architektur zerstören" (get an idea → write code directly → destroy existing architecture) (§74.1)
- Never change the 6 protected architectural decisions without justification (§74.2 — see box above)
- Never over-engineer (§74.3): don't automatically add unnecessary frameworks, complex microservices, oversized systems, or tech without concrete benefit
- Never use global variables / uncontrolled state (§77.2)
- Never show a bare "Keine Bücher" empty state without a helpful message + CTA (§77.3)
- Never make ad-hoc/undocumented schema edits — always go through migration→test→apply (§79.1)
- Never make speculative/blind bug fixes — always reproduce → find cause → smallest change → test (§83)
- Never choose a solution merely because it's "technisch beeindruckend" (technically impressive) (§85)
- Implicitly: never let one class/service accumulate unrelated responsibilities (§76.3); never use vague names like `Helper`/`DataHandler` (§76.2); never use verb-decorated API routes like `/api/getBooksNow` (§78.1)

### Prompt/response structure expectations

This is one-directional: the document specifies how the **AI's own output** must be structured (§82: Änderung/Dateien/Grund, then code — see above). There is **no guidance on how a human should structure prompts/tickets to the AI** (no ticket template, no user-story format requirement).

### Scope control guidance

- §74.1 forbids jumping straight from idea to code / destroying existing architecture.
- §74.2 requires explicit justification (Why/Advantages/Disadvantages/Impacts) before changing any of the 6 protected architectural decisions — i.e., ask/justify before big architectural changes.
- §74.3 explicitly discourages over-engineering; principle: "Einfach starten, sauber erweitern."
- §75 Phase 2 (Planning) requires a pre-code plan enumerating technical solution, affected files, data changes, and risks — worked example (Offline Books feature):
  ```
  1. Neue OfflineBook Entity
  2. Storage Service erweitern
  3. Reader Cache hinzufügen
  4. UI Button erstellen
  5. Test hinzufügen
  ```
- §85 decision-priority order (Simplicity → Maintainability → UX → Performance → Extensibility) discourages gold-plating/over-ambitious solution design.

### Testing requirements before code is "done"

- §75 Phase 4: after any change, check — Funktioniert Feature? Gibt es Fehler? Werden bestehende Funktionen beeinflusst? (Does it work? Any errors? Are existing functions affected — i.e. regression check)
- §79.1: DB migrations require a "Testen" step before being applied
- §83: debugging sequence ends with a mandatory "testen" step
- §87 Quality Checklist (see above) is the closest thing to a formal Definition of Done

No specific test framework, coverage target, or unit/integration/e2e split is named anywhere — testing guidance stays conceptual/process-level.

### Documentation requirements

- §75 Phase 5: new important features must document Zweck (purpose), Verwendung (usage), technische Entscheidungen (technical decisions)
- §86 Documentation Rules: document Architekturentscheidungen, wichtige Features, Datenmodelländerungen, komplexe Logik — in files `README.md`, `Architecture.md`, `Features.md`, `Database.md` inside a `documentation/` folder
- §84: every feature needs Description/User Benefit/Technical Impact/Future Compatibility documented
- §80.2: `docs:` is a recognized commit-type prefix

### Stack-specific guidance (Blazor WASM / Cloudflare Workers / D1 / R2)

No deep API-level guidance (no Workers bindings code, no D1 SQL dialect notes, no R2 SDK specifics). The only stack-specific content is the **protection list** in §74.2 (never casually change Blazor WASM / Cloudflare architecture / Monorepo / D1 / R2 / modular structure) plus generic Blazor component/state conventions in §77. No dedicated Workers/D1/R2 "gotchas" section exists.

### Final AI Instruction (§88, verbatim closing statement)

> Baue nicht nur Funktionen. Baue eine langfristig hochwertige digitale Bibliothek. Die Anwendung soll: technisch sauber, angenehm zu benutzen, erweiterbar, persönlich, atmosphärisch sein. Die wichtigste Priorität: Der Nutzer soll gerne zurückkommen und das Gefühl haben, dass Lumina Chronica sein eigener digitaler Ort für Bücher, Wissen und Geschichten ist.

(Don't just build features. Build a long-term, high-quality digital library. The app should be: technically clean, pleasant to use, extensible, personal, atmospheric. Top priority: the user should enjoy coming back and feel Lumina Chronica is their own personal digital place for books, knowledge, and stories.)

---

## Teil 8 — Execution Blueprint & Master TODO

Source: `Lumina Chronica – Execution Blueprint Teil 8.pdf` (7 pages, extracted via background research agent, fully captured, ends with "End of Part 8"). Sections §112–126. This document is a phase/TODO checklist — no shell commands, no exact CLI syntax, no dates/estimates, no named test frameworks anywhere.

### Purpose & Execution Principles (§112–113)

Purpose (verbatim, translated): this chapter defines *what* is built, in *what order*, with *what dependencies*, and *when a section is considered complete*. "Development happens iteratively. Each phase must be fully completed, tested, and documented before the next one begins."

Execution principles — every work package must:
- have a clear purpose
- be independently testable
- have as few dependencies as possible
- produce visible progress

Explicit rules: "No sprint should be merely 'preparation'." / "At the end of every sprint, the application should have new, visible added value."

### Master Development Flow (§114) — the authoritative execution order

```
1. Projekt aufsetzen        (Set up project)
2. Technisches Fundament    (Technical foundation)
3. Authentifizierung        (Authentication)
4. Bibliothek                (Library)
5. Reader
6. Organisation              (Organization)
7. Dashboard
8. Offline
9. V1.0 Release
10. Worldbuilding
11. Community
12. KI                       (AI)
13. Mobile
```
V1.0 Release is explicitly positioned after "Offline" and before "Worldbuilding" — i.e., phases 1–8 are V1.0 scope; Worldbuilding/Community/AI/Mobile are explicitly post-1.0. This matches the phase ordering (though not the exact version-number labels) in the Implementation Blueprint (Teil 6/7).

### Phase-by-phase TODOs (verbatim, complete)

**Phase 0 — Repository (§115)** — Goal: "Professionelles Fundament schaffen."
```
1. Repository erstellen
2. Lizenz hinzufügen
3. README schreiben
4. Projektlogo hinzufügen
5. GitHub Project erstellen
6. Branch Protection aktivieren
7. Issue Templates
8. Pull Request Template
9. CONTRIBUTING.md
10. CODE_OF_CONDUCT.md
11. CHANGELOG.md
```
**Definition of Done:** Repository ist öffentlich erreichbar; CI läuft; Dokumentation vorhanden.

*(Note: this Phase 0 checklist is notably richer than the Implementation Blueprint's Phase 0 — this doc adds license, GitHub Project, branch protection, issue/PR templates, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md. Treat both lists as complementary/additive when scaffolding.)*

**Phase 1 — Technical Foundation (§116)**

Frontend:
```
1. Blazor WebAssembly erstellen
2. Komponentenstruktur
3. Routing
4. Layout
5. Theme Engine
6. Navigation
7. Footer
8. Fehlerseite
9. Loading-Komponenten
10. Responsive Grid
```
Backend:
```
1. Cloudflare Worker
2. API Routing
3. Error Middleware
4. Logging
5. Konfiguration
6. Environment Handling
```
Datenbank:
```
1. D1 verbinden
2. erste Migration
3. Rollen
4. Benutzer
5. Einstellungen
```
**Definition of Done:** "Frontend, Backend und Datenbank kommunizieren erfolgreich."

**Phase 2 — Authentication (§117)**
```
1. Registrierung
2. Login
3. Logout
4. Session
5. Passwort zurücksetzen
6. E-Mail-Bestätigung (optional)
7. Rollen
8. Benutzerprofil
9. Avatar
```
**Definition of Done:** "Ein Benutzer kann sich vollständig anmelden und verwalten."

**Phase 3 — Bibliothek (§118)**
```
1. Buchmodell
2. Upload
3. EPUB
4. PDF
5. TXT
6. Markdown
7. Metadaten
8. Cover
9. Bibliotheksübersicht
10. Grid
11. Listenansicht
12. Suche
13. Filter
14. Sortierung
```
**Definition of Done:** "Eigene Bücher können vollständig verwaltet werden."

**Phase 4 — Reader (§119)**
```
1. EPUB Reader
2. PDF Reader
3. Markdown Reader
4. TXT Reader
5. Kapitel
6. Inhaltsverzeichnis
7. Fortschritt
8. Kapitelnavigation
9. Reader Themes
10. Schriftgrößen
11. Zeilenabstand
12. Seitenmodus
13. Scrollmodus
```
**Definition of Done:** "Alle unterstützten Formate können komfortabel gelesen werden."

**Phase 5 — Organisation (§120)** *(no Definition of Done given for this phase)*
```
1. Regale
2. Tags
3. Favoriten
4. Zuletzt gelesen
5. Leseverlauf
6. Offline-Bibliothek
7. Mehrfachzuordnung
```

**Phase 6 — Dashboard (§121)** *(no Definition of Done given)*
```
1. Weiterlesen
2. Statistiken
3. Empfehlungen
4. Trends
5. Schnellzugriffe
6. Bibliotheksübersicht
```

**Phase 7 — Worldbuilding (§122)** *(no Definition of Done given)*
```
1. Projekte
2. Welten
3. Charaktere
4. Orte
5. Karten
6. Timeline
7. Dokumente
8. Verknüpfte Bücher
9. Bilder
10. Beziehungen
```

**Phase 8 — Community (§123)** *(no Definition of Done given)*
```
1. Öffentliche Profile
2. Öffentliche Bibliothek
3. Folgen
4. Bewertungen
5. Kommentare
6. Benachrichtigungen
7. Aktivitäten
```

**Phase 9 — KI/AI (§124)** *(no Definition of Done given)*

Reader AI:
```
1. Zusammenfassung
2. Worterklärung
3. Fragen beantworten
```
Creator AI:
```
1. Charakterideen
2. Lore
3. Namensgenerator
4. Konsistenzprüfung
```

**Phase 10 — Mobile (§125)** *(no Definition of Done given)*
```
1. Android
2. iOS
3. Offline
4. Synchronisierung
5. Push Notifications
```

### Global Completion Checklist (§126) — required before every release

```
1. Alle Tests bestanden               (All tests passed)
2. Dokumentation aktuell               (Documentation up to date)
3. Keine bekannten kritischen Fehler   (No known critical bugs)
4. Responsive geprüft                  (Responsiveness checked)
5. Accessibility geprüft               (Accessibility checked)
6. Performance geprüft                 (Performance checked)
7. Sicherheitsprüfung durchgeführt     (Security review performed)
8. Release Notes erstellt              (Release notes created)
```

### Testing expectations, timeline, tooling setup

- **Testing:** no framework named anywhere; testing is referenced only at the principle level ("independently testable," "all tests passed" in the release checklist). No per-phase test breakdown, no coverage targets.
- **Timeline/estimates:** none anywhere — no dates, durations, sprint lengths, or effort estimates. Ordering is strictly sequential/gated (each phase must be fully done before the next starts, per §112).
- **Tooling/account setup:** only what's implied by Phase 0 (GitHub repo/Project/branch protection/templates) and Phase 1 (Cloudflare Worker creation, D1 connection). No explicit Cloudflare account creation, domain/DNS setup, or `wrangler login`/`wrangler init` commands given.
- **Rollback plans / risk register / explicit approval checkpoints:** none present. The closest thing to a gate mechanism is the strict sequential-completion rule (§112) plus the Global Completion Checklist (§126) before each release.

Document ends with literal marker: **"End of Part 8."**

---

## Open Questions / Ambiguities

These are the concrete gaps, contradictions, and placeholders a human needs to resolve before/while scaffolding. Grouped by severity.

### A. Document numbering collision (needs resolution before organizing the repo's own `documentation/` folder)

1. **Two files both self-identify as "Teil 7," and neither self-identifies as "Teil 6," even though a "Teil 6" is referenced elsewhere.**
   - `Lumina Chronica – Implementation Blueprint Teiil 7.pdf` (note the "Teiil" typo in the filename) — its own title page and internal section numbering (§89–111) both say **"Teil 7 – Implementation Blueprint & Development Plan."**
   - `Lumina Chronica – AI Development Guidelines Teil 7.pdf` — filename says "Teil 7," but its own page-1 heading says **"Teil 6 – AI Development Instructions & Coding Guidelines"** (§73–88), and it ends with "End of Master Project Bible" rather than "End of Part 6" or "End of Part 7."
   - Net effect: there is no file that unambiguously and consistently is "Teil 6," and there are two internally-inconsistent claims to "Teil 7." The user's own task brief called this pairing "Teil 6/7," anticipating exactly this ambiguity.
   - **Recommendation:** when scaffolding `documentation/Architecture.md` etc. (per the AI Dev Guidelines' own required doc structure), don't try to preserve "Teil N" numbering as a citation scheme — refer to documents by title only (e.g. "Implementation Blueprint," "AI Development Guidelines") to sidestep the collision.

2. Teil 9 self-identifies as **"Teil 9 – GitHub Project Management & Issue System"** and explicitly ends the entire 9-part series ("End of Part 9"), which is internally consistent — no ambiguity there.

### B. Version/milestone roadmap contradicts itself across two documents

3. **V0.3 vs V0.5**: the Implementation Blueprint's Version Overview (§91) lists `V0.1 Projektgrundlage, V0.2 Technisches Fundament, V0.3 Persönliche Bibliothek, V1.0 Digital Reader, V1.5, V2.0, V3.0, V4.0, V5.0`. Teil 9's Milestones list (§131) instead lists `V0.1 Projektstart, V0.2 Technisches Fundament, V0.5 Bibliothek MVP, V1.0 Reader Release, V1.5 Personalisierung, V2.0 Worldbuilding, V3.0 Community, V4.0 KI, V5.0 Mobile`. The V0.1 and V0.2 labels roughly agree; **V0.3 "Persönliche Bibliothek" vs V0.5 "Bibliothek MVP" is a direct numbering contradiction** — pick one before creating GitHub milestones. Teil 9's version labels do match its own Version label taxonomy (§129: v0.1, v0.2, v1.0, v1.5, v2.0, v3.0, v4.0, v5.0 — notably Teil 9's label list also has **no v0.3 or v0.5 label**, despite v0.5 appearing as a milestone — a second, smaller internal inconsistency inside Teil 9 itself).
4. The Execution Blueprint (Teil 8) Master Development Flow (§114) gives phase *order* (Setup → Foundation → Auth → Library → Reader → Organization → Dashboard → Offline → **V1.0 Release** → Worldbuilding → Community → AI → Mobile) that is consistent with the Implementation Blueprint's phase order, but Teil 8 never attaches version-number labels to its phases at all — so it neither confirms nor resolves the V0.3-vs-V0.5 conflict above.
5. **Teil 9's issue-numbering ranges (§133) have gaps**: Epics "Discovery" (#10), "Statistics" (#12), "Offline" (#13), and "Deployment" (#16) from the Epic list (§130) have no corresponding numeric issue range in §133's table — the ranges jump from Worldbuilding (#0800–0899) to Community (#0900–0999) to AI (#1000–1099) to Mobile (#1100–1199) to Documentation (#1200–1299) to Testing & QA (#1300–1399). Decide where Discovery/Statistics/Offline/Deployment issues should live before setting up GitHub issue numbering.

### C. UI/UX Design System (Teil 5) — the single biggest gap for actual CSS scaffolding

6. **No hex color codes exist anywhere in any of the 7 documents processed.** Teil 5 names four themes (**Classic Library** [default], **Modern Light**, **Dark Library**, **System**) and gives only qualitative descriptors (e.g. "Beige Hintergrund, braune Elemente, goldene Akzente" for Classic Library) plus five bare color-concept names for the primary theme direction (Parchment Beige, Warm Brown, Dark Wood, Gold Accent, Soft White) — **none with hex/RGB values**. This was independently confirmed by two full readings of the document (mine + the redundant background-agent pass). A human must pick actual hex values for every token (background/surface/text-primary/text-secondary/border/accent/success/warning/error) × 4 themes before any theme CSS can be written.
7. **`user_settings.theme` example value contradicts the Teil 5 theme names.** Teil 4 §45.3 gives the example `{"theme":"paper","reader_mode":"book","font_size":18}` — i.e. a `theme` value of `"paper"` — but Teil 5's actual theme names are `Classic Library` / `Modern Light` / `Dark Library` / `System`. Neither matches. Decide the actual stored slug values (e.g. `classic-library`, `modern-light`, `dark-library`, `system`) before writing the settings API.
8. **No UI font family is named** — only the *reader/book* typography has candidate fonts (Literata, Merriweather, Georgia, System Serif — given as options, no single default chosen). UI chrome (menus/buttons/settings) has zero named font anywhere.
9. **No font sizes, weights, or line-heights are given for any type-scale step** (H1/H2/Body/Caption are named as concepts only).
10. **No spacing scale, container widths, responsive breakpoint pixel values, border-radius values, shadow/elevation tokens, z-index scale, or animation duration/easing values exist anywhere.** All flagged as needing to be defined fresh by the implementer.
11. **No CSS methodology/component library is named** anywhere (no Tailwind, MudBlazor, CSS custom properties, BEM, etc.) — this is an open architectural decision, not just a missing detail.
12. **No icon library is named.** The only icons that exist in the spec are 7 literal emoji characters used in the main nav (see table in the Teil 5 section above) — there is no icon font/SVG system defined, and the mobile bottom nav has no icons at all (text-only).
13. **The "4 mandatory UI states" pattern the user recalled does not exist as a named, unified concept in any of the 7 documents.** The closest matches, found in two different documents:
    - Teil 5 §70–71 covers **Empty States** and **Error Design** as two separate sections with worked examples, but never groups them into "4 states" and never mentions Loading or Success states at all.
    - The AI Development Guidelines' Quality Checklist (§87) lists, under its "UI" category: **Loading State? Error State? Empty State?** as three verification questions (implying a fourth, unstated "populated/success" state as the baseline case) — this is the closest thing to a "4 states" pattern found, but it is phrased as a pre-completion checklist item, not a formally named/detailed pattern with its own section.
    - **Recommendation:** either this pattern lives in a document not yet located (possibly missing from the `Docs/` folder — no file numbered exactly "Teil 6" exists, group C1 above), or it needs to be formally defined by the implementer using the Empty/Error examples in Teil 5 plus Loading/Success as the missing two, following the AI Dev Guidelines' checklist as the closest authority.

### D. Database & API (Teil 4) gaps

14. **Two table names are ambiguous due to a PDF layout artifact.** The "Tags" table name box renders as `t` / `ags` (split across two lines) and the "Book Tags" (many-to-many) table renders as `t_book_tags`. Both my direct reading and the independent background-agent reading hit the same rendering artifact and independently concluded the intended names are almost certainly **`tags`** and **`book_tags`** (matching the `BOOK_TAG` label in the §44 ER diagram and the plain-snake_case convention used by every other junction table, e.g. `shelf_books`, `project_members`). Treat as `tags` / `book_tags` unless a source document not yet located says otherwise.
15. **Most worldbuilding/community tables have no data types specified at all** in Teil 4 — `characters`, `locations`, `timeline_events`, `project_members`, `shelf_books`, `followers`, `ratings`, `comments`, `bookmarks` list only field *names*, no `Typ` column. Types (INTEGER/TEXT/DATETIME/etc.) and constraints (PK/FK/NOT NULL/UNIQUE/DEFAULT) will need to be designed from scratch, informed by the patterns used in the tables that *do* have types (`users`, `roles`, `user_settings`, `books`, `book_files`, `book_metadata`, `reading_progress`, `tags`, `projects`).
16. **No migration file naming convention is given in Teil 4 itself.** The only data point anywhere in the 7 documents is a single example filename in the Implementation Blueprint (Teil 6/7 §93.3): **`001_initial.sql`** (3-digit, no stated pattern for subsequent files). Note this doesn't necessarily match Cloudflare D1's own `wrangler d1 migrations create` tooling, which by default generates 4-digit-prefixed filenames (`0001_name.sql`) — decide which convention to actually use.
17. **No R2 bucket name or key/path naming convention is given anywhere.** Teil 3 gives only two example top-level R2 key prefixes, `books/` and `projects/`, with no further nesting shown (e.g. no confirmed pattern like `books/{bookId}/cover.jpg` or `books/{userId}/{bookId}/file.epub`). This needs to be designed fresh.
18. **API coverage is minimal and inconsistent with the schema.** Only Auth (register/login), Books (list/upload/get/delete), Reading Progress (get/update), and a partial Projects API (create/list/add-character) are documented. There are **no documented REST routes** for shelves, tags, ratings, followers, comments, statistics, user settings, locations, or timeline events, despite all of those having D1 tables. These routes need to be designed before the backend can be feature-complete even for what the schema implies.
19. **No endpoint-level auth annotations exist.** Teil 4 §57 gives only a generic 4-step permission-check flow ("Is user logged in? → Does user have access? → What rights? → Allow/deny") with no mapping of specific roles (USER/AUTHOR/MODERATOR/ADMIN) or specific permission levels (VIEW/EDIT/OWNER) to specific endpoints. Decide, e.g., whether `GET /api/books` is public or requires auth, whether `POST /api/books/upload` requires a specific role, etc.
20. **No API versioning scheme, pagination convention beyond a bare `?page=1` param, rate-limiting policy, or standard error-response JSON envelope is defined anywhere** — all need to be designed fresh.
21. **No content-type/field-name convention is given for the book upload endpoint** (`POST /api/books/upload`) — the doc says only "Upload: Datei + Metadaten," with no multipart field names or metadata JSON shape.

### E. Technical Architecture (Teil 3) gaps

22. **Teil 3 is unusually thin (2 pages, headed literally "SUMMARY")** and does not contain the granular detail one would expect from a "Technical Architecture Specification" — confirmed complete via multiple independent checks (no more pages, no hidden images, no alternate file). Missing from Teil 3 and not found anywhere else in the 7 documents:
    - No `wrangler.toml` shown, no D1/R2/KV binding names anywhere.
    - No package/framework versions anywhere (.NET version, Blazor version, Workers compatibility date, no NuGet or npm package names).
    - No Cloudflare Worker router/framework library named (no Hono, itty-router, etc. — only `.ts` route filenames like `auth.ts`, `books.ts` are given, implying TypeScript but not confirming any specific routing library).
    - No `.razor` file/folder naming convention, no component-file layout beyond the bare category names (Pages/Components/Services/Models/Styles) — though the AI Development Guidelines (§77.1) *does* give one concrete Blazor component-folder convention (`Components/BookCard/BookCard.razor` + `.razor.cs` + `.css`, co-located per component) which can reasonably be treated as filling this gap.
    - No environment variable names, no `.env`/`appsettings.json`/`wrangler.toml` config file structure, no dev server ports, no package manager choice (npm/pnpm/yarn), no exact CLI commands for local dev or deploy.
23. **Minor repo-structure discrepancy**: Teil 3's top-level monorepo layout is `frontend/ backend/ shared/ documentation/ database/ scripts/ tests/ README.md` (includes `shared/` and `scripts/`), while the Implementation Blueprint's Phase 0 (§92) gives `frontend/ backend/ database/ documentation/ tests/` (no `shared/`, no `scripts/`). Not a hard contradiction (Teil 3's list can be read as a superset) but worth deciding explicitly whether `shared/` and `scripts/` are wanted before scaffolding.
24. **Auth provider is unresolved.** Teil 3 lists three candidate approaches in priority order — 1. Cloudflare Access/Auth Integration, 2. OAuth Provider, 3. custom ("eigenes") auth system — but Teil 4's actual documented API (`POST /api/auth/register`, `POST /api/auth/login` returning a JWT-like `{"token":"jwt-token","userId":1}`) reads as a **custom auth system** (option 3, the lowest-priority option per Teil 3's own ordering), not Cloudflare Access or a third-party OAuth provider. Confirm which approach is actually intended — the two documents point in different directions.

### F. Implementation guidance gaps (no document covers these)

25. **No component templates, service-layer/DI patterns, named architectural pattern (MVVM/Clean Architecture/Repository/CQRS/etc.), state-management approach, HTTP client setup pattern, or validation pattern are specified in ANY of the 7 documents**, aside from the high-level guidance in the AI Development Guidelines (prefer Services + DI + clear Models over global variables/uncontrolled state; one component folder per component with co-located `.razor`/`.razor.cs`/`.css`). If more detailed code-level patterns are expected to exist in the Master Project Bible series, they were not found in Teile 3–9 — they may be in Teil 1 or Teil 2 (vision/features, already reviewed by the user directly and out of scope for this extraction), or they may simply not exist yet and need to be designed during scaffolding.
26. **No testing framework is named anywhere** across all 7 documents (no xUnit, bUnit, Playwright, Vitest, etc.). Testing is referenced only at the principle level ("must be independently testable," "all tests passed" before release) in the AI Dev Guidelines and Execution Blueprint. A framework choice needs to be made independently.
27. **Sprint 1 in the Implementation Blueprint (§106) says "Erste Deployment Pipeline"** (first deployment pipeline) as a task, and Phase 0 in the Execution Blueprint (§115) requires CI to be running as part of its Definition of Done — but no document names a specific CI tool (GitHub Actions is implied by "GitHub Actions" appearing in the Implementation Blueprint's Phase 0 Git Setup step, but no workflow YAML or file names are given anywhere).

### G. Minor/low-priority items

28. The R2 file-format list in Teil 4 (EPUB, PDFs, Cover, Bilder, Karten, Projektdateien) doesn't explicitly include TXT or Markdown, even though the Implementation Blueprint's V1 file-format list (§95.2) explicitly includes **EPUB, PDF, TXT, Markdown** as supported reader formats — TXT/Markdown files presumably also need to live in R2 under `book_files`, just not explicitly called out in Teil 4's storage-category list.
29. Teil 4's `roles` table permission values are typed as `JSON` with no schema/shape given for what that JSON contains (e.g. an array of permission strings? an object of booleans?) — needs to be designed.
30. Teil 4's `comments` table (marked "Spätere Version" / later version, not V1) uses a polymorphic `target_type`/`target_id` pair with no enum of valid `target_type` values given (presumably `BOOK` and `PROJECT` at minimum, given the ER diagram shows `COMMENT` under `BOOK`, but this needs confirmation since projects/characters/etc. might also be commentable in a later version).
31. Mobile app framework (Version 5.0 / Phase 10, post-V1.0) is left as three options (.NET MAUI, React Native, Flutter) with no decision made — not urgent for V1 scaffolding but worth tracking.

---

*End of extracted specification summary. All 7 source documents (Teil 3, Teil 4, Teil 5, Implementation Blueprint, AI Development Guidelines, Teil 8, Teil 9) have been fully read and incorporated above — Teil 4 and Teil 5 were read directly in full by the primary agent; the other five were extracted by dedicated background research agents reading the full PDFs, with Teil 4 and Teil 5 additionally cross-checked against independent redundant agent passes for consistency.*
