using System.Linq;
using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// v3.3 Phase 3 (issue #326) -- per-type notification preference toggles,
// added below the pre-existing theme picker.
public class SettingsPageTests : BunitContext
{
    private class FakeThemeService : IThemeService
    {
        public string Theme = "classic-library";
        public Task<string> GetThemeAsync() => Task.FromResult(Theme);
        public Task SetThemeAsync(string theme) { Theme = theme; return Task.CompletedTask; }
    }

    private const string AllEnabledPreferencesJson = """{"success":true,"data":{"FOLLOW":true,"COMMENT":true,"RATING":true,"SHARE":true,"ACTIVITY_RATING":true,"ACTIVITY_RATING_STARS":true}}""";

    private RoutedFakeHttpMessageHandler UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<IThemeService>(new FakeThemeService());
        Services.AddSingleton<II18nService, FakeI18nService>();
        // Loose so tests unrelated to the shelf-cover-text preference don't
        // need their own shelfCoverText.js setup -- an unconfigured
        // getShowCoverText() call then returns bool's default (false),
        // which also happens to match this preference's own default.
        JSInterop.Mode = JSRuntimeMode.Loose;
        return handler;
    }

    [Fact]
    public void Settings_RendersAllSixPreferenceRowsCheckedByDefault()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));

        var cut = Render<Settings>();

        var checkboxes = cut.FindAll(".notification-preference-row input[type=checkbox]");
        Assert.Equal(6, checkboxes.Count);
        Assert.All(checkboxes, cb => Assert.True(cb.HasAttribute("checked")));
        Assert.Contains("Neuer Follower", cut.Markup);
        Assert.Contains("Eigene Bewertungen im Aktivitäten-Log", cut.Markup);
        Assert.Contains("Sternezahl bei Bewertungen anzeigen", cut.Markup);
    }

    [Fact]
    public void Settings_RendersDisabledPreferenceAsUnchecked()
    {
        const string json = """{"success":true,"data":{"FOLLOW":true,"COMMENT":false,"RATING":true,"SHARE":true,"ACTIVITY_RATING":true,"ACTIVITY_RATING_STARS":true}}""";
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", json));

        var cut = Render<Settings>();

        var commentRow = cut.FindAll(".notification-preference-row")[1];
        Assert.False(commentRow.QuerySelector("input")!.HasAttribute("checked"));
    }

    [Fact]
    public void Settings_RendersActivityRatingStarsAsUncheckedWhenDisabled()
    {
        const string json = """{"success":true,"data":{"FOLLOW":true,"COMMENT":true,"RATING":true,"SHARE":true,"ACTIVITY_RATING":true,"ACTIVITY_RATING_STARS":false}}""";
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", json));

        var cut = Render<Settings>();

        var starsRow = cut.FindAll(".notification-preference-row")[5];
        Assert.False(starsRow.QuerySelector("input")!.HasAttribute("checked"));
    }

    [Fact]
    public void Settings_TogglingCheckbox_SendsPutWithTypeAndEnabled()
    {
        HttpRequestMessage? putRequest = null;
        string? putBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                putRequest = r;
                putBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true}""");
            })
            .WhenPathEndsWith("/preferences", AllEnabledPreferencesJson);
        UseHandler(handler);

        var cut = Render<Settings>();
        cut.FindAll(".notification-preference-row input[type=checkbox]")[0].Change(false);

        Assert.NotNull(putRequest);
        Assert.EndsWith("/preferences", putRequest!.RequestUri!.AbsolutePath);
        Assert.Contains("\"FOLLOW\"", putBody);
        Assert.Contains("\"enabled\":false", putBody);
    }

    [Fact]
    public void Settings_ShelfCoverTextCheckbox_OnLoad_ReflectsStoredValue()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));
        JSInterop.SetupModule("./js/shelfCoverText.js")
            .Setup<bool>("getShowCoverText", _ => true)
            .SetResult(true);

        var cut = Render<Settings>();

        var checkbox = cut.Find("label.library-preference-row input[type=checkbox]");
        Assert.True(checkbox.HasAttribute("checked"));
    }

    [Fact]
    public void Settings_ShelfCoverTextCheckbox_OnLoad_DefaultsToUnchecked()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));
        JSInterop.SetupModule("./js/shelfCoverText.js")
            .Setup<bool>("getShowCoverText", _ => true)
            .SetResult(false);

        var cut = Render<Settings>();

        var checkbox = cut.Find("label.library-preference-row input[type=checkbox]");
        Assert.False(checkbox.HasAttribute("checked"));
    }

    [Fact]
    public void Settings_TogglingShelfCoverTextCheckbox_Persists()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));
        JSInterop.SetupModule("./js/shelfCoverText.js")
            .Setup<bool>("getShowCoverText", _ => true)
            .SetResult(false);
        var setHandler = JSInterop.SetupModule("./js/shelfCoverText.js").SetupVoid("setShowCoverText", _ => true);

        var cut = Render<Settings>();
        cut.Find("label.library-preference-row input[type=checkbox]").Change(true);

        var invocation = Assert.Single(setHandler.Invocations);
        Assert.Equal(true, invocation.Arguments[0]);
        Assert.True(cut.Find("label.library-preference-row input[type=checkbox]").HasAttribute("checked"));
    }

    [Fact]
    public void Settings_LanguagePicker_HighlightsTheCurrentLanguage()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));
        // Overrides UseHandler's default "de" registration -- DI resolves
        // the last-registered implementation for a given service type.
        Services.AddSingleton<II18nService>(new FakeI18nService("en"));

        var cut = Render<Settings>();

        var buttons = cut.FindAll(".settings-card .theme-picker button").ToList();
        var languageButtons = buttons.Where(b => b.TextContent is "Deutsch" or "English").ToList();
        Assert.Equal(2, languageButtons.Count);
        Assert.Contains(languageButtons, b => b.TextContent == "English" && b.GetAttribute("class")!.Contains("btn-primary"));
        Assert.Contains(languageButtons, b => b.TextContent == "Deutsch" && !b.GetAttribute("class")!.Contains("btn-primary"));
    }
}
