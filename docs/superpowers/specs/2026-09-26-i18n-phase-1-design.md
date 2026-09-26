# i18n Phase 1 (Infrastructure + Reference Pages) — Design

First slice of a larger, explicitly-not-fully-scoped goal: German/English language switching across Lumina Chronica. The app currently has zero localization infrastructure — every one of ~55 Razor pages/components has hardcoded German text, and the backend has ~196 hardcoded English error messages. Translating everything in one pass is out of scope for any single session; this phase establishes the pattern and migrates a small, coherent slice, matching how this project has tackled other large reworks (Dashboard/Statistics/Library-Shelf) — infrastructure + one real slice first, remaining pages migrated incrementally in later sessions using the same pattern.

## Scope of this phase

- Translation infrastructure: dictionary service, JSON translation files, language-switch persistence.
- Migrated pages: `MainLayout.razor` (the nav bar — appears on every page, so translating it is necessary for ANY single translated page to feel coherent rather than an island of English/German inside all-German chrome), `Login.razor`, `Register.razor`.
- Language switcher UI, added to `Settings.razor` next to the existing theme picker.

## Explicitly out of scope for this phase

- The remaining ~52 pages/components — migrated later, one slice at a time, reusing this exact pattern.
- Backend error messages (`backend/src/routes/*.ts`'s `failure(...)` calls, ~196 of them) — translating these would require every API call to carry a language signal and every error-code mapping to become per-language, a materially larger change. Frontend-only for now; backend messages stay as-is (English, mostly not surfaced verbatim to users anyway — the frontend already maps many error codes to German copy itself, e.g. `Register.razor`'s `DescribeError`).
- Any account-level language preference (a `UserSettings.language` column exists in the DB already per `0001_initial.sql`'s `user_settings` table, but it's unused for this — Phase 1 is browser-local only, matching `theme.js`'s own storage model). Revisit only if cross-device language sync is ever actually requested.
- A reactive re-render-in-place mechanism for an in-session language switch — switching triggers a full page reload instead (see below).

## Architecture

**Storage — `wwwroot/js/i18n.js`**, mirroring `theme.js`'s exact shape:

```js
const STORAGE_KEY = "lumina-chronica-language";

export function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) || "de";
}

export function setLanguage(language) {
    localStorage.setItem(STORAGE_KEY, language);
}
```

No `applyStoredLanguage()`/`data-lang` attribute call at boot the way `theme.js` has `applyStoredTheme()` — that exists to avoid a flash of the wrong *CSS* theme before Blazor boots, which doesn't apply here (there's no pre-boot DOM text to flash-correct). The stored value is only read once, async, by the C# service below.

**Dictionary files** — `wwwroot/i18n/de.json` and `wwwroot/i18n/en.json`, flat key→string maps (not nested objects — simpler to load/read, and the namespace prefix in the key itself already gives structure):

```json
{
  "common.save": "Speichern",
  "common.cancel": "Abbrechen",
  "nav.home": "Home",
  "nav.library": "Bibliothek",
  "login.title": "Anmelden",
  "login.identifierLabel": "E-Mail oder Benutzername"
}
```

Key convention: `<page-or-area>.<element>`, with a shared `common.*` namespace for strings reused across many pages (button labels like Save/Cancel, not page-specific copy). `de.json` is the source of truth — every key must exist there; `en.json` may lag behind during incremental migration (see fallback behavior below).

**Service — `II18nService` / `I18nService`**, mirroring `IThemeService`/`ThemeService`'s shape:

```csharp
public interface II18nService
{
    Task InitializeAsync();
    string T(string key);
    string CurrentLanguage { get; }
    Task SetLanguageAsync(string language);
}
```

`InitializeAsync` (called once, from `App.razor`'s `OnInitializedAsync` or `MainLayout`'s, before any page renders) reads the stored language via the JS module, then fetches both `wwwroot/i18n/de.json` and the current language's JSON via `HttpClient` (plain static-file GET, not an API call — these ship as part of the Blazor WASM app bundle), parses them into two `Dictionary<string, string>` fields (`_current`, `_fallback` = always German). Registered as a **singleton** (one instance, one load, for the app's lifetime — matches `TokenStore`'s registration pattern, not scoped-per-component).

`T(string key)` is synchronous (the dictionaries are already loaded by the time any page's `OnInitializedAsync` runs, since `InitializeAsync` is awaited earlier in the boot sequence): looks up `key` in `_current`; if missing, falls back to `_fallback` (German); if missing from both, returns the key itself wrapped in a marker (e.g. `"⚠️ missing.key"`) so a missing translation is visually obvious in the UI during development rather than silently blank or throwing.

`SetLanguageAsync` persists via the JS module, then does `NavigationManager.NavigateTo(NavigationManager.Uri, forceLoad: true)` — a full reload. This is a deliberate simplification: making every already-rendered component reactively re-render on a language change (without a reload) would need either a cascading value + `IDisposable` subscription pattern across every single translated component, or re-fetching/re-parsing state from scratch anyway. A full reload is simple, correct, and consistent with how this app already handles some other significant state transitions with a hard navigation rather than in-place updates.

## Migration pattern (for this phase's 3 files, and every future page)

Each `.razor` file gets `@inject II18nService I18n` and replaces hardcoded German text with `@I18n.T("key")` calls — in element content (`<h1>@I18n.T("login.title")</h1>`), attributes (`<input placeholder="@I18n.T("login.identifierLabel")" />`), and C#-side strings inside `@code` blocks where needed (error messages built in code, not just markup — call `I18n.T(...)` there too, injected the usual `[Inject]` way for `.razor.cs` split files, plain `@inject` for single-file `.razor`).

## Language switcher UI (`Settings.razor`)

New `.settings-card` section, placed directly after the existing "Theme" card (same visual treatment: a row of buttons, `btn`/`btn-primary` for the active selection, mirroring the theme picker's exact existing markup shape):

```razor
<div class="settings-card">
    <h2>Sprache</h2>
    <div class="theme-picker">
        <button class="btn @(_currentLanguage == "de" ? "btn-primary" : "")" @onclick="() => SetLanguageAsync("de")">Deutsch</button>
        <button class="btn @(_currentLanguage == "en" ? "btn-primary" : "")" @onclick="() => SetLanguageAsync("en")">English</button>
    </div>
</div>
```

(Reuses the existing `.theme-picker` CSS class for the button row — same layout need, no new CSS required. "Sprache"/"Deutsch"/"English" stay hardcoded here rather than going through `I18n.T(...)` themselves, same reasoning as everywhere else on `Settings.razor`: that page isn't part of this phase's migrated set.)

## Testing

Backend: none (no backend change in this phase). Frontend: a new `I18nServiceTests.cs` (or inline coverage via the migrated pages' own tests) verifying `T()` returns the correct string per language, falls back to German for a key missing from `en.json`, and returns the missing-key marker when absent from both. `MainLayoutTests`/`LoginPageTests`/`RegisterPageTests` get assertions that key nav/page text renders correctly under both `de` and `en` (set via the JS interop mock, matching how `theme.js` is already mocked in existing tests).

## Out-of-scope items explicitly deferred

- Remaining ~52 pages — future sessions, same pattern.
- Backend message translation.
- Account-level (cross-device) language sync.
- In-place reactive re-render on language switch (full reload instead).
