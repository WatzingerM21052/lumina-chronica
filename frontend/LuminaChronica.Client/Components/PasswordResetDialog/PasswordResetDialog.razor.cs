using System.Text.RegularExpressions;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace LuminaChronica.Client.Components;

public enum PasswordResetStep
{
    Identify,
    CodeEntry,
    PasswordEntry,
    Success,
}

// Non-consuming live-check state for the code field (§4.3 of the
// password-reset modernization design doc). Idle covers both "nothing
// typed yet" and "field cleared after an edit" -- there's no separate
// state for that, the field just reverts to Idle.
public enum CodeCheckState
{
    Idle,
    Checking,
    Invalid,
    Valid,
    Burned,
}

// The popup replacement for ForgotPassword.razor/ResetPassword.razor's
// full-page forms (design doc §4). Three entry points share this one
// component: Login's "Passwort vergessen?" and the bookmarked
// /forgot-password route both open at Identify; Profile's reset button
// opens directly at CodeEntry with its own email as InitialIdentifier
// (firing the request immediately, since the email is already known); the
// emailed link (/reset-password?token=...) opens at PasswordEntry with
// LinkToken set, skipping the code steps entirely -- the token IS the
// proof. The routes themselves survive as thin shells (D14): bookmarks and
// every reset email already sitting in an inbox must keep working.
public partial class PasswordResetDialog : ComponentBase, IAsyncDisposable
{
    [Inject]
    private ApiClient ApiClient { get; set; } = default!;

    [Inject]
    private LuminaAuthStateProvider AuthStateProvider { get; set; } = default!;

    [Inject]
    private ToastService ToastService { get; set; } = default!;

