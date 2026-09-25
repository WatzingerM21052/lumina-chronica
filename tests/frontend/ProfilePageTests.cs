using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ProfilePageTests : BunitContext
{
    private const string ProfileJson = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":null,"roleName":"USER","createdAt":"2026-01-01"}}""";

    [Fact]
    public void Profile_PublicProfileLink_HasNoLeadingSlash()
    {
        // Regression coverage: a leading "/" makes the browser treat this as
        // domain-root-relative, bypassing the <base href> rewrite that GitHub
        // Pages project sites need for their subpath -- the exact class of
        // bug already documented for issue #38, caught live for this link
        // during Community Phase 1 (issue #300) verification.
        var handler = new FakeHttpMessageHandler(ProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Profile>();

        var link = cut.Find("a");
        Assert.Equal("u/alice", link.GetAttribute("href"));
    }

    [Fact]
    public void Profile_NoAvatarSet_ShowsPlaceholderIcon()
    {
        var handler = new FakeHttpMessageHandler(ProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Profile>();

        Assert.Single(cut.FindAll(".profile-avatar-placeholder"));
        Assert.Empty(cut.FindAll("img.profile-avatar-preview"));
    }

    [Fact]
    public void Profile_AvatarUrlSet_ShowsItAsImage()
    {
        const string json = """{"success":true,"data":{"id":1,"username":"alice","email":"alice@example.com","avatarUrl":"https://example.com/api/users/alice/avatar","roleName":"USER","createdAt":"2026-01-01"}}""";
        var handler = new FakeHttpMessageHandler(json);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Profile>();

        var img = cut.Find("img.profile-avatar-preview");
        Assert.Equal("https://example.com/api/users/alice/avatar", img.GetAttribute("src"));
    }

    [Fact]
    public void Profile_SelectingAnAvatarFile_UploadsItImmediately_NoFormSubmitNeeded()
    {
        HttpRequestMessage? avatarRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put && r.RequestUri!.AbsolutePath.EndsWith("/avatar"), r =>
            {
                avatarRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson);
            })
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();
        JSInterop.SetupModule("./js/blobUrl.js").Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-avatar-url");

        var cut = Render<Profile>();
        cut.FindComponent<InputFile>().UploadFiles(InputFileContent.CreateFromText("avatar bytes", "avatar.jpg"));

        Assert.Equal(HttpMethod.Put, avatarRequest?.Method);
        Assert.Equal("/api/users/me/avatar", avatarRequest?.RequestUri?.AbsolutePath);
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
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Profile>();
        cut.FindComponent<InputFile>().UploadFiles(InputFileContent.CreateFromText("not an image", "avatar.gif"));

        Assert.Null(avatarRequest);
        Assert.Contains("form-error", cut.Markup);
    }

    [Fact]
    public void Profile_RendersDeleteAccountSection()
    {
        var handler = new FakeHttpMessageHandler(ProfileJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Profile>();

        Assert.NotNull(cut.Find("#deleteAccountPassword"));
        Assert.Contains("Konto löschen", cut.Markup);
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
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(ProfileJson));
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<TokenStore>();
        Services.AddSingleton<LuminaAuthStateProvider>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Profile>();
        cut.Find("#deleteAccountPassword").Input("wrong password");
        cut.Find("#confirmDeleteAccount").Click();
        cut.Find("#deleteAccountButton").Click();

        Assert.Contains("Current password is incorrect.", cut.Markup);
    }
}
