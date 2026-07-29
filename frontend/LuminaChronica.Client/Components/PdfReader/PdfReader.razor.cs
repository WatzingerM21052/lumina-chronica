using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class PdfReader : ComponentBase, IAsyncDisposable
{
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

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;

        _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/pdfReader.js");
        if (_module is null) return; // no JS runtime backing this call (e.g. bUnit's default Loose mode)

        _pageCount = await _module.InvokeAsync<int>("init", _elementId, Bytes, InitialPage);
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
