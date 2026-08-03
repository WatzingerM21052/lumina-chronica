using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class EpubReader : ComponentBase, IAsyncDisposable
{
    [Parameter, EditorRequired]
    public byte[] Bytes { get; set; } = [];

    [Parameter]
    public string? InitialCfi { get; set; }

    [Parameter]
    public int FontSize { get; set; } = 18;

    [Parameter]
    public string FontFamily { get; set; } = "serif";

    [Parameter]
    public string LineHeight { get; set; } = "normal";

    [Parameter]
    public string PageWidth { get; set; } = "normal";

    [Parameter]
    public EventCallback<EpubProgress> OnProgress { get; set; }

    private readonly string _elementId = $"epub-reader-{Guid.NewGuid():N}";
    private IJSObjectReference? _module;
    private DotNetObjectReference<EpubReader>? _dotNetRef;
    private int _lastFontSize;
    private string _lastFontFamily = "";
    private string _lastLineHeight = "";
    private string _lastPageWidth = "";
    private bool _pageWidthChangedSinceRender;
    private double _lastPercentage;
    private List<TocItem> _toc = [];
    private bool _tocMenuOpen;

    private string FrameClass => PageWidth switch
    {
        "narrow" => "epub-reader-frame epub-reader-frame--width-narrow",
        "wide" => "epub-reader-frame epub-reader-frame--width-wide",
        _ => "epub-reader-frame",
    };

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/epubReader.js");
            if (_module is null) return; // no JS runtime backing this call (e.g. bUnit's default Loose mode)

            _dotNetRef = DotNetObjectReference.Create(this);
            _lastFontSize = FontSize;
            _lastFontFamily = FontFamily;
            _lastLineHeight = LineHeight;
            _lastPageWidth = PageWidth;

            await _module.InvokeVoidAsync("init", _elementId, Bytes, InitialCfi, FontSize, FontFamily, LineHeight);
            await _module.InvokeVoidAsync("onRelocated", _elementId, _dotNetRef);
            _toc = await _module.InvokeAsync<List<TocItem>>("getToc", _elementId) ?? [];
            StateHasChanged();
            return;
        }

        // Deferred from OnParametersSetAsync to here deliberately: the frame's
        // width class (FrameClass) only takes effect once Blazor has actually
        // patched the DOM, which happens *after* OnParametersSetAsync returns,
        // not during it. Calling resizeContent() too early would have
        // epub.js measure the frame's *old* size. epub.js does have its own
        // ResizeObserver on the container, but that's not relied on alone --
        // an explicit resize() call is the reliable trigger.
        if (_pageWidthChangedSinceRender && _module is not null)
        {
            _pageWidthChangedSinceRender = false;
            await _module.InvokeVoidAsync("resizeContent", _elementId);
        }
    }

    protected override async Task OnParametersSetAsync()
    {
        if (_module is null) return;

        if (FontSize != _lastFontSize)
        {
            await _module.InvokeVoidAsync("setFontSize", _elementId, FontSize);
            _lastFontSize = FontSize;
        }

        if (FontFamily != _lastFontFamily || LineHeight != _lastLineHeight)
        {
            await _module.InvokeVoidAsync("setContentStyle", _elementId, FontFamily, LineHeight);
            _lastFontFamily = FontFamily;
            _lastLineHeight = LineHeight;
        }

        if (PageWidth != _lastPageWidth)
        {
            _lastPageWidth = PageWidth;
            _pageWidthChangedSinceRender = true;
        }
    }

    private async Task NextAsync()
    {
        if (_module is not null) await _module.InvokeVoidAsync("next", _elementId);
    }

    private async Task PrevAsync()
    {
        if (_module is not null) await _module.InvokeVoidAsync("prev", _elementId);
    }

    private void ToggleTocMenu() => _tocMenuOpen = !_tocMenuOpen;

    private async Task GoToTocItemAsync(string href)
    {
        _tocMenuOpen = false;
        if (_module is not null) await _module.InvokeVoidAsync("goTo", _elementId, href);
    }

    [JSInvokable]
    public async Task OnRelocated(string cfi, int chapterIndex, double percentage)
    {
        _lastPercentage = percentage;
        await OnProgress.InvokeAsync(new EpubProgress(cfi, chapterIndex, percentage));
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            await _module.InvokeVoidAsync("destroy", _elementId);
            await _module.DisposeAsync();
        }
        _dotNetRef?.Dispose();
    }
}

public record EpubProgress(string Cfi, int ChapterIndex, double Percentage);

// Mirrors epubReader.js's flattenToc() output.
public class TocItem
{
    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;

    [JsonPropertyName("href")]
    public string Href { get; set; } = string.Empty;

    [JsonPropertyName("level")]
    public int Level { get; set; }
}
