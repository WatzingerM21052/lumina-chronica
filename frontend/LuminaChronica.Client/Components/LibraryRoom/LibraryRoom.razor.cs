using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class LibraryRoom
{
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Parameter, EditorRequired]
    public IReadOnlyList<ShelfSection> Sections { get; set; } = [];

    [Parameter]
    public EventCallback<BookOpenRequest> OnOpen { get; set; }

    private RoomPlan _plan = new([], 1, LibraryRoomLayout.SlotsPerTier);
    private string? _planKey;
    private string? _sentKey;
    private bool _fallback;
    private bool _ready;
    private int _current = -1;
    private ElementReference _containerRef;
    private IJSObjectReference? _module;
    private DotNetObjectReference<LibraryRoom>? _selfRef;

    private static string SpineStyle(Book book) => $"background-color: {Leathers[book.Id % Leathers.Length]}";

    private static string Label(Book book) => string.IsNullOrWhiteSpace(book.Author) ? book.Title : $"{book.Title}, {book.Author}";

    private string Key() => string.Join("|", Sections.Select(s => s.Label + ":" + string.Join(",", s.Books.Select(b => b.Id))));

    protected override void OnParametersSet()
    {
        var key = Key();
        if (key == _planKey) return;
        _planKey = key;
        _plan = LibraryRoomLayout.Plan(Sections);
    }

    private int SectionOf(int caseIndex) => caseIndex >= 0 && caseIndex < _plan.Cases.Count ? _plan.Cases[caseIndex].SectionIndex : -1;

    private double? ProgressOf(int id) =>
        Sections.FirstOrDefault(s => s.Kind == ShelfSectionKind.Recent)?.Progress is { } p && p.TryGetValue(id, out var v) ? v : null;

    private object SceneData() => new
    {
        tiers = _plan.Tiers,
        slots = _plan.SlotsPerTier,
        cases = _plan.Cases.Select(c => new
        {
            index = c.Index,
            tier = c.Tier,
            angle = c.AngleDeg,
            label = c.Label,
            continued = c.Continued,
            recent = c.Recent,
            boards = c.Boards.Select(board => board.Select(b =>
            {
                var size = ShelfLineLayout.SizeFor(b);
                return new { id = b.Id, title = b.Title, author = b.Author, colour = Leathers[b.Id % Leathers.Length], w = size.Width, h = size.Height, progress = c.Recent ? ProgressOf(b.Id) : null };
            })),
        }),
    };

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (_fallback) return;
        try
        {
            if (firstRender)
            {
                _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/libraryRoom/index.js");
                if (!await _module.InvokeAsync<bool>("supported"))
                {
                    _fallback = true;
                    StateHasChanged();
                    return;
                }
                _selfRef = DotNetObjectReference.Create(this);
                _sentKey = _planKey;
                await _module.InvokeVoidAsync("init", _containerRef, _selfRef, SceneData());
                return;
            }
            if (_module is not null && _sentKey != _planKey)
            {
                _sentKey = _planKey;
                await _module.InvokeVoidAsync("update", _containerRef, SceneData());
            }
        }
        catch (Exception) when (firstRender)
        {
            _fallback = true;
            StateHasChanged();
        }
    }

    [JSInvokable]
    public Task Open(int id, double left, double top, double width, double height)
    {
        var book = Sections.SelectMany(s => s.Books).FirstOrDefault(b => b.Id == id);
        return book is null ? Task.CompletedTask
            : OnOpen.InvokeAsync(new BookOpenRequest(book, ProgressOf(id), new BookSpreadSource(null, left, top, width, height)));
    }

    [JSInvokable]
    public void Ready() { _ready = true; StateHasChanged(); }

    [JSInvokable]
    public void Failed() { _fallback = true; StateHasChanged(); }

    [JSInvokable]
    public void CaseChanged(int caseIndex) { _current = caseIndex; StateHasChanged(); }

    private async Task GoToAsync(int caseIndex) { if (_module is not null) await _module.InvokeVoidAsync("goTo", _containerRef, caseIndex); }

    private async Task GoHomeAsync() { if (_module is not null) await _module.InvokeVoidAsync("goHome", _containerRef); }

    private async Task FocusAsync(Book book) { if (_module is not null) await _module.InvokeVoidAsync("focusBook", _containerRef, book.Id); }

    private async Task PickAsync(Book book) { if (_module is not null) await _module.InvokeVoidAsync("pickBook", _containerRef, book.Id); }

    public async ValueTask DisposeAsync()
    {
        if (_module is not null)
        {
            try
            {
                await _module.InvokeVoidAsync("dispose", _containerRef);
                await _module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
        _selfRef?.Dispose();
    }
}