    [Inject]
    private II18nService I18n { get; set; } = default!;

    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter]
    public string? InitialIdentifier { get; set; }

    [Parameter]
    public string? LinkToken { get; set; }

    [Parameter]
    public EventCallback OnClose { get; set; }

    private const int ResendCooldownSeconds = 60;
    private const int CodeDebounceMs = 400;
    private const int ConfirmDebounceMs = 600;
    private const int AutoCloseAfterMs = 3000;

    private bool _wasOpen;
    private PasswordResetStep _step;

    private string _identifier = string.Empty;
    private string _codeDigits = string.Empty;
    private string _lastCheckedCode = string.Empty;
    private CodeCheckState _codeState = CodeCheckState.Idle;
    private int? _attemptsLeft;
    private CancellationTokenSource? _codeDebounceCts;

    private bool _isSubmittingIdentify;
    // Shown above the identifier field in Identify, and above the code
    // field in CodeEntry (a resend or the auto-fired initial request can
    // fail there too) -- one field, not two, since only one of those two
    // steps is ever visible at a time.
    private string? _requestError;

    private string _newPassword = string.Empty;
    private string _confirmPassword = string.Empty;
    private bool _confirmBlurred;
    private bool _confirmDebounceElapsed;
    private CancellationTokenSource? _confirmDebounceCts;
    private bool _isSubmittingReset;
    private string? _resetError;

    private System.Threading.Timer? _resendTimer;
    private int _resendSecondsRemaining;

    private CancellationTokenSource? _autoCloseCts;

    protected override async Task OnParametersSetAsync()
    {
        if (IsOpen && !_wasOpen)
        {
            await OpenAsync();
        }
        _wasOpen = IsOpen;
    }

    private async Task OpenAsync()
    {
        _identifier = InitialIdentifier ?? string.Empty;
        _codeDigits = string.Empty;
        _lastCheckedCode = string.Empty;
        _codeState = CodeCheckState.Idle;
        _attemptsLeft = null;
        _newPassword = string.Empty;
        _confirmPassword = string.Empty;
        _confirmBlurred = false;
        _confirmDebounceElapsed = false;
        _requestError = null;
        _resetError = null;
        _isSubmittingIdentify = false;
        _isSubmittingReset = false;
        StopResendCooldown();

        if (!string.IsNullOrEmpty(LinkToken))
        {
            _step = PasswordResetStep.PasswordEntry;
        }
        else if (!string.IsNullOrEmpty(InitialIdentifier))
        {
            _step = PasswordResetStep.CodeEntry;
            await FireForgotPasswordRequestAsync();
            StartResendCooldown();
        }
        else
        {
            _step = PasswordResetStep.Identify;
        }
    }

    // Whether Escape / an overlay click may close the dialog from the
    // current step. PasswordEntry disables both -- the user has typed a
    // password they'd lose, and a mid-submit dismissal is how you get a
    // half-done reset in the user's mental model (§4.2). Only the explicit
    // ✕ (ShowCloseButton, always on) closes there.
    private bool CanDismissFromCurrentStep => _step is PasswordResetStep.Identify or PasswordResetStep.CodeEntry or PasswordResetStep.Success;

    private string DialogTitle => _step switch
    {
        PasswordResetStep.Identify => I18n.T("passwordReset.identifyTitle"),
        PasswordResetStep.CodeEntry => I18n.T("passwordReset.codeTitle"),
        PasswordResetStep.PasswordEntry => I18n.T("passwordReset.passwordTitle"),
        PasswordResetStep.Success => I18n.T("passwordReset.successTitle"),
        _ => string.Empty,
    };

    private Task CloseAsync() => OnClose.InvokeAsync();

    // --- Step 1: Identify ---------------------------------------------

    // The identifier field has no <form> wrapping it -- the submit button
    // lives in Dialog's separate Footer slot, not inside ChildContent, so
    // there's no single <form> element that could wrap both. Enter-to-
    // submit is wired here instead.
    private Task HandleIdentifierKeyDownAsync(KeyboardEventArgs e) => e.Key == "Enter" ? SubmitIdentifyAsync() : Task.CompletedTask;

    private async Task SubmitIdentifyAsync()
    {
        if (string.IsNullOrWhiteSpace(_identifier)) return;

        _isSubmittingIdentify = true;
        _requestError = null;
        await FireForgotPasswordRequestAsync();
        _isSubmittingIdentify = false;

        if (_requestError is null)
        {
            _step = PasswordResetStep.CodeEntry;
            StartResendCooldown();
        }
    }

    // Shared by the Identify step's submit, the CodeEntry auto-fire when
    // opened via InitialIdentifier, and the "Erneut senden" resend link --
    // all three are the same POST /api/auth/forgot-password call. Never
    // surfaces a distinct "no such account" outcome (the backend's own
    // anti-enumeration design point, D2) -- the only failure this can ever
    // set _requestError for is RATE_LIMITED or a network/5xx error.
    private async Task FireForgotPasswordRequestAsync()
    {
        var response = await ApiClient.PostAsync<ForgotPasswordRequest, object>(
            "/api/auth/forgot-password", new ForgotPasswordRequest { Identifier = _identifier });

        if (response?.Error?.Code == "RATE_LIMITED")
        {
            _requestError = FormatRateLimitMessage(response.Error.Message);
        }
        else if (response is not { Success: true })
        {
            _requestError = I18n.T("passwordReset.networkError");
        }
    }

    private string FormatRateLimitMessage(string backendMessage)
    {
        // The backend's own message is English and seconds-based
        // (rateLimitedResponse in routes/auth.ts: "Too many attempts. Try
        // again in {N} seconds."). Never show that raw string in a German
        // UI -- parse the number back out and format the app's own,
        // localized, minutes-based copy instead.
        var match = Regex.Match(backendMessage, @"(\d+)\s*seconds");
        var minutes = match.Success ? Math.Max(1, (int)Math.Ceiling(int.Parse(match.Groups[1].Value) / 60.0)) : 1;
        return string.Format(I18n.T("passwordReset.rateLimited"), minutes);
    }

    private void StartResendCooldown()
    {
        _resendSecondsRemaining = ResendCooldownSeconds;
        _resendTimer?.Dispose();
        _resendTimer = new System.Threading.Timer(_ =>
        {
            _resendSecondsRemaining--;
            if (_resendSecondsRemaining <= 0)
            {
                StopResendCooldown();
            }
            InvokeAsync(StateHasChanged);
        }, null, 1000, 1000);
    }

    private void StopResendCooldown()
    {
        _resendTimer?.Dispose();
        _resendTimer = null;
        _resendSecondsRemaining = 0;
    }

    private async Task ResendAsync()
    {
        if (_resendSecondsRemaining > 0) return;

        _requestError = null;
        await FireForgotPasswordRequestAsync();
        if (_requestError is null)
        {
            StartResendCooldown();
        }
    }

    private Task ChangeIdentifierAsync()
    {
        _step = PasswordResetStep.Identify;
        _requestError = null;
        _codeDigits = string.Empty;
        _lastCheckedCode = string.Empty;
        _codeState = CodeCheckState.Idle;
        _attemptsLeft = null;
        StopResendCooldown();
        return Task.CompletedTask;
    }

    // --- Step 2: CodeEntry ----------------------------------------------

    private async Task OnCodeInputAsync(ChangeEventArgs e)
    {
        var digits = new string((e.Value?.ToString() ?? string.Empty).Where(char.IsDigit).ToArray());
        if (digits.Length > 6) digits = digits[..6];
        _codeDigits = digits;

        _codeDebounceCts?.Cancel();

        if (digits.Length != 6 || digits == _lastCheckedCode)
        {
            if (_codeState != CodeCheckState.Burned)
            {
                _codeState = CodeCheckState.Idle;
            }
            return;
        }

        var cts = new CancellationTokenSource();
        _codeDebounceCts = cts;
        try
        {
            await Task.Delay(CodeDebounceMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
            return;
        }

        if (cts.IsCancellationRequested) return;
        await CheckCodeAsync(digits);
    }

    private async Task CheckCodeAsync(string digits)
    {
        _codeState = CodeCheckState.Checking;
        _lastCheckedCode = digits;
        StateHasChanged();

        var response = await ApiClient.PostAsync<VerifyResetCodeRequest, VerifyResetCodeResult>(
            "/api/auth/verify-reset-code", new VerifyResetCodeRequest { Identifier = _identifier, Code = digits });

        if (response?.Error?.Code == "RATE_LIMITED")
        {
            // The generous per-(ip,identifier) cap meant to survive normal
            // typing (§3.5) -- not the row-level attempt cap. Surface as a
            // transient request error, not a code-state change.
            _requestError = FormatRateLimitMessage(response.Error.Message);
            _codeState = CodeCheckState.Idle;
            return;
        }

        if (response?.Data is null)
        {
            _requestError = I18n.T("passwordReset.networkError");
            _codeState = CodeCheckState.Idle;
            return;
        }

        var result = response.Data;
        _attemptsLeft = result.AttemptsLeft;

        // Valid checked first: the last allowed guess can be both correct
        // AND leave attemptsLeft at 0 in the same response (the row's
        // attempt_count is incremented unconditionally, even on a match --
        // see verifyResetCode's own comment) -- that's still a success, not
        // a burned code.
        if (result.Valid)
        {
            _codeState = CodeCheckState.Valid;
            _step = PasswordResetStep.PasswordEntry;
        }
        else if (result.AttemptsLeft <= 0)
        {
            _codeState = CodeCheckState.Burned;
        }
        else
        {
            _codeState = CodeCheckState.Invalid;
        }
    }

    private async Task RequestNewCodeAsync()
    {
        _codeDigits = string.Empty;
        _lastCheckedCode = string.Empty;
        _codeState = CodeCheckState.Idle;
        _attemptsLeft = null;
        _requestError = null;
        await FireForgotPasswordRequestAsync();
        StartResendCooldown();
    }

    // --- Step 3: PasswordEntry ------------------------------------------

    private void OnNewPasswordInput(ChangeEventArgs e) => _newPassword = e.Value?.ToString() ?? string.Empty;

    private async Task OnConfirmPasswordInputAsync(ChangeEventArgs e)
    {
        _confirmPassword = e.Value?.ToString() ?? string.Empty;
        _confirmDebounceElapsed = false;

        _confirmDebounceCts?.Cancel();
        var cts = new CancellationTokenSource();
        _confirmDebounceCts = cts;
        try
        {
            await Task.Delay(ConfirmDebounceMs, cts.Token);
        }
        catch (TaskCanceledException)
        {
            return;
        }

        if (cts.IsCancellationRequested) return;
        _confirmDebounceElapsed = true;
        StateHasChanged();
    }

    private void OnConfirmPasswordBlur() => _confirmBlurred = true;

    private bool PasswordsMatch => _confirmPassword.Length > 0 && _newPassword == _confirmPassword;

    // Never shout "doesn't match" while the user is plausibly still
    // typing (§4.4) -- only once the confirm field is at least as long as
    // the new-password field, or it's been blurred, or 600ms have passed
    // since the last keystroke in it.
    private bool ShowConfirmMismatch =>
        _confirmPassword.Length > 0 && _newPassword != _confirmPassword &&
        (_confirmPassword.Length >= _newPassword.Length || _confirmBlurred || _confirmDebounceElapsed);

    private bool CanSubmitPassword => _newPassword.Length >= 8 && _newPassword == _confirmPassword;

    private Task HandlePasswordKeyDownAsync(KeyboardEventArgs e) => e.Key == "Enter" && CanSubmitPassword ? SubmitPasswordAsync() : Task.CompletedTask;

    private async Task SubmitPasswordAsync()
    {
        if (!CanSubmitPassword) return;

        _isSubmittingReset = true;
        _resetError = null;

        var request = !string.IsNullOrEmpty(LinkToken)
            ? new ResetPasswordRequest { Token = LinkToken, NewPassword = _newPassword }
            : new ResetPasswordRequest { Identifier = _identifier, Code = _lastCheckedCode, NewPassword = _newPassword };

        var response = await ApiClient.PostAsync<ResetPasswordRequest, AuthResult>("/api/auth/reset-password", request);

        if (response is { Success: true, Data: not null })
        {
            await AuthStateProvider.MarkUserAsAuthenticatedAsync(response.Data.Token);
            ToastService.Show(I18n.T("passwordReset.successToast"), ToastKind.Success);
            _step = PasswordResetStep.Success;
            _isSubmittingReset = false;
            ScheduleAutoClose();
            return;
        }

        if (response?.Error?.Code == "INVALID_RESET_TOKEN")
        {
            // The only legitimate backwards transition (§4.5). A link
            // token with no identifier on file has nothing for CodeEntry
            // to work with -- drop back to Identify instead so the user
            // can request a fresh one.
            _step = string.IsNullOrEmpty(LinkToken) || !string.IsNullOrEmpty(_identifier)
                ? PasswordResetStep.CodeEntry
                : PasswordResetStep.Identify;
            _requestError = I18n.T("passwordReset.codeExpiredMessage");
            _codeDigits = string.Empty;
            _lastCheckedCode = string.Empty;
            _codeState = CodeCheckState.Idle;
            _isSubmittingReset = false;
            return;
        }

        // Network/5xx: inline error, button re-enabled, password fields
        // KEPT (never destroy typed input, §4.5).
        _resetError = I18n.T("passwordReset.networkError");
        _isSubmittingReset = false;
    }

    // --- Step 4: Success --------------------------------------------------

    private string SuccessEmailNote()
    {
        var at = _identifier.IndexOf('@');
        if (at <= 0) return I18n.T("passwordReset.successEmailNoteGeneric");

        var local = _identifier[..at];
        var domain = _identifier[at..];
        var masked = local[..1] + "•••" + domain;
        return string.Format(I18n.T("passwordReset.successEmailNote"), masked);
    }

    private void ScheduleAutoClose()
    {
        _autoCloseCts?.Cancel();
        var cts = new CancellationTokenSource();
        _autoCloseCts = cts;
        _ = AutoCloseAfterDelayAsync(cts.Token);
    }

    private async Task AutoCloseAfterDelayAsync(CancellationToken token)
    {
        try
        {
            await Task.Delay(AutoCloseAfterMs, token);
        }
        catch (TaskCanceledException)
        {
            return;
        }

        if (!token.IsCancellationRequested)
        {
            await CloseAsync();
        }
    }

    public ValueTask DisposeAsync()
    {
        _resendTimer?.Dispose();
        _codeDebounceCts?.Cancel();
        _confirmDebounceCts?.Cancel();
        _autoCloseCts?.Cancel();
        return ValueTask.CompletedTask;
    }
}
