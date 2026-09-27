using System.Linq;
using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProfilePageTests : BunitContext
{
    private const string ProfileJson = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01","hasPassword":true}}""";

    // Profile now also fires GET /api/auth/oauth/linked from OnInitializedAsync,
    // so every test needs a route for it -- under the single-fixed-response
    // FakeHttpMessageHandler, that GET would get the /api/users/me profile body
    // back (an object) where List<LinkedOAuthProvider> expects an array, and
    // System.Text.Json throws. This routes /linked to an empty array and falls
    // back to ProfileJson for every other GET, matching what the plain
    // FakeHttpMessageHandler(ProfileJson) tests below used to do.
    private static RoutedFakeHttpMessageHandler NoLinkedProvidersHandler(string profileJson = ProfileJson) =>
        new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(profileJson));

    [Fact]
    public void Profile_PublicProfileLink_HasNoLeadingSlash()
    {
        // Regression coverage: a leading "/" makes the browser treat this as
        // domain-root-relative, bypassing the <base href> rewrite that GitHub
        // Pages project sites need for their subpath -- the exact class of
        // bug already documented for issue #38, caught live for this link
        // during Community Phase 1 (issue #300) verification.
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        var link = cut.Find("a");
        Assert.Equal("u/alice", link.GetAttribute("href"));
    }

    [Fact]
    public void Profile_NoAvatarSet_ShowsPlaceholderIcon()
    {
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        Assert.Single(cut.FindAll(".profile-avatar-placeholder"));
        Assert.Empty(cut.FindAll("img.profile-avatar-preview"));
    }

    [Fact]
    public void Profile_AvatarUrlSet_ShowsItAsImage()
    {
        const string json = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":"https://example.com/api/users/alice/avatar","roleName":"USER","createdAt":"2026-01-01"}}""";
        var handler = NoLinkedProvidersHandler(json);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        var img = cut.Find("img.profile-avatar-preview");
        Assert.Equal("https://example.com/api/users/alice/avatar", img.GetAttribute("src"));
    }

    [Fact]
    public void Profile_ChangeAvatarButton_OpensUploadDialog()
    {
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Profile>();
        Assert.Empty(cut.FindAll("#avatarDialogUpload"));

        cut.Find("#changeAvatarButton").Click();

        Assert.Single(cut.FindAll("#avatarDialogUpload"));
    }

    [Fact]
    public void Profile_SelectingAnAvatarFile_ShowsPreviewAndDoesNotUploadUntilConfirmed()
    {
        HttpRequestMessage? avatarRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put && r.RequestUri!.AbsolutePath.EndsWith("/avatar"), r =>
            {
                avatarRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson);
            })
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        var blobModule = JSInterop.SetupModule("./js/blobUrl.js");
        blobModule.Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-avatar-url");
        blobModule.SetupVoid("revokeObjectUrl", _ => true).SetVoidResult();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Profile>();
        cut.Find("#changeAvatarButton").Click();
        cut.FindComponent<InputFile>().UploadFiles(InputFileContent.CreateFromText("avatar bytes", "avatar.jpg"));

        // Selecting a file only previews it -- no upload request yet, and the
        // upload button is now enabled.
        Assert.Null(avatarRequest);
        Assert.NotNull(cut.Find("img.avatar-upload-dialog-preview"));
        Assert.False(cut.Find("#avatarDialogUpload").HasAttribute("disabled"));

        cut.Find("#avatarDialogUpload").Click();

        Assert.Equal(HttpMethod.Put, avatarRequest?.Method);
        Assert.Equal("/api/users/me/avatar", avatarRequest?.RequestUri?.AbsolutePath);
        cut.WaitForAssertion(() => Assert.Empty(cut.FindAll("#avatarDialogUpload")));
    }

    [Fact]
    public void Profile_SelectingADisallowedFileType_ShowsErrorAndDoesNotUpload()
    {
        HttpRequestMessage? avatarRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put && r.RequestUri!.AbsolutePath.EndsWith("/avatar"), r =>
            {
                avatarRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson);
            })
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Profile>();
        cut.Find("#changeAvatarButton").Click();
        cut.FindComponent<InputFile>().UploadFiles(InputFileContent.CreateFromText("not an image", "avatar.gif"));

        Assert.Null(avatarRequest);
        Assert.Contains("form-error", cut.Markup);
        Assert.True(cut.Find("#avatarDialogUpload").HasAttribute("disabled"));
    }

    [Fact]
    public void Profile_CancellingAvatarDialog_ClosesItWithoutUploading()
    {
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Profile>();
        cut.Find("#changeAvatarButton").Click();
        Assert.Single(cut.FindAll("#avatarDialogUpload"));

        cut.Find(".dialog-actions .btn:not(.btn-primary)").Click();

        Assert.Empty(cut.FindAll("#avatarDialogUpload"));
    }

    [Fact]
    public void Profile_RendersDeleteAccountSection()
    {
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        Assert.NotNull(cut.Find("#deleteAccountPassword"));
        Assert.Contains("Konto löschen", cut.Markup);
    }

    [Fact]
    public void Profile_DeleteAccount_OAuthOnlyAccount_HidesPasswordField_AndEnablesButtonWithoutOne()
    {
        // Regression coverage: HasPassword used to not exist on UserProfile at
        // all, so this page hardcoded _hasRealPassword = true regardless of
        // the actual account -- an OAuth-only user (no password to type) saw
        // a required password field and a permanently-disabled delete button,
        // even though deleteUser on the backend never required one for such
        // an account in the first place. Found live: a real OAuth-only user
        // asked how they were supposed to delete an account they have no
        // password for.
        const string oauthOnlyProfileJson = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01","hasPassword":false}}""";
        var handler = NoLinkedProvidersHandler(oauthOnlyProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        Assert.Empty(cut.FindAll("#deleteAccountPassword"));

        cut.Find("#confirmDeleteAccount").Click();

        Assert.False(cut.Find("#deleteAccountButton").HasAttribute("disabled"));
    }

    [Fact]
    public void Profile_OAuthOnlyAccount_HidesThePasswordResetButton()
    {
        // An OAuth-only account has no password to reset -- clicking
        // through would fire /forgot-password same as any other account,
        // but the backend sends a different email for that case (no code
        // at all, just a "sign in with Google/GitHub instead" notice, see
        // requestPasswordReset's OAUTH_NO_PASSWORD_SENTINEL branch), which
        // would make the popup's "enter the code we sent you" step
        // actively misleading for a code that was never sent. Hide the
        // entry point entirely rather than let it open a dialog promising
        // something that won't happen.
        const string oauthOnlyProfileJson = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01","hasPassword":false}}""";
        var handler = NoLinkedProvidersHandler(oauthOnlyProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        Assert.Empty(cut.FindAll(".profile-password-reset"));
    }

    [Fact]
    public void Profile_DeleteAccount_WrongPassword_ShowsErrorWithoutNavigating()
    {
        // FakeHttpMessageHandler (used by the other tests in this file) returns
        // the same canned body for every request regardless of URL/method, so it
        // can't serve a profile-load response and a different delete-error
        // response in the same render. This test needs both -- the profile GET
        // for the initial render, then a distinct error body for the DELETE --
        // so it uses RoutedFakeHttpMessageHandler instead, the same handler the
        // avatar-upload tests above already use for their own two-different-
        // responses-in-one-render case.
        const string deleteErrorJson = """{"success":false,"error":{"code":"INVALID_PASSWORD","message":"Current password is incorrect."}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, _ => RoutedFakeHttpMessageHandler.JsonResponse(deleteErrorJson))
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();
        cut.Find("#deleteAccountPassword").Input("wrong password");
        cut.Find("#confirmDeleteAccount").Click();
        cut.Find("#deleteAccountButton").Click();

        Assert.Contains("Current password is incorrect.", cut.Markup);
    }

    [Fact]
    public void Profile_DeleteAccount_DisablesButtonWhileInFlight_PreventingDoubleSubmit()
    {
        // Regression coverage: a live test found the DELETE request could fire
        // twice from a single confirm click (no guard against a second click
        // landing while the first request was still in flight) -- one request
        // soft-deleted the account, the concurrent one then hit "user
        // disappeared" and surfaced as a confusing failure despite the
        // deletion having actually succeeded. Counts requests reaching the
        // handler directly rather than trusting the UI alone.
        var handler = new HangingDeleteHttpMessageHandler(ProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();
        cut.Find("#deleteAccountPassword").Input("correct password");
        cut.Find("#confirmDeleteAccount").Click();
        cut.Find("#deleteAccountButton").Click();

        Assert.Equal(1, handler.DeleteRequestCount);
        Assert.True(cut.Find("#deleteAccountButton").HasAttribute("disabled"));

        // The button is disabled, so this is what a real second click hits --
        // nothing should reach the handler while the first request is pending.
        cut.Find("#deleteAccountButton").Click();
        Assert.Equal(1, handler.DeleteRequestCount);
    }

    // Routes GET /linked and GET /me normally, but every DELETE request hangs
    // forever (after being counted) -- lets a test observe the button's
    // disabled state and request count while the delete is still in flight.
    private sealed class HangingDeleteHttpMessageHandler(string profileJson) : HttpMessageHandler
    {
        private int _deleteRequestCount;
        public int DeleteRequestCount => _deleteRequestCount;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Method == HttpMethod.Delete)
            {
                Interlocked.Increment(ref _deleteRequestCount);
                return new TaskCompletionSource<HttpResponseMessage>().Task;
            }

            if (request.RequestUri!.AbsolutePath.EndsWith("/linked"))
            {
                return Task.FromResult(RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""));
            }

            return Task.FromResult(RoutedFakeHttpMessageHandler.JsonResponse(profileJson));
        }
    }

    [Fact]
    public void Profile_RendersLinkedAccountsSection_ShowingLinkedAndUnlinkedProviders()
    {
        // GET /api/auth/oauth/linked returns one linked provider (Google) and
        // GET /api/users/me returns the profile -- two distinct GET responses
        // in one render, which requires RoutedFakeHttpMessageHandler (see the
        // NoLinkedProvidersHandler comment above for why the plain
        // FakeHttpMessageHandler can't do this).
        const string linkedJson = """{"success":true,"data":[{"provider":"google","email":"alice@gmail.com","linkedAt":"2026-01-01T00:00:00Z"}]}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse(linkedJson))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();

        Assert.Contains("Verknüpfte Konten", cut.Markup);
        Assert.Contains("Google — alice@gmail.com", cut.Markup);
        Assert.Contains("Entfernen", cut.Markup);
        Assert.Contains("GitHub", cut.Markup);
        Assert.Contains("Verknüpfen", cut.Markup);
    }

    [Fact]
    public void Profile_LinkedQueryParam_ShowsSuccessBanner()
    {
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        Services.GetRequiredService<NavigationManager>().NavigateTo("profile?linked=google");

        var cut = Render<Profile>();

        Assert.Contains("Google wurde verknüpft.", cut.Markup);
        Assert.Contains("form-success", cut.Markup);
    }

    [Fact]
    public void Profile_LinkErrorQueryParam_ShowsErrorBanner()
    {
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        Services.GetRequiredService<NavigationManager>().NavigateTo("profile?linkError=already_linked");

        var cut = Render<Profile>();

        Assert.Contains("bereits mit einem anderen Benutzer verknüpft", cut.Markup);
        Assert.Contains("form-error", cut.Markup);
    }

    [Fact]
    public void Profile_LinkErrorExchangeFailedQueryParam_ShowsDistinctErrorBanner()
    {
        // linkError must branch on the actual reason code -- the callback
        // can redirect here with more than one reason (already_linked,
        // exchange_failed) -- instead of always showing the
        // "already_linked" message regardless of cause.
        var handler = NoLinkedProvidersHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        Services.GetRequiredService<NavigationManager>().NavigateTo("profile?linkError=exchange_failed");

        var cut = Render<Profile>();

        Assert.Contains("Die Anmeldung beim Anbieter ist fehlgeschlagen", cut.Markup);
        Assert.DoesNotContain("bereits mit einem anderen Benutzer verknüpft", cut.Markup);
        Assert.Contains("form-error", cut.Markup);
    }

    [Fact]
    public void Profile_UnlinkProvider_Failure_ShowsErrorMessage()
    {
        // Initial GET /linked returns a linked Google account so the
        // "Entfernen" button is present to click; the DELETE that click
        // triggers returns a distinct UNLINK_BLOCKED envelope -- three
        // different responses across two methods in one render, so this
        // needs RoutedFakeHttpMessageHandler.
        const string linkedJson = """{"success":true,"data":[{"provider":"google","email":"alice@gmail.com","linkedAt":"2026-01-01T00:00:00Z"}]}""";
        const string unlinkBlockedJson = """{"success":false,"error":{"code":"UNLINK_BLOCKED","message":"Du kannst dein letztes Anmeldeverfahren nicht entfernen."}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, _ => RoutedFakeHttpMessageHandler.JsonResponse(unlinkBlockedJson))
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse(linkedJson))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();
        var unlinkButton = cut.FindAll(".linked-account-row button").First(b => b.TextContent == "Entfernen");
        unlinkButton.Click();

        Assert.Contains("Du kannst dein letztes Anmeldeverfahren nicht entfernen.", cut.Markup);
        Assert.Contains("form-error", cut.Markup);
    }

    [Fact]
    public void Profile_UnlinkProvider_Success_RemovesRowAndShowsVerknuepfen()
    {
        // Mirrors the failure test above, but the DELETE succeeds with the
        // real backend envelope shape (backend/src/routes/auth.ts: 200
        // { success:true, data:null }) -- the Google row should flip from
        // "Entfernen"/email to "Verknüpfen".
        const string linkedJson = """{"success":true,"data":[{"provider":"google","email":"alice@gmail.com","linkedAt":"2026-01-01T00:00:00Z"}]}""";
        const string unlinkSuccessJson = """{"success":true,"data":null}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, _ => RoutedFakeHttpMessageHandler.JsonResponse(unlinkSuccessJson))
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse(linkedJson))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();
        var unlinkButton = cut.FindAll(".linked-account-row button").First(b => b.TextContent == "Entfernen");
        unlinkButton.Click();

        Assert.DoesNotContain("alice@gmail.com", cut.Markup);
        Assert.DoesNotContain("Entfernen", cut.Markup);
        Assert.Contains("Verknüpfen", cut.Markup);
    }

    [Fact]
    public void Profile_LinkProvider_StartFailure_ShowsErrorMessage()
    {
        // Neither provider is linked, so the Google row shows "Verknüpfen";
        // clicking it calls GET /api/auth/oauth/google/link/start, which
        // this test makes fail with a real ApiError envelope. Route order
        // matters: "/link/start" must be matched before the generic "/linked"
        // -- both /api/auth/oauth/google/link/start and /api/auth/oauth/linked
        // end in overlapping suffixes, so match on the longer, more specific
        // path first.
        const string linkStartErrorJson = """{"success":false,"error":{"code":"INVALID_PROVIDER","message":"Unknown OAuth provider \"google\"."}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/link/start"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse(linkStartErrorJson))
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();

        var cut = Render<Profile>();
        var linkButton = cut.FindAll(".linked-account-row button").First(b => b.TextContent == "Verknüpfen");
        linkButton.Click();

        Assert.Contains("Unknown OAuth provider \"google\".", cut.Markup);
        Assert.Contains("form-error", cut.Markup);
    }

    [Fact]
    public void Profile_PasswordResetButton_OpensDialogAndSendsRequestWithProfileEmail()
    {
        // The password-reset button moved here from Settings (Settings
        // requires the *current* password to change it; this is the
        // alternative for someone who's forgotten it). It reuses the
        // profile already loaded by OnInitializedAsync instead of a
        // second GET /api/users/me -- unlike the old Settings feature it
        // replaced, which fetched the profile solely for this purpose.
        //
        // Per the password-reset modernization design doc §4.1 (as
        // corrected after live review -- see PasswordResetDialog.razor.cs's
        // Open()), the button opens PasswordResetDialog at Identify with
        // the profile's own email pre-filled, not straight at CodeEntry --
        // the user still sees and submits it themselves, same as Login's
        // flow. The dialog manages its own success/error state from there,
        // so there's no toast here to assert on anymore.
        HttpRequestMessage? postRequest = null;
        string? postBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Post, r =>
            {
                postRequest = r;
                postBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true}""");
            })
            .When(r => r.Method == HttpMethod.Get && r.RequestUri!.AbsolutePath.EndsWith("/linked"),
                _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":[]}"""))
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
        JSInterop.Mode = JSRuntimeMode.Loose;

        var cut = Render<Profile>();
        var button = cut.Find(".profile-password-reset button");
        Assert.False(button.HasAttribute("disabled"));
        button.Click();

        // Pre-filled, not yet sent.
        var identifierInput = (AngleSharp.Html.Dom.IHtmlInputElement)cut.Find("#passwordResetIdentifier");
        Assert.Equal("alice@example.com", identifierInput.Value);
        Assert.Null(postRequest);

        cut.Find(".dialog button.btn-primary").Click();

        Assert.NotNull(postRequest);
        Assert.EndsWith("/forgot-password", postRequest!.RequestUri!.AbsolutePath);
        Assert.Contains("\"alice@example.com\"", postBody);
        Assert.NotNull(cut.Find("#passwordResetCode"));
    }
}
