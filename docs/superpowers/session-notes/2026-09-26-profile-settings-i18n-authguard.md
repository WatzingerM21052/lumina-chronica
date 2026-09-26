# 2026-09-26: Profile/Settings i18n coverage, password-reset relocation, Settings auth-guard

## Summary

Three related changes, implemented together on `main`:

1. **Moved the password-reset button from Settings to Profile.** It now sits
   right after the "Passwort ändern" (change password) form and before
   "Verknüpfte Konten", since it's the alternative for a user who doesn't
   know their *current* password (which the change-password form requires).
   Reuses the `UserProfile` already fetched by `Profile.razor`'s
   `OnInitializedAsync` — no second `GET /api/users/me` call was added.

2. **Full i18n coverage for `Profile.razor` and `Settings.razor`.** Every
   hardcoded German string in both pages now goes through `I18n.T("key")`,
   following the established pattern from `Login.razor`/`Register.razor`.
   `Settings.razor`'s `NotificationTypes` array (a `private static readonly`
   field, so it can't call the instance method `I18n.T()` at
   field-initialization time) was restructured to hold i18n key names
   (`LabelKey`/`DescriptionKey`) instead of raw German text, with the actual
   `I18n.T()` lookups happening in the `@foreach` at render time.

3. **Settings.razor is now auth-guarded**, and `NavMenu.razor`'s link list
   is hidden entirely while logged out.

## Files changed

- `frontend/LuminaChronica.Client/Pages/Settings.razor` — removed the
  password-reset card, `_userEmail` field, its `GET /api/users/me` call, and
  `SendPasswordResetAsync`; added `@attribute [Authorize]` +
  `@using Microsoft.AspNetCore.Authorization` (mirroring `Profile.razor`);
  migrated all hardcoded strings to `I18n.T()`; restructured
  `NotificationTypes` to hold i18n key names; removed the now-unused
  `@inject ToastService`.
- `frontend/LuminaChronica.Client/Pages/Profile.razor` — added
  `@inject II18nService I18n` and `@inject ToastService ToastService`;
  migrated all hardcoded strings to `I18n.T()`; added the new
  `.profile-password-reset` section (hint text + button) between the
  password-change `<EditForm>` and the "Verknüpfte Konten" `<h2>`; added
  `SendPasswordResetAsync()`.
- `frontend/LuminaChronica.Client/Pages/Profile.razor.css` — added
  `.profile-password-reset { margin: 0.5rem 0 1.5rem; }`.
- `frontend/LuminaChronica.Client/Layouts/NavMenu.razor` — wrapped the
  `<nav>`'s `<NavLink>` list in `<AuthorizeView><Authorized>...</Authorized></AuthorizeView>`,
  no `<NotAuthorized>` branch (renders nothing when logged out —
  `MainLayout.razor`'s own separate `<AuthorizeView>` already handles the
  "Anmelden"/"Profil" link independently).
- `frontend/LuminaChronica.Client/wwwroot/i18n/de.json` /
  `frontend/LuminaChronica.Client/wwwroot/i18n/en.json` — removed the four
  `settings.passwordReset*` keys, added the full `profile.*` set (30 keys)
  and the additive `settings.*` set (19 keys, including 12 for the six
  `NotificationTypes` entries).
- `tests/frontend/FakeI18nService.cs` — German dictionary kept complete
  (every new key mirrored from `de.json`); no new keys added to the English
  dictionary (no new English-rendering test was written for these pages,
  matching the existing convention of English being a tested subset only).
- `tests/frontend/SettingsPageTests.cs` — removed
  `Settings_PasswordResetButton_SendsRequestWithOwnEmail`; removed the
  `/users/me` route stub and the now-unused `ProfileJson` constant from
  every `UseHandler` call site, since `Settings.razor` no longer calls
  `GET /api/users/me` at all.
- `tests/frontend/ProfilePageTests.cs` — added
  `Services.AddSingleton<II18nService, FakeI18nService>();` and
  `Services.AddSingleton<ToastService>();` to all 16 test setup blocks;
  added a new test,
  `Profile_PasswordResetButton_SendsRequestWithProfileEmailAndShowsToast`,
  covering: button not disabled once `_profile` is loaded, the POST to
  `/api/auth/forgot-password` carries the profile's email, and
  `ToastService.OnShow` fires with `ToastKind.Success`.
- `tests/frontend/NavMenuTests.cs` (new file) — no prior NavMenu or
  MainLayout test coverage existed, so this adds two tests:
  `NavMenu_Authenticated_RendersAllSevenLinks` and
  `NavMenu_NotAuthenticated_RendersNoLinks`, using bUnit's
  `AddAuthorization()`/`SetAuthorized`/`SetNotAuthorized` (the same pattern
  already used by `PublicProfilePageTests.cs` for its own
  `<AuthorizeView>` coverage).

## Test results

Build: `dotnet build` in `frontend/LuminaChronica.Client` — **0 errors, 0
warnings**.

Full frontend suite: `dotnet test` in `tests/frontend` — **436 passed, 0
failed, 0 skipped**.

## Browser verification (live, against the already-running local dev
servers — backend on :8787, frontend restarted fresh on :5289 to pick up
this session's build)

Confirmed live in Chrome, as an already-authenticated test session
(`browsertest2reclaim`):

- **Profile page**: the new "Passwort vergessen? Fordere einen Reset-Link
  per E-Mail an." hint + "Passwort-Reset-Link senden" button render
  correctly positioned — directly after the "Passwort ändern" form and
  before "Verknüpfte Konten".
- **Settings page**: renders with no password-reset card (confirmed
  removed), all other cards (Theme, Sprache, Bibliothek, Benachrichtigungen)
  render normally through the new i18n keys.
- **Clicking the new Profile password-reset button** fired a real
  `POST /api/auth/forgot-password` against the live local backend and
  produced a genuine success toast reading "Reset-Link wurde an deine
  E-Mail-Adresse gesendet." — full end-to-end confirmation, not just a
  unit-test double.
- **Logged out** (via the Profile page's "Abmelden" button): the navbar
  collapsed to just the logo + "Anmelden" link — Home/Bibliothek/Projekte/
  Entdecken/Statistik/Offline/Einstellungen all correctly disappeared.
- **Logged out, navigating directly to `/settings`**: redirected to
  `/login` as expected, confirming the new `[Authorize]` attribute is
  sufficient (no other plumbing needed, per `App.razor`'s existing
  `AuthorizeRouteView`/`RedirectToLogin` wiring).

Everything in the task's verification checklist was confirmed live; nothing
was skipped due to backend/setup overhead (both dev servers were already
running from an earlier session in this environment).

## Commits

- One commit on `main` covering all of the above (frontend pages, CSS,
  i18n dictionaries, and tests together, since they're one coherent
  change).
