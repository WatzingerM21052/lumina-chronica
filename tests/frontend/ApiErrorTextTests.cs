using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The backend answers in English developer text; the UI shows its own
// language. The code must survive untouched -- Register and the reset
// dialog branch on it.
public class ApiErrorTextTests
{
    private static ApiError Localized(string code, string message)
    {
        var error = new ApiError { Code = code, Message = message };
        ApiErrorText.Localize(error, new FakeI18nService());
        return error;
    }

    [Theory]
    [InlineData("INVALID_CREDENTIALS", "Username/email or password is incorrect.", "Benutzername/E-Mail oder Passwort stimmt nicht.")]
    [InlineData("EMAIL_TAKEN", "This email is already registered.", "Diese E-Mail-Adresse ist schon registriert.")]
    [InlineData("VALIDATION_ERROR", "name cannot be empty.", "Der Name darf nicht leer sein.")]
    [InlineData("VALIDATION_ERROR", "title is required.", "Der Titel darf nicht leer sein.")]
    [InlineData("VALIDATION_ERROR", "title and file are required.", "Bitte wähle eine Datei und gib einen Titel ein.")]
    [InlineData("VALIDATION_ERROR", "description must be at most 5000 characters.", "Die Beschreibung darf höchstens 5000 Zeichen lang sein.")]
    [InlineData("VALIDATION_ERROR", "password must be at least 6 characters.", "Das Passwort braucht mindestens 6 Zeichen.")]
    [InlineData("VALIDATION_ERROR", "Book file exceeds the 50MB limit.", "Die Datei ist größer als 50 MB.")]
    [InlineData("VALIDATION_ERROR", "Cover image must be one of: jpg, jpeg, png, webp.", "Diese Datei passt nicht: Dateityp oder Inhalt wird nicht unterstützt.")]
    [InlineData("VALIDATION_ERROR", "You cannot share a book with yourself.", "Mit dir selbst kannst du kein Buch teilen.")]
    public void TranslatesKnownMessagesAndKeepsTheCode(string code, string message, string expected)
    {
        var error = Localized(code, message);

        Assert.Equal(expected, error.Message);
        Assert.Equal(code, error.Code);
    }

    [Fact]
    public void RateLimitKeepsTheSecondsForCallers()
    {
        var error = Localized("RATE_LIMITED", "Too many attempts. Try again in 900 seconds.");

        Assert.Equal(900, error.RetryAfterSeconds);
        Assert.Equal("Zu viele Versuche. Bitte warte 15 Minuten.", error.Message);
    }

    [Fact]
    public void AnUnknownValidationMessageStaysAsSent()
    {
        Assert.Equal("Something new.", Localized("VALIDATION_ERROR", "Something new.").Message);
    }
}
