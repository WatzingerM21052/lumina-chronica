using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// UI/UX plan A2: the book language field.
public class LanguageCatalogTests
{
    [Theory]
    [InlineData("de", "de")]
    [InlineData("DE", "de")]
    [InlineData("en-US", "en")]
    [InlineData("pt_BR", "pt")]
    [InlineData("ger", "de")]
    [InlineData("fre-CA", "fr")]
    [InlineData("Deutsch", "de")]
    [InlineData("french", "fr")]
    public void Find_RecognizesCodesAliasesAndNames(string value, string expectedCode)
    {
        Assert.Equal(expectedCode, LanguageCatalog.Find(value)?.Code);
    }

    [Theory]
    [InlineData("Plattdeutsch")]
    [InlineData("Quenya")]
    [InlineData("")]
    [InlineData(null)]
    public void Find_ReturnsNullForCustomOrEmptyValues(string? value)
    {
        Assert.Null(LanguageCatalog.Find(value));
    }

    [Fact]
    public void DisplayName_ShowsNameInUiLanguage_AndKeepsCustomValuesAsTyped()
    {
        Assert.Equal("Französisch", LanguageCatalog.DisplayName("fr", "de"));
        Assert.Equal("French", LanguageCatalog.DisplayName("fr", "en"));
        Assert.Equal("Plattdeutsch", LanguageCatalog.DisplayName(" Plattdeutsch ", "de"));
        Assert.Null(LanguageCatalog.DisplayName("  ", "de"));
    }

    [Fact]
    public void Normalize_StoresTheCodeWhenRecognized()
    {
        Assert.Equal("en", LanguageCatalog.Normalize("en-GB"));
        Assert.Equal("Plattdeutsch", LanguageCatalog.Normalize("Plattdeutsch"));
        Assert.Null(LanguageCatalog.Normalize(""));
    }

    [Fact]
    public void Search_RanksPrefixMatchesFirst()
    {
        var results = LanguageCatalog.Search("de", "de");

        Assert.Equal("de", results[0].Code);
        Assert.DoesNotContain(results.Take(1), l => l.Code == "sv");
    }

    [Fact]
    public void Search_MatchesTheOtherLanguagesNameToo()
    {
        Assert.Equal("de", LanguageCatalog.Search("Germ", "de")[0].Code);
    }

    [Fact]
    public void Catalog_HasUniqueCodes()
    {
        Assert.Equal(LanguageCatalog.All.Count, LanguageCatalog.All.Select(l => l.Code).Distinct().Count());
    }
}

public class LanguagePickerTests : BunitContext
{
    private string? _value;

    public LanguagePickerTests()
    {
        var module = JSInterop.SetupModule("./js/combobox.js");
        module.SetupVoid("attach", _ => true);
        module.SetupVoid("revealOption", _ => true);
        module.SetupVoid("placeList", _ => true);
    }

    private IRenderedComponent<LanguagePicker> RenderPicker(string? value, string uiLanguage = "de")
    {
        Services.AddSingleton<II18nService>(new FakeI18nService(uiLanguage));
        _value = value;
        return Render<LanguagePicker>(parameters => parameters
            .Add(p => p.Id, "language")
            .Add(p => p.Value, value)
            .Add(p => p.ValueChanged, v => _value = v));
    }

    [Fact]
    public void ShowsTheStoredCodeAsName_InTheUiLanguage()
    {
        Assert.Equal("Französisch", RenderPicker("fr").Find("#language").GetAttribute("value"));
    }

    [Fact]
    public void ShowsEnglishNames_WhenUiIsEnglish()
    {
        Assert.Equal("French", RenderPicker("fr", "en").Find("#language").GetAttribute("value"));
    }

    [Fact]
    public void KeepsALegacyFreeTextValueVisible()
    {
        Assert.Equal("Plattdeutsch", RenderPicker("Plattdeutsch").Find("#language").GetAttribute("value"));
    }

    [Fact]
    public void Typing_FiltersTheList_AndClickingAnOptionStoresItsCode()
    {
        var cut = RenderPicker(null);
        var input = cut.Find("#language");

        input.Input("Ital");
        Assert.Equal("true", input.GetAttribute("aria-expanded"));
        var options = cut.FindAll("[role=option]");
        Assert.Contains("Italienisch", options[0].TextContent);

        options[0].MouseDown();

        Assert.Equal("it", _value);
        Assert.Empty(cut.FindAll("[role=listbox]"));
        Assert.Equal("Italienisch", cut.Find("#language").GetAttribute("value"));
    }

