# Lumina Chronica – Technical Standards & Conventions

> **Zweck:** Dieses Dokument definiert alle technischen Standards, Konventionen und Richtlinien für die Entwicklung von **Lumina Chronica**. Es dient als Referenz für Entwickler und KI-Assistenten, um eine konsistente, wartbare und skalierbare Codebasis sicherzustellen.

---

# 1. Design System

## Ziel

Das Design soll eine moderne Webanwendung mit der Atmosphäre einer klassischen Bibliothek verbinden.

Alle Oberflächen müssen sich konsistent anfühlen und denselben Designrichtlinien folgen.

---

## Farbpalette (Design Tokens)

Alle Farben werden als zentrale Design-Tokens definiert.

### Primärfarben

* Primary
* Primary Hover
* Primary Active

### Sekundärfarben

* Secondary
* Secondary Hover

### Akzentfarben

* Gold Accent
* Info
* Success
* Warning
* Error

### Hintergrundfarben

* Paper Background
* Light Background
* Dark Background
* Card Background
* Reader Background

### Textfarben

* Primary Text
* Secondary Text
* Muted Text
* Disabled Text

---

## Themes

Mindestens folgende Themes werden unterstützt:

* Classic Library (Standard)
* Modern Light
* Dark Library
* System Theme

Später:

* Custom Themes
* Community Themes

---

## Typografie

### UI-Schrift

Verwendung für:

* Navigation
* Buttons
* Formulare
* Menüs
* Dashboard

Eigenschaften:

* modern
* gut lesbar
* neutral

### Reader-Schriften

Verwendung ausschließlich im Reader.

Empfohlene Schriftarten:

* Literata
* Merriweather
* Georgia
* System Serif

Der Benutzer kann die Schriftart jederzeit wechseln.

---

## Schriftgrößen

Es existiert ein einheitliches Typography-System.

Beispiel:

* H1
* H2
* H3
* Body Large
* Body
* Small
* Caption

---

## Spacing

Alle Abstände basieren auf einem 8px-Raster.

Beispiele:

* 8px
* 16px
* 24px
* 32px
* 48px
* 64px

Keine zufälligen Abstände verwenden.

---

## Komponenten

Alle UI-Komponenten müssen wiederverwendbar sein.

Beispiele:

* Button
* IconButton
* BookCard
* ShelfCard
* ProjectCard
* Modal
* Dialog
* SearchBar
* Pagination
* ReaderToolbar
* NavigationBar

---

# 2. API Standards

## Architektur

Alle APIs werden als REST API umgesetzt.

Basisroute:

```text
/api/
```

---

## URL-Konventionen

Plural verwenden.

Richtig:

```text
/api/books
/api/projects
/api/users
```

Nicht:

```text
/api/getBooks
/api/book
/api/loadProject
```

---

## HTTP-Methoden

GET

* Daten abrufen

POST

* Daten erstellen

PUT

* Datensatz vollständig ersetzen

PATCH

* Teilweise aktualisieren

DELETE

* Löschen

---

## Standard-Response

Erfolgreiche Antworten:

```json
{
  "success": true,
  "data": {}
}
```

Fehler:

```json
{
  "success": false,
  "error": {
    "code": "BOOK_NOT_FOUND",
    "message": "Book not found."
  }
}
```

---

## Statuscodes

200 OK

201 Created

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

413 Payload Too Large

422 Validation Error

500 Internal Server Error

---

## Pagination

Alle Listen unterstützen Pagination.

Standard:

```text
?page=1&pageSize=20
```

---

## Sortierung

Beispiele:

```text
?sort=title
?sort=author
?sort=rating
?sort=createdAt
```

---

## Filter

Beispiele:

```text
?genre=fantasy
?language=de
?visibility=public
```

---

# 3. Datenbank-Konventionen

## Tabellen

Immer:

snake_case

Beispiele:

```text
users
books
reading_progress
project_members
```

---

