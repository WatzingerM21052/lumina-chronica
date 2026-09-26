using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// i18n Phase 1 (2026-09-26) -- lightweight JSON-dictionary translation,
// not Blazor's built-in IStringLocalizer/.resx (would need satellite
// assembly loading in WASM, more ceremony than this app's existing
// lightweight-JS-module conventions call for). "de" is always the
// fallback/source-of-truth language -- see T() below.
public class I18nService(IJSRuntime jsRuntime) : II18nService
{
    private const string ModulePath = "./js/i18n.js";
    private const string FallbackLanguage = "de";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    private Dictionary<string, string> _current = [];
    private Dictionary<string, string> _fallback = [];

    public string CurrentLanguage { get; private set; } = FallbackLanguage;

    public async Task InitializeAsync()
    {
        var module = await _moduleTask.Value;
        CurrentLanguage = await module.InvokeAsync<string>("getLanguage");

        _current = await module.InvokeAsync<Dictionary<string, string>>("loadDictionary", CurrentLanguage);
        _fallback = CurrentLanguage == FallbackLanguage
            ? _current
            : await module.InvokeAsync<Dictionary<string, string>>("loadDictionary", FallbackLanguage);
    }

    // Synchronous -- InitializeAsync has already been awaited by the time
    // any page's own OnInitializedAsync runs (see App.razor), so both
    // dictionaries are already in memory.
    public string T(string key)
    {
        if (_current.TryGetValue(key, out var value)) return value;
        if (_fallback.TryGetValue(key, out var fallbackValue)) return fallbackValue;
        return $"⚠️ {key}";
    }

    // Persistence only -- does not itself reload/re-render anything. The
    // caller (Settings.razor) is responsible for the full-page reload that
    // actually applies the new language, since baking a navigation side
    // effect into "set the language" would surprise any future caller that
    // doesn't want one.
    public async Task SetLanguageAsync(string language)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setLanguage", language);
    }
}
