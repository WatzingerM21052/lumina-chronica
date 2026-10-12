using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class ClassicShelf : ComponentBase, IAsyncDisposable
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
    private double _width;
    private ElementReference _measureRef;
    private IJSObjectReference? _module;
    private DotNetObjectReference<ClassicShelf>? _selfRef;

    private static double? ProgressOf(ShelfSection section, Book book) =>
        section.Progress is { } progress && progress.TryGetValue(book.Id, out var percentage) ? percentage : null;

    // A brass bookend closes a line that doesn't reach the end of the
    // compartment (only once the width is known).
    private const int BookendWidth = 22;

    // Cover-forward books of "Zuletzt gelesen": smaller on a phone, so two
    // stand side by side.
    private int CoverWidth => _width is > 0 and < 520 ? ShelfLineLayout.CoverWidth * 3 / 4 : ShelfLineLayout.CoverWidth;

    private bool HasRoomForBookend(IReadOnlyList<Book> line, Func<Book, int> widthOf) =>
        _width > 0 && ShelfLineLayout.UsedWidth(line, Zoom, widthOf) + (ShelfLineLayout.Gap + BookendWidth) * Zoom <= _width;

    // The cover-forward compartment is only as tall as its covers.
    private string? BayStyle(ShelfSection bay) => bay.Kind == ShelfSectionKind.Recent
        ? string.Create(System.Globalization.CultureInfo.InvariantCulture, $"--classic-row-height: {CoverWidth * 1.44 * Zoom + 26:0.##}px")
        : null;

    // A book turning its cover out swings it to the left by about its
    // depth; near the left wall it slides right first, so the cover stays
    // inside the compartment.
    private double HoverShift(double left) => Math.Max(0, ClassicShelfBook.Depth * Zoom * 0.95 - left);

    [JSInvokable]
    public void OnShelfWidth(double width)
    {
        if (Math.Abs(width - _width) < 1) return;
        _width = width;
        StateHasChanged();
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!firstRender) return;
        try
        {
            _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelfLayout.js");
            _selfRef = DotNetObjectReference.Create(this);
            await _module.InvokeVoidAsync("observeWidth", _measureRef, _selfRef, nameof(OnShelfWidth));
        }
        catch (Exception)
        {
            // No JS module (tests): one line per compartment.
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            try
            {
                await _module.InvokeVoidAsync("disconnect", _measureRef);
                await _module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
        _selfRef?.Dispose();
    }
}