## Primärschlüssel

Immer:

```text
id INTEGER PRIMARY KEY
```

---

## Foreign Keys

Benennung:

```text
user_id
book_id
project_id
```

---

## Zeitstempel

Standardfelder:

```text
created_at
updated_at
deleted_at
```

---

## Migrationen

Format:

```text
0001_initial.sql
0002_create_users.sql
0003_create_books.sql
```

Regeln:

* Niemals bestehende Migrationen ändern.
* Jede Änderung erhält eine neue Migration.
* Migrationen müssen nachvollziehbar sein.

---

# 4. Cloudflare R2-Struktur

## Ziel

Alle Dateien werden logisch organisiert.

Grundstruktur:

```text
r2/

books/
    {book-id}/
        original.epub
        cover.jpg

projects/
    {project-id}/
        maps/
        images/
        documents/

users/
    {user-id}/
        avatar.png

temp/
```

---

## Dateibenennung

Keine Leerzeichen.

Keine Sonderzeichen.

Bevorzugt:

```text
original.epub
cover.jpg
chapter01.png
```

---

# 5. Projektstruktur

```text
Lumina-Chronica/

frontend/

backend/

shared/

documentation/

database/

tests/

scripts/
```

---

## Frontend

```text
Pages/

Components/

Services/

Models/

Layouts/

Styles/

Assets/
```

---

## Backend

```text
routes/

services/

middleware/

models/

utils/
```

---

# 6. Coding Conventions

## Klassen

PascalCase

```text
BookService
ReaderService
ProjectManager
```

---

## Interfaces

Präfix:

```text
IBookService
IReaderService
```

---

## Methoden

PascalCase

```text
GetBook()

SaveBook()

DeleteBook()
```

Async:

```text
GetBookAsync()
```

---

## Variablen

camelCase

```text
readingProgress
selectedBook
currentUser
```

---

## Konstanten

UPPER_SNAKE_CASE oder `const` gemäß Sprachkonvention.

---

# 7. Sicherheit

Alle Benutzereingaben werden validiert.

Passwörter werden ausschließlich gehasht gespeichert.

Private Inhalte dürfen niemals ohne Berechtigungsprüfung ausgeliefert werden.

Dateiuploads müssen prüfen:

* Dateityp
* Dateigröße
* Dateiendung
* MIME-Type

Rate Limiting wird auf API-Ebene unterstützt.

CORS wird restriktiv konfiguriert.

---

# 8. Performance

Alle Listen verwenden Pagination.

Große Bilder werden komprimiert.

Bücher werden gestreamt oder effizient geladen.

Lazy Loading wird verwendet.

Nur benötigte Daten werden übertragen.

---

# 9. Testing

Vor jedem Release:

* Unit Tests
* Integrationstests
* UI-Tests
* Manuelle Tests

Kritische Kernfunktionen müssen getestet werden:

* Login
* Upload
* Reader
* Fortschritt
* Synchronisation

---

# 10. Dokumentationsregeln

Jede größere Änderung aktualisiert:

* Changelog
* API-Dokumentation
* Datenbankdokumentation
* Architektur (falls notwendig)

Neue Features erhalten:

* Beschreibung
* Technische Umsetzung
* Einschränkungen
* Abhängigkeiten

---

# 11. Grundprinzip

Alle Entscheidungen orientieren sich an folgenden Prioritäten:

1. Verständlichkeit
2. Wartbarkeit
3. Benutzerfreundlichkeit
4. Performance
5. Erweiterbarkeit

Neue Technologien oder Bibliotheken dürfen nur eingeführt werden, wenn sie einen klaren Mehrwert bieten und mit der bestehenden Architektur vereinbar sind.

---

# Dokumentstatus

Version: 1.0

Projekt: Lumina Chronica

Gültig ab: Erste Implementierung

Dieses Dokument ist für alle Entwickler und KI-Assistenten verbindlich und ergänzt die Master Project Bible.
