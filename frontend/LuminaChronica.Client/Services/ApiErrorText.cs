using System.Globalization;
using System.Text.RegularExpressions;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Services;

// The backend's error messages are English developer text ("Username/email
// or password is incorrect.", "name cannot be empty."), and some 57 places
// showed Error.Message as is -- in the German UI too. ApiClient runs every
// error envelope through here: the message becomes the UI language's text,
// the code stays untouched (callers branch on it). A message this doesn't
// know keeps the backend's wording rather than turning into something vaguer.
public static partial class ApiErrorText
{
    private static readonly Dictionary<string, string> CodeKeys = new()
    {
        ["EMAIL_TAKEN"] = "apiError.emailTaken",
        ["USERNAME_TAKEN"] = "apiError.usernameTaken",
        ["INVALID_CREDENTIALS"] = "apiError.invalidCredentials",
        ["INVALID_PASSWORD"] = "apiError.invalidPassword",
        ["INVALID_CODE"] = "apiError.invalidSignInLink",
        ["INVALID_RESET_TOKEN"] = "apiError.invalidResetToken",
        ["DELETED_ACCOUNT_FOUND"] = "apiError.deletedAccountFound",
        ["UNLINK_BLOCKED"] = "apiError.unlinkBlocked",
        ["UNAUTHORIZED"] = "apiError.unauthorized",
        ["FORBIDDEN"] = "apiError.forbidden",
        ["NOT_FOUND"] = "apiError.notFound",
        ["INTERNAL_ERROR"] = "apiError.internal",
        ["BIBLE_API_ERROR"] = "apiError.internal",
        ["NETWORK_ERROR"] = "apiError.network",
    };

    // Field names as the backend writes them -> UI label key.
    private static readonly Dictionary<string, string> FieldKeys = new()
    {
        ["name"] = "apiError.fieldName",
        ["title"] = "apiError.fieldTitle",
        ["content"] = "apiError.fieldContent",
        ["relationshipType"] = "apiError.fieldRelationship",
        ["username"] = "apiError.fieldUsername",
        ["file"] = "apiError.fieldFile",
        ["image"] = "apiError.fieldImage",
        ["cover"] = "apiError.fieldImage",
        ["avatar"] = "apiError.fieldImage",
        ["map"] = "apiError.fieldImage",
        ["description"] = "apiError.fieldDescription",
        ["author"] = "apiError.fieldAuthor",
        ["password"] = "apiError.fieldPassword",
        ["newPassword"] = "apiError.fieldPassword",
    };

    private static readonly Dictionary<string, string> MessageKeys = new()
    {
        ["title and file are required."] = "apiError.titleAndFileRequired",
        ["email is not a valid address."] = "apiError.invalidEmail",
        ["username must be 3-32 characters: letters, digits, '.', '_' or '-'."] = "apiError.invalidUsername",
        ["You cannot follow yourself."] = "apiError.selfFollow",
        ["You cannot rate your own book."] = "apiError.selfRate",
        ["You cannot share a book with yourself."] = "apiError.selfShare",
        ["Only public books can be rated."] = "apiError.ratePublicOnly",
        ["A character cannot have a relationship with itself."] = "apiError.selfRelationship",
    };

    public static void Localize(ApiError? error, II18nService i18n)
    {
        if (error is null) return;

        if (error.Code == "RATE_LIMITED")
        {
            var seconds = Seconds().Match(error.Message);
            error.RetryAfterSeconds ??= seconds.Success ? int.Parse(seconds.Groups[1].Value, CultureInfo.InvariantCulture) : null;
            var minutes = Math.Max(1, (int)Math.Ceiling((error.RetryAfterSeconds ?? 60) / 60.0));
            error.Message = string.Format(CultureInfo.InvariantCulture, i18n.T(minutes == 1 ? "apiError.rateLimitedOne" : "apiError.rateLimited"), minutes);
            return;
        }

        if (CodeKeys.TryGetValue(error.Code, out var codeKey))
        {
            error.Message = i18n.T(codeKey);
            return;
        }

        if (error.Code != "VALIDATION_ERROR") return;

        if (MessageKeys.TryGetValue(error.Message, out var messageKey))
        {
            error.Message = i18n.T(messageKey);
            return;
        }

        var required = Required().Match(error.Message);
        if (required.Success)
        {
            error.Message = string.Format(i18n.T("apiError.fieldRequired"), Field(required.Groups[1].Value, i18n));
            return;
        }

        var tooLong = TooLong().Match(error.Message);
        if (tooLong.Success)
        {
            error.Message = string.Format(i18n.T("apiError.fieldTooLong"), Field(tooLong.Groups[1].Value, i18n), tooLong.Groups[2].Value);
            return;
        }

        var tooShort = PasswordTooShort().Match(error.Message);
        if (tooShort.Success)
        {
            error.Message = string.Format(i18n.T("apiError.passwordTooShort"), tooShort.Groups[1].Value);
            return;
        }

        var tooBig = FileTooLarge().Match(error.Message);
        if (tooBig.Success)
        {
            error.Message = string.Format(i18n.T("apiError.fileTooLarge"), tooBig.Groups[1].Value);
            return;
        }

        if (WrongFileType().IsMatch(error.Message))
        {
            error.Message = i18n.T("apiError.fileTypeNotAllowed");
            return;
        }

        var tags = TooManyTags().Match(error.Message);
        if (tags.Success)
        {
            error.Message = string.Format(i18n.T("apiError.tooManyTags"), tags.Groups[1].Value);
            return;
        }

        var tag = TagTooLong().Match(error.Message);
        if (tag.Success)
        {
            error.Message = string.Format(i18n.T("apiError.tagTooLong"), tag.Groups[1].Value);
        }
    }

    private static string Field(string name, II18nService i18n) =>
        FieldKeys.TryGetValue(name, out var key) ? i18n.T(key) : name;

    [GeneratedRegex(@"(\d+)\s*seconds")]
    private static partial Regex Seconds();

    [GeneratedRegex(@"^(\w+) (?:is required|cannot be empty)\.$")]
    private static partial Regex Required();

    [GeneratedRegex(@"^(\w+) must be at most (\d+) characters\.$")]
    private static partial Regex TooLong();

    [GeneratedRegex(@"^(?:new)?[pP]assword must be at least (\d+) characters\.$")]
    private static partial Regex PasswordTooShort();

    [GeneratedRegex(@"exceeds the (\d+)MB limit\.$")]
    private static partial Regex FileTooLarge();

    [GeneratedRegex(@"^(?:Avatar image|Book file|Cover image|Document|Image|Map image) (?:must be one of: |content does not match its)")]
    private static partial Regex WrongFileType();

    [GeneratedRegex(@"^At most (\d+) tags are allowed\.$")]
    private static partial Regex TooManyTags();

    [GeneratedRegex(@"^Each tag must be at most (\d+) characters\.$")]
    private static partial Regex TagTooLong();
}
