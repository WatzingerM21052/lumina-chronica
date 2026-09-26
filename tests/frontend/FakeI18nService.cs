using LuminaChronica.Client.Services;

namespace LuminaChronica.Client.Tests;

// Test double for II18nService -- avoids every test that renders a
// migrated page (Login/Register/Settings/MainLayout/OAuthButtons) needing
// its own JSInterop mock for i18n.js's module loading + fetch. Mirrors
// wwwroot/i18n/de.json's content (German is the source-of-truth language,
// same as the real service's fallback) -- keep in sync manually if that
// file's keys change; there are few enough right now that this is simpler
// than reading the real file from test code.
public class FakeI18nService : II18nService
{
    private static readonly Dictionary<string, string> German = new()
    {
        ["nav.home"] = "Home",
        ["nav.library"] = "Bibliothek",
        ["nav.projects"] = "Projekte",
        ["nav.discover"] = "Entdecken",
        ["nav.statistics"] = "Statistik",
        ["nav.offline"] = "Offline",
        ["nav.settings"] = "Einstellungen",
        ["nav.profile"] = "Profil",
        ["nav.login"] = "Anmelden",
        ["nav.impressum"] = "Impressum",

        ["login.title"] = "Anmelden",
        ["login.identifierLabel"] = "E-Mail oder Benutzername",
        ["login.passwordLabel"] = "Passwort",
        ["login.submitting"] = "Anmelden...",
        ["login.submitButton"] = "Anmelden",
        ["login.noAccount"] = "Noch kein Konto?",
        ["login.registerLink"] = "Registrieren",
        ["login.defaultError"] = "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
        ["login.forgotPasswordLink"] = "Passwort vergessen?",

        ["register.title"] = "Registrieren",
        ["register.usernameLabel"] = "Benutzername",
        ["register.emailLabel"] = "E-Mail",
        ["register.passwordLabel"] = "Passwort",
        ["register.confirmPasswordLabel"] = "Passwort bestätigen",
        ["register.submitButton"] = "Konto erstellen",
        ["register.submitting"] = "Registrieren...",
        ["register.passwordMismatch"] = "Die Passwörter stimmen nicht überein.",
        ["register.defaultError"] = "Registrierung fehlgeschlagen. Bitte versuche es erneut.",
        ["register.deletedAccountFound"] = "Zu dieser E-Mail existiert ein gelöschter Account.",
        ["register.restoreButton"] = "Alten Account wiederherstellen",
        ["register.restoreSuccess"] = "Wiederhergestellt",
        ["register.restoreDefaultError"] = "Wiederherstellung fehlgeschlagen. Bitte versuche es erneut.",
        ["register.createNewButton"] = "Neuen Account erstellen",
        ["register.createNewSuccess"] = "Erstellt",
        ["register.alreadyHaveAccount"] = "Bereits ein Konto?",
        ["register.loginLink"] = "Anmelden",

        ["oauth.divider"] = "oder",
        ["oauth.google"] = "Mit Google anmelden",
        ["oauth.github"] = "Mit GitHub anmelden",

        ["forgotPassword.title"] = "Passwort vergessen",
        ["forgotPassword.identifierLabel"] = "E-Mail oder Benutzername",
        ["forgotPassword.submitButton"] = "Reset-Link senden",
        ["forgotPassword.submitting"] = "Wird gesendet...",
        ["forgotPassword.successMessage"] = "Falls ein Konto mit diesen Angaben existiert, wurde eine E-Mail mit einem Reset-Link verschickt.",
        ["forgotPassword.defaultError"] = "Anfrage fehlgeschlagen. Bitte versuche es erneut.",
        ["forgotPassword.backToLogin"] = "Zurück zur Anmeldung",

        ["resetPassword.title"] = "Neues Passwort setzen",
        ["resetPassword.newPasswordLabel"] = "Neues Passwort",
        ["resetPassword.confirmPasswordLabel"] = "Passwort bestätigen",
        ["resetPassword.submitButton"] = "Passwort setzen",
        ["resetPassword.submitting"] = "Wird gesetzt...",
        ["resetPassword.passwordMismatch"] = "Die Passwörter stimmen nicht überein.",
        ["resetPassword.invalidToken"] = "Dieser Link ist ungültig oder abgelaufen.",
        ["resetPassword.backToForgotPassword"] = "Neuen Link anfordern",
        ["resetPassword.successToast"] = "Passwort erfolgreich geändert.",
        ["resetPassword.defaultError"] = "Zurücksetzen fehlgeschlagen. Bitte versuche es erneut.",

        ["profile.title"] = "Profil",
        ["profile.loading"] = "Profil wird geladen...",
        ["profile.viewPublicProfile"] = "Öffentliches Profil ansehen",
        ["profile.changeAvatarButton"] = "Profilbild ändern",
        ["profile.accountTitle"] = "Konto",
        ["profile.usernameLabel"] = "Benutzername",
        ["profile.emailLabel"] = "E-Mail",
        ["profile.saveButton"] = "Speichern",
        ["profile.saveSuccess"] = "Gespeichert",
        ["profile.saveError"] = "Speichern fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.changePasswordTitle"] = "Passwort ändern",
        ["profile.currentPasswordLabel"] = "Aktuelles Passwort",
        ["profile.newPasswordLabel"] = "Neues Passwort",
        ["profile.confirmNewPasswordLabel"] = "Neues Passwort bestätigen",
        ["profile.changePasswordButton"] = "Passwort ändern",
        ["profile.passwordMismatch"] = "Die neuen Passwörter stimmen nicht überein.",
        ["profile.passwordChangeSuccess"] = "Passwort geändert.",
        ["profile.passwordChangeError"] = "Passwort ändern fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.passwordResetHint"] = "Passwort vergessen? Fordere einen Reset-Link per E-Mail an.",
        ["profile.passwordResetButton"] = "Passwort-Reset-Link senden",
        ["profile.passwordResetToast"] = "Reset-Link wurde an deine E-Mail-Adresse gesendet.",
        ["profile.passwordResetError"] = "Senden fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.linkedAccountsTitle"] = "Verknüpfte Konten",
        ["profile.loadingLinkedAccounts"] = "Lade …",
        ["profile.unlinkButton"] = "Entfernen",
        ["profile.linkButton"] = "Verknüpfen",
        ["profile.linkedSuffix"] = "wurde verknüpft.",
        ["profile.unlinkFailed"] = "Entfernen fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.linkFailed"] = "Verknüpfen fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.linkErrorAlreadyLinked"] = "Verknüpfung fehlgeschlagen. Dieses Konto ist bereits mit einem anderen Benutzer verknüpft.",
        ["profile.linkErrorExchangeFailed"] = "Verknüpfung fehlgeschlagen. Die Anmeldung beim Anbieter ist fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.linkErrorGeneric"] = "Verknüpfung fehlgeschlagen. Bitte versuche es erneut.",
        ["profile.logoutButton"] = "Abmelden",
        ["profile.deleteAccountTitle"] = "Konto löschen",
        ["profile.deleteAccountWarning"] = "Diese Aktion kann nicht rückgängig gemacht werden. Dein Konto wird sofort deaktiviert.",
        ["profile.deleteAccountButton"] = "Konto löschen",
        ["profile.deleteConfirmWarning"] = "Bist du sicher? Das kann nicht rückgängig gemacht werden.",
        ["profile.deleteCancelButton"] = "Abbrechen",
        ["profile.deleteConfirmButton"] = "Ja, endgültig löschen",
        ["profile.deleteAccountError"] = "Konto konnte nicht gelöscht werden. Bitte versuche es erneut.",

        ["settings.title"] = "Einstellungen",
        ["settings.themeTitle"] = "Theme",
        ["settings.libraryTitle"] = "Bibliothek",
        ["settings.showCoverTextLabel"] = "Titel/Autor auf Regal-Cover anzeigen",
        ["settings.showCoverTextDescription"] = "die meisten echten Cover-Bilder tragen Titel/Autor bereits selbst",
        ["settings.notificationsTitle"] = "Benachrichtigungen",
        ["settings.loadingPreferences"] = "Lade …",
        ["settings.notif.follow.label"] = "Neuer Follower",
        ["settings.notif.follow.description"] = "Wenn dir jemand folgt",
        ["settings.notif.comment.label"] = "Neuer Kommentar",
        ["settings.notif.comment.description"] = "Wenn jemand dein Buch oder Projekt kommentiert",
        ["settings.notif.rating.label"] = "Neue Bewertung",
        ["settings.notif.rating.description"] = "Wenn jemand dein Buch bewertet",
        ["settings.notif.share.label"] = "Buch geteilt",
        ["settings.notif.share.description"] = "Wenn dir ein Buch freigegeben wird",
        ["settings.notif.activityRating.label"] = "Eigene Bewertungen im Aktivitäten-Log",
        ["settings.notif.activityRating.description"] = "Ob deine eigenen Bewertungen in deinem öffentlichen Profil auftauchen",
        ["settings.notif.activityRatingStars.label"] = "Sternezahl bei Bewertungen anzeigen",
        ["settings.notif.activityRatingStars.description"] = "Ob die konkrete Sternezahl genannt wird, wenn eine Bewertung im Log auftaucht",
    };

    // Only the subset actually asserted against by English-rendering tests
    // -- unlike German (the fallback, must be complete), this doesn't need
    // full coverage of every key.
    private static readonly Dictionary<string, string> English = new()
    {
        ["nav.home"] = "Home",
        ["nav.library"] = "Library",
        ["login.title"] = "Sign In",
        ["login.identifierLabel"] = "Email or Username",
        ["login.submitButton"] = "Sign In",
        ["register.title"] = "Register",
        ["register.usernameLabel"] = "Username",
        ["register.submitButton"] = "Create Account",
    };

    public FakeI18nService(string language = "de")
    {
        CurrentLanguage = language;
    }

    public string CurrentLanguage { get; private set; }

    public Task InitializeAsync() => Task.CompletedTask;

    public string T(string key)
    {
        var dictionary = CurrentLanguage == "en" ? English : German;
        if (dictionary.TryGetValue(key, out var value)) return value;
        // Falls back to German, same as the real service falling back to
        // its source-of-truth language for a key missing from the current one.
        return German.TryGetValue(key, out var germanValue) ? germanValue : $"⚠️ {key}";
    }

    public Task SetLanguageAsync(string language)
    {
        CurrentLanguage = language;
        return Task.CompletedTask;
    }
}
