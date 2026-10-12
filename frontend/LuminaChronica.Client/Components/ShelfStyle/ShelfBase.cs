using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

// What every shelf style shares (spec 2026-10-11): the compartments, the
// book-size setting, and the inner width shelfLayout.js reports from the
// element the style binds to MeasureRef, so lines can be broken in C#.
public abstract class ShelfBase : ComponentBase, IAsyncDisposable
{
    [Inject]
    private IJSRuntime JsRuntime { get; set; } = null!;

    [Parameter, EditorRequired]
    public IReadOnlyList<ShelfSection> Sections { get; set; } = [];

    // The library's book-size setting (1, 1.25, 1.5).
    [Parameter]
    public double Zoom { get; set; } = 1;

    [Parameter]
    public bool ShowCoverText { get; set; } = true;

    // 0 until shelfLayout.js reports it: then every compartment is a single
    // line, which is also what a test renderer without JS shows.
    protected double Width { get; private set; }

    protected ElementReference MeasureRef;

    private IJSObjectReference? _module;
    private DotNetObjectReference<ShelfBase>? _selfRef;

    protected static double? ProgressOf(ShelfSection section, Book book) =>
        section.Progress is { } progress && progress.TryGetValue(book.Id, out var percentage) ? percentage : null;

    [JSInvokable]
    public void OnShelfWidth(double width)
    {
        if (Math.Abs(width - Width) < 1) return;
        Width = width;
        StateHasChanged();
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
        try
        {
            _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelfLayout.js");
            _selfRef = DotNetObjectReference.Create(this);
            await _module.InvokeVoidAsync("observeWidth", MeasureRef, _selfRef, nameof(OnShelfWidth));
        }
        catch (Exception)
        {
            // No JS module (tests): one line per compartment.
        }
    }

    public virtual async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            try
            {
                await _module.InvokeVoidAsync("disconnect", MeasureRef);
                await _module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
        _selfRef?.Dispose();
        GC.SuppressFinalize(this);
    }
}
