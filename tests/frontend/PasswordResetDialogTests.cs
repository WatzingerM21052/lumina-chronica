using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The state machine + live validation behind the password-reset popup
// (design doc docs/superpowers/specs/2026-09-27-password-reset-
// modernization-design.md §4, §8 item 17). DialogTests.cs covers the
// shared Dialog primitive itself; these cover what PasswordResetDialog
// builds on top of it.
public class PasswordResetDialogTests : BunitContext
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(2);

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

    [Fact]
    public void OpensAtIdentify_WithNoInitialIdentifierOrLinkToken()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters.Add(p => p.IsOpen, true));

        Assert.NotNull(cut.Find("#passwordResetIdentifier"));
        Assert.Empty(cut.FindAll("#passwordResetCode"));
    }

    [Fact]
    public void OpensAtCodeEntry_AndFiresTheRequest_WhenInitialIdentifierGiven()
    {
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

        Assert.NotNull(cut.Find("#passwordResetCode"));
        Assert.NotNull(postRequest);
        Assert.EndsWith("/forgot-password", postRequest!.RequestUri!.AbsolutePath);
    }

    [Fact]
    public void OpensAtPasswordEntry_WhenLinkTokenGiven()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.LinkToken, "some-raw-token"));

        Assert.NotNull(cut.Find("#passwordResetNewPassword"));
        Assert.Empty(cut.FindAll("#passwordResetCode"));
        Assert.Empty(cut.FindAll("#passwordResetIdentifier"));
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

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("123456");

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetNewPassword")), Wait);
    }

    [Fact]
    public void InvalidCode_ShowsInlineErrorAndStaysOnCodeEntry()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":8}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("000000");

        cut.WaitForAssertion(() => Assert.Contains("Der Code stimmt nicht.", cut.Markup), Wait);
        Assert.NotNull(cut.Find("#passwordResetCode"));
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

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("111111");
        cut.WaitForAssertion(() => Assert.Equal(1, callCount), Wait);

        cut.Find("#passwordResetCode").Input("222222");
        cut.WaitForAssertion(() => Assert.Equal(2, callCount), Wait);

        cut.Find("#passwordResetCode").Input("111111");
        cut.WaitForAssertion(() => Assert.Equal(3, callCount), Wait);

        cut.Find("#passwordResetCode").Input("111111");
        Thread.Sleep(600); // let a (nonexistent) 4th debounce fire before asserting it didn't
        Assert.Equal(3, callCount);
    }

    [Fact]
    public void AttemptsLeftAtOrBelowThree_IsShown_ButNotAboveThree()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":7}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("000000");
        cut.WaitForAssertion(() => Assert.Contains("Der Code stimmt nicht.", cut.Markup), Wait);

        // 9 (10 - 7 spent... actually attemptsLeft IS what's left, 7 left)
        // is above the <=3 threshold -- showing "Noch 7 Versuche" this
        // early is exactly the anxiety-inducing, attacker-informing
        // behavior §4.3 says not to do.
        Assert.DoesNotContain("Versuche", cut.Markup);
    }

    [Fact]
    public void AttemptsLeftThree_IsShown()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":3}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("000000");

        cut.WaitForAssertion(() => Assert.Contains("Noch 3 Versuche", cut.Markup), Wait);
    }

    [Fact]
    public void CodeBurned_ShowsPanelWithRequestNewCodeButton_InsteadOfTheField()
    {
        var handler = HandlerForCode(_ => """{"success":true,"data":{"valid":false,"attemptsLeft":0}}""");
        RegisterServices(handler);

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("000000");

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

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("123456");

        cut.WaitForAssertion(() => Assert.NotNull(cut.Find("#passwordResetNewPassword")), Wait);
    }

    [Fact]
    public void ResendButton_IsDisabledImmediatelyAfterTheInitialSendAndAfterAResend()
    {
        RegisterServices(ForgotPasswordAlwaysOk());

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        // The auto-fired initial request already started the cooldown --
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

        var cut = Render<PasswordResetDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialIdentifier, "alice@example.com"));

        cut.Find("#passwordResetCode").Input("123456");
        cut.Find("button.link-button").Click(); // "Andere E-Mail-Adresse"

        cut.Find("#passwordResetIdentifier").Input("bob@example.com");
        cut.Find("button.btn-primary").Click(); // back to CodeEntry

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
        cut.Find("#passwordResetIdentifier").Input("alice@example.com");
        cut.Find("button.btn-primary").Click();

        cut.WaitForAssertion(() => Assert.Contains("Bitte in 15 Minuten erneut versuchen.", cut.Markup), Wait);
        Assert.DoesNotContain("Too many attempts", cut.Markup);
    }
}