    [Fact]
    public void ArrowKeysMoveTheActiveOption_AndEnterPicksIt()
    {
        var cut = RenderPicker(null);
        var input = cut.Find("#language");

        input.Input("Span");
        input.KeyDown(new KeyboardEventArgs { Key = "ArrowDown" });

        var active = cut.Find("[role=option][aria-selected=true]");
        Assert.Equal(active.Id, cut.Find("#language").GetAttribute("aria-activedescendant"));

        cut.Find("#language").KeyDown(new KeyboardEventArgs { Key = "ArrowUp" });
        cut.Find("#language").KeyDown(new KeyboardEventArgs { Key = "Enter" });

        Assert.Equal("es", _value);
    }

    [Fact]
    public void Escape_ClosesTheList_WithoutChangingTheValue()
    {
        var cut = RenderPicker("de");
        cut.Find("#language").Focus();
        Assert.NotEmpty(cut.FindAll("[role=listbox]"));

        cut.Find("#language").KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.Empty(cut.FindAll("[role=listbox]"));
        Assert.Equal("de", _value);
    }

    [Fact]
    public void Escape_AbandonsTypedSearch_AndRestoresTheStoredName()
    {
        var cut = RenderPicker("de");
        cut.Find("#language").Input("Ital");

        cut.Find("#language").KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.Equal("Deutsch", cut.Find("#language").GetAttribute("value"));
        Assert.Equal("de", _value);
    }

    [Fact]
    public void Opening_ShowsTheWholeList_WithTheCurrentLanguageHighlighted()
    {
        var cut = RenderPicker("de");
        cut.Find("#language").Focus();

        Assert.Equal(LanguageCatalog.All.Count, cut.FindAll("[role=option]").Count);
        Assert.Contains("Deutsch", cut.Find("[role=option][aria-selected=true]").TextContent);
    }

    [Fact]
    public void UnknownText_OffersACustomLanguage_AndKeepsItAsTyped()
    {
        var cut = RenderPicker(null);
        cut.Find("#language").Input("Quenya");

        var custom = cut.FindAll("[role=option]").Single();
        Assert.Contains("„Quenya“ als eigene Sprache verwenden", custom.TextContent);

        custom.MouseDown();
        Assert.Equal("Quenya", _value);
    }

    [Fact]
    public void TypedTextIsCommittedOnChange_RecognizingNamesAsCodes()
    {
        var cut = RenderPicker(null);
        cut.Find("#language").Change("english");
        Assert.Equal("en", _value);
    }

    [Fact]
    public void ClearingTheFieldStoresNull()
    {
        var cut = RenderPicker("de");
        cut.Find("#language").Change("");
        Assert.Null(_value);
    }

    [Fact]
    public void TabbingPastAnUnchangedLegacyValue_DoesNotRewriteIt()
    {
        var cut = RenderPicker("ger");
        Assert.Equal("Deutsch", cut.Find("#language").GetAttribute("value"));

        cut.Find("#language").Change("Deutsch");

        Assert.Equal("ger", _value);
    }
}

public class LanguagePickerWithoutModuleTests : BunitContext
{
    [Fact]
    public void StillWorks_WhenTheKeyboardModuleFailsToLoad()
    {
        Services.AddSingleton<Microsoft.JSInterop.IJSRuntime>(new FailingImportJsRuntime());
        Services.AddSingleton<II18nService>(new FakeI18nService());
        string? value = null;

        var cut = Render<LanguagePicker>(parameters => parameters
            .Add(p => p.Id, "language")
            .Add(p => p.ValueChanged, v => value = v));

        cut.Find("#language").Input("Ital");
        cut.FindAll("[role=option]")[0].MouseDown();

        Assert.Equal("it", value);
    }

    // Every JS call fails the way a module that can't be fetched does.
    private sealed class FailingImportJsRuntime : Microsoft.JSInterop.IJSRuntime
    {
        public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) =>
            throw new Microsoft.JSInterop.JSException("Failed to fetch dynamically imported module");

        public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args) =>
            throw new Microsoft.JSInterop.JSException("Failed to fetch dynamically imported module");
    }
}
