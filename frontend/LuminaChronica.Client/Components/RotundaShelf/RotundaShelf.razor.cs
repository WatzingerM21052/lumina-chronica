using System.Globalization;
using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class RotundaShelf
{
    // Bay width plus the pillar between two bays.
    private const double BayWidth = 276;

    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Parameter, EditorRequired]
    public IReadOnlyList<ShelfSection> Sections { get; set; } = [];

    private List<RotundaBay> _bays = [];
    private double _radius;
    private (Book Book, double? Progress)? _open;
    private ElementReference _roomRef;
    private IJSObjectReference? _module;
    private int _renderedBayCount;
    private int? _returnFocusTo;

    protected override void OnParametersSet()
    {
        _bays = RotundaLayout.Bays(Sections);
        _radius = RotundaLayout.Radius(_bays.Count, BayWidth);
    }

    private static string Px(double value) => value.ToString("0.##", CultureInfo.InvariantCulture) + "px";

    private static string Leather(Book book) => Leathers[book.Id % Leathers.Length];

    private static string Label(Book book) => string.IsNullOrWhiteSpace(book.Author) ? book.Title : $"{book.Title}, {book.Author}";

    private void Open(Book book, RotundaBay bay)
    {
        double? progress = bay.Progress is { } p && p.TryGetValue(book.Id, out var value) ? value : null;
        _open = (book, progress);
        _returnFocusTo = book.Id;
    }

    private async Task CloseAsync()
    {
        _open = null;
        StateHasChanged();
        if (_module is not null && _returnFocusTo is { } id)
        {
            try
            {
                await _module.InvokeVoidAsync("focusBook", _roomRef, id);
            }
            catch (JSDisconnectedException)
            {
            }
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        try
        {
            if (firstRender)
            {
                _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/rotunda.js");
                await _module.InvokeVoidAsync("init", _roomRef, _bays.Count, BayWidth);
                _renderedBayCount = _bays.Count;
            }
            else if (_module is not null && _bays.Count != _renderedBayCount)
            {
                _renderedBayCount = _bays.Count;
                await _module.InvokeVoidAsync("update", _roomRef, _bays.Count);
            }
        }
        catch (Exception)
        {
            // No JS module (tests): the ring stays at its first bay.
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is null) return;
        try
        {
            await _module.InvokeVoidAsync("dispose", _roomRef);
            await _module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
        }
    }
}
