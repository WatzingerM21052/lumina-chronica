using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class PdfReader : ComponentBase, IAsyncDisposable
{
    private const double MinZoom = 0.5;
    private const double MaxZoom = 2.5;
    private const double ZoomStep = 0.25;

    [Parameter, EditorRequired]
    public byte[] Bytes { get; set; } = [];

    [Parameter]
    public int InitialPage { get; set; } = 1;

    [Parameter]
    public EventCallback<PdfProgress> OnProgress { get; set; }

    private readonly string _elementId = $"pdf-reader-{Guid.NewGuid():N}";
    private IJSObjectReference? _module;
    private int _currentPage = 1;
    private int _pageCount;
    private double _zoom = 1;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        _zoom = await ReaderSettings.GetPdfZoomAsync();

        _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/pdfReader.js");
        if (_module is null) return; // no JS runtime backing this call (e.g. bUnit's default Loose mode)

        _pageCount = await _module.InvokeAsync<int>("init", _elementId, Bytes, InitialPage, _zoom);
        _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
        StateHasChanged();
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private async Task NextAsync()
    {
        if (_module is null) return;
        await _module.InvokeVoidAsync("next", _elementId);
        _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private async Task PrevAsync()
    {
        if (_module is null) return;
        await _module.InvokeVoidAsync("prev", _elementId);
        _currentPage = await _module.InvokeAsync<int>("getCurrentPage", _elementId);
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private async Task OnPageInputChangedAsync(ChangeEventArgs e)
    {
        if (_module is null) return;
        if (!int.TryParse(e.Value?.ToString(), out var requestedPage)) return;

        _currentPage = await _module.InvokeAsync<int>("goToPage", _elementId, requestedPage);
        await OnProgress.InvokeAsync(new PdfProgress(_currentPage, _pageCount));
    }

    private Task IncreaseZoomAsync() => SetZoomAsync(Math.Min(_zoom + ZoomStep, MaxZoom));

    private Task DecreaseZoomAsync() => SetZoomAsync(Math.Max(_zoom - ZoomStep, MinZoom));

    private Task ResetZoomAsync() => SetZoomAsync(1);

    private async Task SetZoomAsync(double zoom)
    {
        if (_module is null) return;
        _zoom = zoom;
        await _module.InvokeVoidAsync("setZoom", _elementId, _zoom);
        await ReaderSettings.SetPdfZoomAsync(_zoom);
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            await _module.InvokeVoidAsync("destroy", _elementId);
            await _module.DisposeAsync();
        }
    }
}

public record PdfProgress(int Page, int PageCount);
