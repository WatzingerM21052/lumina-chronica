using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class ShelfRoom
{
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Parameter, EditorRequired]
    public IReadOnlyList<ShelfSection> Sections { get; set; } = [];

    // Only used by the classic fallback; the scene scales to the page.
    [Parameter]
    public double Zoom { get; set; } = 1;

    [Parameter]
    public bool ShowCoverText { get; set; } = true;

    // A book was clicked: the library takes it out and opens it (BookSpread).
    [Parameter]
    public EventCallback<BookOpenRequest> OnOpen { get; set; }

    private bool _fallback;
    private ElementReference _containerRef;
    private IJSObjectReference? _module;
    private DotNetObjectReference<ShelfRoom>? _selfRef;
    // The library re-creates its sections on every render; the scene is
    // only rebuilt when what it shows changes.
    private string? _sentKey;

    private static string Label(Book book) => string.IsNullOrWhiteSpace(book.Author) ? book.Title : $"{book.Title}, {book.Author}";

    private string SceneKey() =>
        string.Join("|", Sections.Select(s => s.Label + ":" + string.Join(",", s.Books.Select(b => b.Id))));

    // What the scene needs: compartments and book sizes in classic-shelf px.
    private object SceneData() => new
    {
        sections = Sections.Select(s => new
        {
            label = s.Label,
            recent = s.Kind == ShelfSectionKind.Recent,
            books = s.Books.Select(b =>
            {
                var size = ShelfLineLayout.SizeFor(b);
                return new { id = b.Id, title = b.Title, colour = Leathers[b.Id % Leathers.Length], w = size.Width, h = size.Height };
            }),
        }),
    };

    private Book? Find(int id) => Sections.SelectMany(s => s.Books).FirstOrDefault(b => b.Id == id);

    private double? ProgressOf(int id) =>
        Sections.FirstOrDefault(s => s.Kind == ShelfSectionKind.Recent)?.Progress is { } progress && progress.TryGetValue(id, out var value) ? value : null;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (_fallback) return;
        try
        {
            if (firstRender)
            {
                _module = await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/shelfRoom.js");
                if (!await _module.InvokeAsync<bool>("supported"))
                {
                    _fallback = true;
                    StateHasChanged();
                    return;
                }
                _selfRef = DotNetObjectReference.Create(this);
                _sentKey = SceneKey();
                await _module.InvokeVoidAsync("init", _containerRef, _selfRef, SceneData());
                return;
            }

            if (_module is null) return;
            var key = SceneKey();
            if (key != _sentKey)
            {
                _sentKey = key;
                await _module.InvokeVoidAsync("update", _containerRef, SceneData());
            }
        }
        catch (Exception)
        {
            // No JS (tests) or no WebGL: the classic shelf stands in.
            if (firstRender)
            {
                _fallback = true;
                StateHasChanged();
            }
        }
    }

    // The scene picked a book; rect is where it is on screen.
    [JSInvokable]
    public Task Open(int id, double left, double top, double width, double height)
    {
        if (Find(id) is not { } book) return Task.CompletedTask;
        return OnOpen.InvokeAsync(new BookOpenRequest(book, ProgressOf(id), new BookSpreadSource(null, left, top, width, height)));
    }

    private async Task FocusAsync(Book book)
    {
        if (_module is not null) await _module.InvokeVoidAsync("focusBook", _containerRef, book.Id);
    }

    private async Task PickAsync(Book book)
    {
        if (_module is not null) await _module.InvokeVoidAsync("pickBook", _containerRef, book.Id);
    }

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
