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
    public EventCallback<EpubProgress> OnProgress { get; set; }

    private readonly string _elementId = $"epub-reader-{Guid.NewGuid():N}";
    private IJSObjectReference? _module;
    private DotNetObjectReference<EpubReader>? _dotNetRef;
    private int _lastFontSize;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/epubReaderV2.js");
        if (_module is null) return; // no JS runtime backing this call (e.g. bUnit's default Loose mode)

        _dotNetRef = DotNetObjectReference.Create(this);
        _lastFontSize = FontSize;

        await _module.InvokeVoidAsync("init", _elementId, Bytes, InitialCfi, FontSize);
        await _module.InvokeVoidAsync("onRelocated", _elementId, _dotNetRef);
    }

    protected override async Task OnParametersSetAsync()
    {
        if (_module is not null && FontSize != _lastFontSize)
        {
            await _module.InvokeVoidAsync("setFontSize", _elementId, FontSize);
            _lastFontSize = FontSize;
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

    [JSInvokable]
    public async Task OnRelocated(string cfi, int chapterIndex, double percentage)
    {
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
