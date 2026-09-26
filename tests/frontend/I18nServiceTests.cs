using Bunit;
using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class I18nServiceTests : BunitContext
{
    [Fact]
    public async Task InitializeAsync_LoadsCurrentLanguage_AndTReturnsItsStrings()
    {
        var module = JSInterop.SetupModule("./js/i18n.js");
        module.Setup<string>("getLanguage", _ => true).SetResult("en");
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "en")
            .SetResult(new Dictionary<string, string> { ["greeting"] = "Hello" });
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "de")
            .SetResult(new Dictionary<string, string> { ["greeting"] = "Hallo", ["german-only"] = "Nur Deutsch" });

        var service = new I18nService(JSInterop.JSRuntime);
        await service.InitializeAsync();

        Assert.Equal("en", service.CurrentLanguage);
        Assert.Equal("Hello", service.T("greeting"));
    }

    [Fact]
    public async Task T_FallsBackToGerman_WhenKeyMissingFromCurrentLanguage()
    {
        var module = JSInterop.SetupModule("./js/i18n.js");
        module.Setup<string>("getLanguage", _ => true).SetResult("en");
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "en")
            .SetResult(new Dictionary<string, string> { ["greeting"] = "Hello" });
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "de")
            .SetResult(new Dictionary<string, string> { ["greeting"] = "Hallo", ["german-only"] = "Nur Deutsch" });

        var service = new I18nService(JSInterop.JSRuntime);
        await service.InitializeAsync();

        Assert.Equal("Nur Deutsch", service.T("german-only"));
    }

    [Fact]
    public async Task T_ReturnsMissingKeyMarker_WhenAbsentFromBothLanguages()
    {
        var module = JSInterop.SetupModule("./js/i18n.js");
        module.Setup<string>("getLanguage", _ => true).SetResult("en");
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "en")
            .SetResult(new Dictionary<string, string>());
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "de")
            .SetResult(new Dictionary<string, string>());

        var service = new I18nService(JSInterop.JSRuntime);
        await service.InitializeAsync();

        Assert.Equal("⚠️ nonexistent.key", service.T("nonexistent.key"));
    }

    [Fact]
    public async Task InitializeAsync_ForGerman_OnlyLoadsOneDictionary()
    {
        // German is both the current AND fallback language when selected --
        // loadDictionary("de") should be the only call, not also "de" a
        // second time for the fallback.
        var module = JSInterop.SetupModule("./js/i18n.js");
        module.Setup<string>("getLanguage", _ => true).SetResult("de");
        var loadDictionary = module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "de");
        loadDictionary.SetResult(new Dictionary<string, string> { ["greeting"] = "Hallo" });

        var service = new I18nService(JSInterop.JSRuntime);
        await service.InitializeAsync();

        Assert.Single(loadDictionary.Invocations);
        Assert.Equal("Hallo", service.T("greeting"));
    }

    [Fact]
    public async Task SetLanguageAsync_PersistsViaJsModule_WithoutReinitializing()
    {
        var module = JSInterop.SetupModule("./js/i18n.js");
        module.Setup<string>("getLanguage", _ => true).SetResult("de");
        module.Setup<Dictionary<string, string>>("loadDictionary", inv => inv.Arguments[0] as string == "de")
            .SetResult(new Dictionary<string, string>());
        var setLanguage = module.SetupVoid("setLanguage", inv => inv.Arguments[0] as string == "en").SetVoidResult();

        var service = new I18nService(JSInterop.JSRuntime);
        await service.InitializeAsync();
        await service.SetLanguageAsync("en");

        Assert.Single(setLanguage.Invocations);
    }
}
