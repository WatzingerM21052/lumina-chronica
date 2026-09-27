using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The state machine + live validation behind the password-reset popup
// (design doc docs/superpowers/specs/2026-09-27-password-reset-
// modernization-design.md §4, §8 item 17). DialogTests.cs covers the
// shared Dialog primitive itself; these cover what PasswordResetDialog
// builds on top of it.
public class PasswordResetDialogTests : BunitContext
{
    // Every delay in the dialog (code/confirm debounces, resend countdown,
    // auto-close) runs on the injected TimeProvider, so tests advance this
    // clock explicitly instead of racing real timers.
    private readonly FakeTimeProvider _timeProvider = new();

    public PasswordResetDialogTests()
    {
        Services.AddSingleton<TimeProvider>(_timeProvider);
    }

    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan CodeDebounce = TimeSpan.FromMilliseconds(400);

    private void RegisterServices(HttpMessageHandler handler)
    {
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<ToastService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private static RoutedFakeHttpMessageHandler ForgotPasswordAlwaysOk() =>
        new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/forgot-password", """{"success":true,"data":{"message":"ok"}}""");

    // Identify is never skipped, even when InitialIdentifier pre-fills it
    // (Profile's entry point) -- the user must see and submit it
    // themselves, same as Login's flow (see PasswordResetDialog.razor.cs's
    // Open() comment for why that changed from the original design).
    private static void SubmitIdentifyAndAdvanceToCodeEntry<TComponent>(Bunit.IRenderedComponent<TComponent> cut, string identifier = "alice@example.com")
        where TComponent : Microsoft.AspNetCore.Components.IComponent
    {
        var identifierInput = cut.Find("#passwordResetIdentifier");
        if (((AngleSharp.Html.Dom.IHtmlInputElement)identifierInput).Value != identifier)
        {
            identifierInput.Input(identifier);
        }
        cut.Find("button.btn-primary").Click();
    }

    [Fact]
    public void AdvancingAStep_MovesFocusToTheNewStepsFirstField()
    {
        // Review M-3: the clicked "send code" button is removed by the step
        // change, which dropped focus to <body> -- Escape and Tab then no
        // longer reached the dialog and screen readers heard nothing.
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        var before = JSInterop.Invocations["focusFirst"].Count;
        SubmitIdentifyAndAdvanceToCodeEntry(cut);

        cut.WaitForAssertion(() => Assert.True(JSInterop.Invocations["focusFirst"].Count > before), Wait);
    }

    [Fact]
    public void OpensAtIdentify_WithNoInitialIdentifierOrLinkToken()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));

        Assert.NotNull(cut.Find("#passwordResetIdentifier"));
        Assert.Empty(cut.FindAll("#passwordResetCode"));
    }

    [Fact]
    public void OpensAtIdentify_WithTheFieldPreFilled_WhenInitialIdentifierGiven_AndDoesNotAutoFire()
    {
        // Profile's entry point pre-fills the field (less typing for a
        // user who's already authenticated as themselves) but must NOT
        // skip Identify or fire the request before the user sees it --
        // silently jumping straight to "check your email" left the user
        // with no visible confirmation of which address the code was
        // about to go to, and a step rail advertising a step it never
        // actually showed.
        HttpRequestMessage? postRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/forgot-password"), r =>
            {
                postRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"message":"ok"}}""");
            });
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        var identifierInput = (AngleSharp.Html.Dom.IHtmlInputElement)cut.Find("#passwordResetIdentifier");
        Assert.Equal("alice@example.com", identifierInput.Value);
        Assert.Empty(cut.FindAll("#passwordResetCode"));
        Assert.Null(postRequest);

        cut.Find("button.btn-primary").Click();

        Assert.NotNull(cut.Find("#passwordResetCode"));
        Assert.NotNull(postRequest);
        Assert.EndsWith("/forgot-password", postRequest!.RequestUri!.AbsolutePath);
    }

    [Fact]
    public void CodeEntryIntro_ShowsTheTypedEmail_MaskedButRecognizable()
    {
        // Only ever echoes back what the user themselves just typed one
        // step earlier -- not something the backend disclosed, so this
        // can't reopen the D2 enumeration hole. Masked ("a•••@...") rather
        // than shown in full, matching the Success step's own treatment.
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut, "alice@example.com");

        Assert.Contains("a•••@example.com", cut.Markup);
    }

    [Fact]
    public void CodeEntryIntro_FallsBackToGenericText_WhenTheTypedIdentifierIsAUsername()
    {
        // A username has no email address the client can show at all --
        // the account's real email is never sent to the browser pre-reset
        // (that's the whole anti-enumeration point). The generic fallback
        // is correct here, not a gap.
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut, "alice");

        Assert.Contains("per E-Mail geschickt", cut.Markup);
        Assert.DoesNotContain("@", cut.Markup);
    }

    [Fact]
    public void OpensAtPasswordEntry_WhenLinkTokenGiven_AndHidesTheStepRail()
    {
        // LinkToken skips Identify AND CodeEntry entirely -- the token IS
        // the proof. With only one real step ever shown in that session,
        // the 3-dot rail has nothing meaningful to display.
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.LinkToken, "some-raw-token"));

        Assert.NotNull(cut.Find("#passwordResetNewPassword"));
        Assert.Empty(cut.FindAll("#passwordResetCode"));
        Assert.Empty(cut.FindAll("#passwordResetIdentifier"));
        Assert.Empty(cut.FindAll(".password-reset-steps"));
    }

    private RoutedFakeHttpMessageHandler HandlerForCode(Func<string, string> responseForCode, Action<string>? onVerifyCall = null)
    {
        return new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/forgot-password", """{"success":true,"data":{"message":"ok"}}""")
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/verify-reset-code"), r =>
            {
                var body = r.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
                var code = System.Text.Json.JsonDocument.Parse(body).RootElement.GetProperty("code").GetString()!;
                onVerifyCall?.Invoke(code);
                return RoutedFakeHttpMessageHandler.JsonResponse(responseForCode(code));
            });
    }

    [Fact]
    public void ValidCode_AdvancesToPasswordEntry()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":true,"attemptsLeft":9}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("123456");
        _timeProvider.Advance(CodeDebounce);

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetNewPassword")), Wait);
    }

    [Fact]
    public void InvalidCode_ShowsInlineErrorAndStaysOnCodeEntry()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":8}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("000000");
        _timeProvider.Advance(CodeDebounce);

        cut.WaitForAssertion(() => Assert.Contains("Der Code stimmt nicht.", cut.Markup), Wait);
        Assert.NotNull(cut.Find("#passwordResetCode"));
    }

    [Fact]
    public void NetworkErrorOnLiveCheck_RetypingTheSameCode_ChecksAgain()
    {
        // Regression (review M-2): _lastCheckedCode was set before the
        // request and never cleared on failure, so after one dropped
        // connection the de-dup guard silently swallowed every retry of the
        // same six digits.
        var callCount = 0;
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/forgot-password", """{"success":true,"data":{"message":"ok"}}""")
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/verify-reset-code"), _ =>
            {
                callCount++;
                if (callCount == 1) throw new HttpRequestException("connection dropped");
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"valid":true,"attemptsLeft":9}}""");
            });
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);

        cut.Find("#passwordResetCode").Input("123456");
        _timeProvider.Advance(CodeDebounce);
        cut.WaitForAssertion(() => Assert.Contains("Verbindung fehlgeschlagen", cut.Markup), Wait);

        cut.Find("#passwordResetCode").Input("12345");
        cut.Find("#passwordResetCode").Input("123456");
        _timeProvider.Advance(CodeDebounce);
        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetNewPassword")), Wait);
        Assert.Equal(2, callCount);
    }

    [Fact]
    public void BackendWithoutCodeRoute_PointsTheUserToTheEmailLink_InsteadOfANetworkError()
    {
        // Review M-7: an older backend deploy (frontend auto-deploys, the
        // backend doesn't) answers the live check with the framework's
        // generic 404. That is not a flaky connection -- retrying can never
        // help, but the link in the same email still works.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/forgot-password", """{"success":true,"data":{"message":"ok"}}""")
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/verify-reset-code"), _ =>
                new HttpResponseMessage(System.Net.HttpStatusCode.NotFound)
                {
                    Content = new StringContent("""{"success":false,"error":{"code":"NOT_FOUND","message":"Not found."}}""", System.Text.Encoding.UTF8, "application/json"),
                });
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("123456");
        _timeProvider.Advance(CodeDebounce);

        cut.WaitForAssertion(() => Assert.Contains("Link in der E-Mail", cut.Markup), Wait);
        Assert.DoesNotContain("Verbindung fehlgeschlagen", cut.Markup);
    }

    [Fact]
    public void RetypingTheSameSixDigits_DoesNotCallTheServerTwice()
    {
        // Isolates _lastCheckedCode specifically, not just "nothing fired
        // during a debounce window": 111111 (call 1) -> 222222 (call 2,
        // proves the field still checks a genuinely new value) -> 111111
        // again (call 3, proves retyping an OLD-but-not-most-recent value
        // still checks -- de-dup is against the LAST checked code only,
        // not a history) -> 111111 once more (must NOT call again -- this
        // is the only step that actually isolates the de-dup guard; a
        // version of the component without _lastCheckedCode at all would
        // still pass every step above, including this one being the sole
        // exception).
        var callCount = 0;
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":8}}""", _ => callCount++);
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);

        cut.Find("#passwordResetCode").Input("111111");
        _timeProvider.Advance(CodeDebounce);
        cut.WaitForAssertion(() => Assert.Equal(1, callCount), Wait);

        cut.Find("#passwordResetCode").Input("222222");
        _timeProvider.Advance(CodeDebounce);
        cut.WaitForAssertion(() => Assert.Equal(2, callCount), Wait);

        cut.Find("#passwordResetCode").Input("111111");
        _timeProvider.Advance(CodeDebounce);
        cut.WaitForAssertion(() => Assert.Equal(3, callCount), Wait);

        cut.Find("#passwordResetCode").Input("111111");
        _timeProvider.Advance(CodeDebounce); // let a (nonexistent) 4th debounce fire before asserting it didn't
        Assert.Equal(3, callCount);
    }

    [Fact]
    public void AttemptsLeftAtOrBelowThree_IsShown_ButNotAboveThree()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":7}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("000000");
        _timeProvider.Advance(CodeDebounce);
        cut.WaitForAssertion(() => Assert.Contains("Der Code stimmt nicht.", cut.Markup), Wait);

        // 7 left is above the <=3 threshold -- showing "Noch 7 Versuche"
        // this early is exactly the anxiety-inducing, attacker-informing
        // behavior §4.3 says not to do.
        Assert.DoesNotContain("Versuche", cut.Markup);
    }

    [Fact]
    public void AttemptsLeftThree_IsShown()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":3}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("000000");
        _timeProvider.Advance(CodeDebounce);

        cut.WaitForAssertion(() => Assert.Contains("Noch 3 Versuche", cut.Markup), Wait);
    }

    [Fact]
    public void CodeBurned_ShowsPanelWithRequestNewCodeButton_InsteadOfTheField()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":0}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("000000");
        _timeProvider.Advance(CodeDebounce);

        cut.WaitForAssertion(() => Assert.Contains("Dieser Code ist nicht mehr gültig.", cut.Markup), Wait);
        Assert.Empty(cut.FindAll("#passwordResetCode"));
        Assert.NotNull(cut.Find("button.btn-primary"));
    }

    [Fact]
    public void ValidCodeOnTheFinalAllowedAttempt_StillAdvances_EvenThoughAttemptsLeftIsZero()
    {
        // verifyResetCode increments attempt_count unconditionally, even on
        // a match -- so a correct code on the very last allowed guess
        // returns {valid:true, attemptsLeft:0} in the SAME response. That
        // must still be treated as success, not burned.
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":true,"attemptsLeft":0}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        cut.Find("#passwordResetCode").Input("123456");
        _timeProvider.Advance(CodeDebounce);

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetNewPassword")), Wait);
    }

    [Fact]
    public void ResendButton_IsDisabledImmediatelyAfterTheInitialSend()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);

        // The just-fired initial request already started the cooldown --
        // no separate "Erneut senden" button should be clickable yet, just
        // the countdown text in its place.
        Assert.DoesNotContain(cut.FindAll("button"), b => b.TextContent == "Erneut senden");
        Assert.Contains("Erneut senden in", cut.Markup);
    }

    [Fact]
    public void ConfirmMismatch_DoesNotShowWhileConfirmIsStillShorterThanNewPassword()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.LinkToken, "some-token"));

        cut.Find("#passwordResetNewPassword").Input("a very long password");
        cut.Find("#passwordResetConfirmPassword").Input("a very l");

        Assert.DoesNotContain("Stimmt nicht überein", cut.Markup);
    }

    [Fact]
    public void ConfirmMismatch_ShowsOnceConfirmIsAtLeastAsLongAsNewPassword()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.LinkToken, "some-token"));

        cut.Find("#passwordResetNewPassword").Input("short123");
        cut.Find("#passwordResetConfirmPassword").Input("short12X");

        Assert.Contains("Stimmt nicht überein", cut.Markup);
    }

    [Fact]
    public void ConfirmMatch_ShowsImmediately()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.LinkToken, "some-token"));

        cut.Find("#passwordResetNewPassword").Input("matching1");
        cut.Find("#passwordResetConfirmPassword").Input("matching1");

        Assert.Contains("Stimmt überein", cut.Markup);
    }

    [Fact]
    public void SubmitButton_DisabledUntilBothLengthAndMatchRulesPass()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.LinkToken, "some-token"));

        var submit = cut.Find("button.btn-primary");
        Assert.True(submit.HasAttribute("disabled"));

        cut.Find("#passwordResetNewPassword").Input("short");
        cut.Find("#passwordResetConfirmPassword").Input("short");
        Assert.True(cut.Find("button.btn-primary").HasAttribute("disabled"));

        cut.Find("#passwordResetNewPassword").Input("longenough1");
        cut.Find("#passwordResetConfirmPassword").Input("longenough1");
        Assert.False(cut.Find("button.btn-primary").HasAttribute("disabled"));
    }

    [Fact]
    public void ChangingIdentifier_ThenReturningToCodeEntry_TheCodeFieldIsEmpty_NotTheOldDigits()
    {
        // The code input is deliberately uncontrolled (no reactive `value`
        // attribute, per §4.3 -- rewriting it on @oninput causes
        // cursor-jump). That's only safe if Blazor actually destroys and
        // recreates the <input> element when CodeEntry is left and
        // re-entered (e.g. via "Andere E-Mail-Adresse" then a fresh
        // submit) -- if it instead patched/reused the same DOM node, the
        // browser-side typed value would survive even though C#'s
        // _codeDigits was reset to "", showing the user stale digits the
        // component believes is an empty field.
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut, "alice@example.com");

        cut.Find("#passwordResetCode").Input("123456");
        cut.Find("button.link-button").Click(); // "Andere E-Mail-Adresse"

        SubmitIdentifyAndAdvanceToCodeEntry(cut, "bob@example.com");

        var codeInput = (AngleSharp.Html.Dom.IHtmlInputElement)cut.Find("#passwordResetCode");
        Assert.Equal(string.Empty, codeInput.Value);
    }

    [Fact]
    public void RateLimitedOnIdentify_ShowsALocalizedMinutesMessage_NotTheBackendsRawEnglishOne()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/forgot-password"), _ =>
                new HttpResponseMessage(System.Net.HttpStatusCode.TooManyRequests)
                {
                    Content = new StringContent(
                        """{"success":false,"error":{"code":"RATE_LIMITED","message":"Too many attempts. Try again in 900 seconds."}}""",
                        System.Text.Encoding.UTF8, "application/json"),
                });
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);

        cut.WaitForAssertion(() => Assert.Contains("Bitte in 15 Minuten erneut versuchen.", cut.Markup), Wait);
        Assert.DoesNotContain("Too many attempts", cut.Markup);
    }

    [Fact]
    public void StepPanel_SlidesInForwardOnAdvance_AndBackwardOnChangeIdentifier()
    {
        // §7.3 motion: forward steps enter from the right, a step back from
        // the left -- the direction lives on the keyed panel as .is-back.
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));
        SubmitIdentifyAndAdvanceToCodeEntry(cut);
        Assert.DoesNotContain("is-back", cut.Find(".password-reset-panel").ClassList);

        cut.Find("button.link-button").Click(); // "Andere E-Mail-Adresse"

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetIdentifier")), Wait);
        Assert.Contains("is-back", cut.Find(".password-reset-panel").ClassList);
    }
}
