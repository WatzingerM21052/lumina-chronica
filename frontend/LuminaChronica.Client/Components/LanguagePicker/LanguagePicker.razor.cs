using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

// Book language field (UI/UX plan A2): an editable combobox with list
// autocomplete (WAI-ARIA APG pattern). Focus stays in the input; the arrow
// keys move a highlighted option, Enter picks it, Escape closes the list
// and drops the typed search.
// Picking stores the ISO 639-1 code; anything else typed is kept as a custom
// language, so the field never refuses a value (see LanguageCatalog).
public partial class LanguagePicker : ComponentBase, IAsyncDisposable
{
    [Inject] private IJSRuntime JsRuntime { get; set; } = default!;

    [Parameter, EditorRequired]
    public string Id { get; set; } = string.Empty;

    [Parameter]
    public string? Value { get; set; }

    [Parameter]
    public EventCallback<string?> ValueChanged { get; set; }

    private sealed record Option(LanguageCatalog.Language? Language, string? Custom);

    private ElementReference _input;
    private IJSObjectReference? _module;
    private DotNetObjectReference<LanguagePicker>? _dotNetRef;
    private string _text = string.Empty;
    private string? _syncedValue;
    private bool _hasSynced;
    private bool _isOpen;
    private List<Option> _options = [];
    private int _activeIndex = -1;
    // True once the user typed or moved the highlight since the list opened.
    // Only then does leaving the field (Tab, click elsewhere) take the
    // highlighted option; merely passing through must change nothing.
    private bool _navigated;
    private bool _revealActive;

    private string ListId => $"{Id}-list";
    private string OptionId(int index) => $"{Id}-option-{index}";
    private string? ActiveDescendant => _isOpen && _activeIndex >= 0 ? OptionId(_activeIndex) : null;

    protected override void OnParametersSet()
    {
        // Only resync the visible text when the bound value really changed
        // from outside (form reset, metadata autofill) -- never mid-typing.
        if (!_hasSynced || Value != _syncedValue)
        {
            _text = LanguageCatalog.DisplayName(Value, I18n.CurrentLanguage) ?? string.Empty;
            _syncedValue = Value;
            _hasSynced = true;
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            // The module only refines the keyboard handling; if it can't load
            // (offline, a stale cached build) the picker still works as a
            // plain filter list -- it must never take the whole page down.
            try
            {
                _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/combobox.js");
                _dotNetRef = DotNetObjectReference.Create(this);
                await _module.InvokeVoidAsync("attach", _input, _dotNetRef);
            }
            catch (JSException)
            {
                _module = null;
            }
        }
        if (_module is null || !_isOpen) return;
        // Every render while open: typing changes the list's length, so its
        // placement is re-fitted; then the highlighted option is scrolled to.
        await _module.InvokeVoidAsync("placeList", _input, ListId);
        if (_revealActive && _activeIndex >= 0)
        {
            _revealActive = false;
            await _module.InvokeVoidAsync("revealOption", OptionId(_activeIndex));
        }
    }

    private void Open()
    {
        if (_isOpen) return;
        _isOpen = true;
        _navigated = false;

        // Untouched text (the current value's name): show the whole list with
        // the current language highlighted, not a list filtered down to it.
        var current = LanguageCatalog.Find(Value);
        var untouched = _text == (LanguageCatalog.DisplayName(Value, I18n.CurrentLanguage) ?? string.Empty);
        _options = BuildOptions(untouched ? null : _text);
        _activeIndex = current is null ? -1 : _options.FindIndex(o => o.Language == current);
        _revealActive = _activeIndex >= 0;
    }

    private void Close()
    {
        _isOpen = false;
        _activeIndex = -1;
        _navigated = false;
    }

    private bool HasNavigatedHighlight => _isOpen && _navigated && _activeIndex >= 0;

    private void OnInput(ChangeEventArgs e)
    {
        _text = e.Value?.ToString() ?? string.Empty;
        _isOpen = true;
        _navigated = true;
        _options = BuildOptions(_text);
        _activeIndex = string.IsNullOrWhiteSpace(_text) || _options.Count == 0 ? -1 : 0;
    }

    // Native "change": fires on blur after typing (before the blur event),
    // and when dialog.js re-dispatches it on Escape so the edit dialog's
    // dirty guard sees it. Reads _text, not the event's value: after a pick
    // the DOM may still hold the typed text for a moment.
    private Task OnChangeAsync(ChangeEventArgs _) =>
        HasNavigatedHighlight ? PickAsync(_activeIndex) : CommitTextAsync(_text);

    private async Task OnKeyDownAsync(KeyboardEventArgs e)
    {
        switch (e.Key)
        {
            case "ArrowDown":
            case "ArrowUp":
                if (!_isOpen)
                {
                    Open();
                    return;
                }
                if (_options.Count == 0) return;
                var step = e.Key == "ArrowDown" ? 1 : -1;
                _activeIndex = _activeIndex < 0
                    ? (step > 0 ? 0 : _options.Count - 1)
                    : (_activeIndex + step + _options.Count) % _options.Count;
                _navigated = true;
                _revealActive = true;
                break;
            case "Enter" when _isOpen:
                if (_activeIndex >= 0) await PickAsync(_activeIndex);
                else
                {
                    await CommitTextAsync(_text);
                    Close();
                }
                break;
            case "Escape" when _isOpen:
                // In the browser combobox.js catches this first (see there);
                // this path serves bUnit and any environment without the module.
                AbandonSearch();
                break;
            case "Tab":
                // Tab doesn't fire "change" if only the arrow keys were used,
                // so the highlighted option is taken here.
                if (HasNavigatedHighlight) await PickAsync(_activeIndex);
                else Close();
                break;
        }
    }

    [JSInvokable]
    public void CloseListFromEscape()
    {
        AbandonSearch();
        StateHasChanged();
    }

    // Escape on an open list: back to the stored value's name.
    private void AbandonSearch()
    {
        _text = LanguageCatalog.DisplayName(Value, I18n.CurrentLanguage) ?? string.Empty;
        Close();
    }

    private async Task PickAsync(int index)
    {
        var option = _options[index];
        Close();
        await SetValueAsync(option.Language?.Code ?? option.Custom);
    }

    private Task CommitTextAsync(string text)
    {
        // Unchanged display text means "keep what's stored" -- a legacy value
        // like "ger" shown as "Deutsch" isn't rewritten just by tabbing past.
        if (text == (LanguageCatalog.DisplayName(Value, I18n.CurrentLanguage) ?? string.Empty)) return Task.CompletedTask;
        var trimmed = text.Trim();
        return SetValueAsync(trimmed.Length == 0 ? null : LanguageCatalog.Find(trimmed)?.Code ?? trimmed);
    }

    private async Task SetValueAsync(string? value)
    {
        _text = LanguageCatalog.DisplayName(value, I18n.CurrentLanguage) ?? string.Empty;
        _syncedValue = value;
        if (value != Value) await ValueChanged.InvokeAsync(value);
    }

    private List<Option> BuildOptions(string? query)
    {
        var options = LanguageCatalog.Search(query, I18n.CurrentLanguage).Select(l => new Option(l, null)).ToList();
        var trimmed = query?.Trim() ?? string.Empty;
        if (trimmed.Length > 0 && LanguageCatalog.Find(trimmed) is null) options.Add(new Option(null, trimmed));
        return options;
    }

    public async ValueTask DisposeAsync()
    {
        _dotNetRef?.Dispose();
        if (_module is null) return;
        try
        {
            await _module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
    }
}
