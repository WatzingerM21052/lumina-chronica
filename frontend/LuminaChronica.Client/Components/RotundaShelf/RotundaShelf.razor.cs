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

    // A book was clicked: the library takes it out and opens it (BookSpread).
    [Parameter]
    public EventCallback<BookOpenRequest> OnOpen { get; set; }

    private List<RotundaBay> _bays = [];
    private double _radius;
    private double _step;
    private ElementReference _roomRef;
    private IJSObjectReference? _module;
    private string? _renderedKey;

    private bool Partial => _bays.Count < RotundaLayout.FullRing;

    protected override void OnParametersSet()
    {
        _bays = RotundaLayout.Bays(Sections);
        _step = RotundaLayout.Step(_bays.Count);
        _radius = RotundaLayout.Radius(_bays.Count, BayWidth);
    }

    private static string Px(double value) => value.ToString("0.##", CultureInfo.InvariantCulture) + "px";

    private static string Leather(Book book) => Leathers[book.Id % Leathers.Length];

    private static string Label(Book book) => string.IsNullOrWhiteSpace(book.Author) ? book.Title : $"{book.Title}, {book.Author}";

    private static string SpreadKey(int bay, Book book) => $"rotunda-{bay}-{book.Id}";

    private Task OpenAsync(int index, RotundaBay bay, Book book)
    {
        double? progress = bay.Progress is { } p && p.TryGetValue(book.Id, out var value) ? value : null;
        return OnOpen.InvokeAsync(new BookOpenRequest(book, progress, new BookSpreadSource(SpreadKey(index, book))));
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        // The ring is (re)initialised whenever its bays change.
        var key = string.Join("|", _bays.Select(b => $"{b.Label}:{b.Rows.Sum(r => r.Count)}"));
        if (key == _renderedKey) return;
        _renderedKey = key;
        try
        {
            _module ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/rotunda.js");
            // An arc starts in its middle, a ring at its first bay.
            var start = Partial ? (_bays.Count - 1) / 2 : 0;
            await _module.InvokeVoidAsync("init", _roomRef, _bays.Count, BayWidth, _step, start, Partial);
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
