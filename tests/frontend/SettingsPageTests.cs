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
    private const string AllEnabledPreferencesJson = """{"success":true,"data":{"FOLLOW":true,"COMMENT":true,"RATING":true,"SHARE":true,"ACTIVITY_RATING":true,"ACTIVITY_RATING_STARS":true}}""";

    private RoutedFakeHttpMessageHandler UseHandler(RoutedFakeHttpMessageHandler handler, string theme = "classic-library")
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<IThemeService>(new FakeThemeService(theme));
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<ToastService>();
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
        // Each language is named in itself ("Deutsch", "English"), whatever
        // the current UI language, so someone who can't read the current
        // one still finds their own.
        var languageButtons = buttons.Where(b => b.TextContent is "Deutsch" or "English").ToList();
        Assert.Equal(2, languageButtons.Count);
        Assert.Contains(languageButtons, b => b.TextContent == "English" && b.GetAttribute("class")!.Contains("btn-primary"));
        Assert.Contains(languageButtons, b => b.TextContent == "Deutsch" && !b.GetAttribute("class")!.Contains("btn-primary"));
    }

    [Fact]
    public void Settings_ThemeCards_MarkTheActiveTheme_AndSwitchOnClick()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));

        var cut = Render<Settings>();

        // Three groups: the two worlds, the four classic themes, the five looks.
        var groups = cut.FindAll(".theme-group");
        Assert.Equal(new[] { "Welten", "Klassisch", "Weitere Looks" }, groups.Select(g => g.QuerySelector("h4")!.TextContent));
        string[] Themes(int g) => groups[g].QuerySelectorAll(".theme-card").Select(c => c.GetAttribute("data-value")!).ToArray();
        Assert.Equal(new[] { "babylon", "alexandria" }, Themes(0));
        // System shows light and dark side by side.
        Assert.Equal(new[] { "classic-library", "modern-light", "dark-library", "system" }, Themes(1));
        Assert.Equal(2, groups[1].QuerySelectorAll(".theme-card")[3].QuerySelectorAll(".theme-card-half").Length);
        Assert.Equal(new[] { "skriptorium", "abendhafen", "ischtar", "daemmergarten", "nachtgarten" }, Themes(2));

        // Every card names its theme and says in a line what it looks like.
        var cards = cut.FindAll(".theme-card");
        Assert.Equal(11, cards.Count);
        Assert.All(cards, c => Assert.False(string.IsNullOrWhiteSpace(c.QuerySelector(".theme-card-tagline")!.TextContent)));
        Assert.DoesNotContain("⚠️", cut.Markup);
        Assert.Equal("Gärten in der Dämmerung", cards[9].QuerySelector(".theme-card-label")!.TextContent);

        // Classic Library is the default and active; a click switches.
        Assert.Equal("true", cards[2].GetAttribute("aria-pressed"));
        cards[4].Click();

        Assert.Equal("true", cut.FindAll(".theme-card")[4].GetAttribute("aria-pressed"));
        Assert.Equal("false", cut.FindAll(".theme-card")[2].GetAttribute("aria-pressed"));
    }

    [Fact]
    public void Settings_Preferences_AreSwitches_SplitIntoNotificationsAndPrivacy()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));

        var cut = Render<Settings>();

        Assert.All(cut.FindAll(".preference-row input"), i => Assert.Equal("switch", i.GetAttribute("role")));
        var headings = cut.FindAll(".settings-card h2").Select(h => h.TextContent).ToList();
        Assert.Equal(["Darstellung", "Benachrichtigungen", "Privatsphäre"], headings);
    }

    [Fact]
    public async Task Settings_SwitchingLanguage_StoresItOnTheAccount()
    {
        string? sentBody = null;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/preferences", AllEnabledPreferencesJson)
            .When(r => r.Method == HttpMethod.Put && r.RequestUri!.AbsolutePath.EndsWith("/api/users/me/language"), r =>
            {
                sentBody = r.Content!.ReadAsStringAsync().Result;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":{"language":"en"}}""");
            }));

        var cut = Render<Settings>();
        await cut.InvokeAsync(() => cut.FindAll(".theme-picker button").Single(b => b.TextContent == "English").Click());

        Assert.Equal("""{"language":"en"}""", sentBody);
    }

    // The home scroll shelf belongs to the Alexandria theme, so its switch
    // only appears there.
    [Fact]
    public void Settings_HomeScrollShelfSwitch_IsHiddenOutsideAlexandria()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson), "babylon");

        var cut = Render<Settings>();

        Assert.Empty(cut.FindAll("label.home-scroll-shelf-row"));
    }

    [Fact]
    public void Settings_HomeScrollShelfSwitch_InAlexandria_IsOnWhenNeverChosen()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson), "alexandria");
        // The scroll shelf is a setting of the card dashboard only.
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(false);
        JSInterop.SetupModule("./js/libraryPreferences.js")
            .Setup<bool?>("getHomeScrollShelf", _ => true)
            .SetResult(null);

        var cut = Render<Settings>();

        Assert.True(cut.Find("label.home-scroll-shelf-row input[type=checkbox]").HasAttribute("checked"));
    }

    [Fact]
    public void Settings_TogglingHomeScrollShelfSwitch_Persists()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson), "alexandria");
        // The scroll shelf is a setting of the card dashboard only.
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(false);
        JSInterop.SetupModule("./js/libraryPreferences.js")
            .Setup<bool?>("getHomeScrollShelf", _ => true)
            .SetResult(null);
        var setHandler = JSInterop.SetupModule("./js/libraryPreferences.js").SetupVoid("setHomeScrollShelf", _ => true);

        var cut = Render<Settings>();
        cut.Find("label.home-scroll-shelf-row input[type=checkbox]").Change(false);

        var invocation = Assert.Single(setHandler.Invocations);
        Assert.Equal(false, invocation.Arguments[0]);
        Assert.False(cut.Find("label.home-scroll-shelf-row input[type=checkbox]").HasAttribute("checked"));
    }

    // "Immersives Theme": in every theme; never chosen = on in the worlds, off elsewhere.
    [Fact]
    public void Settings_ImmersiveSwitch_InTheWorlds_IsOnWhenNeverChosen_AndPersists()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson), "babylon");
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(null);
        var setHandler = JSInterop.SetupModule("./js/worldPreferences.js").SetupVoid("setImmersive", _ => true);

        var cut = Render<Settings>();
        var toggle = cut.Find("label.immersive-theme-row input[type=checkbox]");
        Assert.True(toggle.HasAttribute("checked"));
        Assert.Contains("Immersives Theme", cut.Find("label.immersive-theme-row").TextContent);

        toggle.Change(false);

        Assert.Equal(false, Assert.Single(setHandler.Invocations).Arguments[0]);
        Assert.False(cut.Find("label.immersive-theme-row input[type=checkbox]").HasAttribute("checked"));
    }

    [Fact]
    public void Settings_ImmersiveSwitch_InTheClassicThemes_IsShownAndOffWhenNeverChosen()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson));
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(null);
        var setHandler = JSInterop.SetupModule("./js/worldPreferences.js").SetupVoid("setImmersive", _ => true);

        var cut = Render<Settings>();
        var toggle = cut.Find("label.immersive-theme-row input[type=checkbox]");
        Assert.False(toggle.HasAttribute("checked"));

        toggle.Change(true);

        Assert.Equal(true, Assert.Single(setHandler.Invocations).Arguments[0]);
        Assert.True(cut.Find("label.immersive-theme-row input[type=checkbox]").HasAttribute("checked"));
    }

    // With the journey on, the scroll-shelf choice (a card-dashboard setting) waits.
    [Fact]
    public void Settings_HomeScrollShelfSwitch_IsHiddenWhileTheJourneyIsOn()
    {
        UseHandler(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/preferences", AllEnabledPreferencesJson), "alexandria");
        JSInterop.SetupModule("./js/worldPreferences.js").Setup<bool?>("getImmersive", _ => true).SetResult(null);

        var cut = Render<Settings>();

        Assert.Empty(cut.FindAll("label.home-scroll-shelf-row"));
        Assert.NotEmpty(cut.FindAll("label.immersive-theme-row"));
    }
}
