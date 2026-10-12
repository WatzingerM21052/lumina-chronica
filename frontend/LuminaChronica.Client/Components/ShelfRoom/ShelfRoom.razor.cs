using System.Globalization;
using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public partial class ShelfRoom
{
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Parameter, EditorRequired]
    public IReadOnlyList<ShelfSection> Sections { get; set; } = [];

    // Only used by the classic fallback; the 3D camera has its own scale.
    [Parameter]
    public double Zoom { get; set; } = 1;

    [Parameter]
    public bool ShowCoverText { get; set; } = true;

    private bool _fallback;
    private ElementReference _containerRef;
    private ElementReference _closeRef;
    private IJSObjectReference? _module;
    private DotNetObjectReference<ShelfRoom>? _selfRef;
    // The library re-creates its sections on every render; the scene is
    // only rebuilt when what it shows changes.
    private string? _sentKey;
    private Book? _picked;
    private bool _focusClose;
    private int? _focusLink;
    private readonly Dictionary<int, string> _coverUrls = [];

    private static string Label(Book book) => string.IsNullOrWhiteSpace(book.Author) ? book.Title : $"{book.Title}, {book.Author}";

    private static string Percent(double value) => Math.Clamp(value, 0, 100).ToString("0.#", CultureInfo.InvariantCulture) + "%";

    private double? ProgressOf(Book book) =>
        Sections.FirstOrDefault(s => s.Kind == ShelfSectionKind.Recent)?.Progress is { } progress && progress.TryGetValue(book.Id, out var value) ? value : null;

    // What the scene needs, nothing more: sizes in classic-shelf px.
    private object SceneData() => new
    {
        sections = Sections.Select(s => new
        {
            label = s.Label,
            books = s.Books.Select(b =>
            {
                var size = ShelfLineLayout.SizeFor(b);
                return new
                {
                    id = b.Id,
                    title = b.Title,
                    author = b.Author,
                    colour = Leathers[b.Id % Leathers.Length],
                    w = size.Width,
                    h = size.Height,
                    progress = s.Progress is { } p && p.TryGetValue(b.Id, out var v) ? v : (double?)null,
                };
            }),
        }),
    };

    private string SceneKey() =>
        string.Join("|", Sections.Select(s => s.Label + ":" + string.Join(",", s.Books.Select(b => b.Id))));

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
            if (_focusClose)
            {
                _focusClose = false;
                await _closeRef.FocusAsync();
            }
            if (_focusLink is { } id)
            {
                _focusLink = null;
                await _module.InvokeVoidAsync("focusLink", _containerRef, id);
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

    private Book? Find(int id) => Sections.SelectMany(s => s.Books).FirstOrDefault(b => b.Id == id);

    [JSInvokable]
    public void OnPicked(int id)
    {
        _picked = Find(id);
        _focusClose = _picked is not null;
        StateHasChanged();
    }

    [JSInvokable]
    public void OnReleased()
    {
        _focusLink = _picked?.Id;
        _picked = null;
        StateHasChanged();
    }

    // The picked book's cover for the scene, as a blob URL (the API needs
    // the session, which the scene's own image loader wouldn't send).
    [JSInvokable]
    public async Task<string?> CoverUrl(int id)
    {
        if (_coverUrls.TryGetValue(id, out var cached)) return cached;
        if (Find(id)?.CoverUrl is not { } coverUrl) return null;
        var result = await ApiClient.GetBytesAsync(coverUrl);
        if (result is not { } cover) return null;
        var url = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
        _coverUrls[id] = url;
        return url;
    }

    private async Task FocusAsync(Book book)
    {
        if (_module is not null) await _module.InvokeVoidAsync("focusBook", _containerRef, book.Id);
    }

    private async Task PickAsync(Book book)
    {
        if (_module is not null) await _module.InvokeVoidAsync("pickBook", _containerRef, book.Id);
    }

    private async Task ReleaseAsync()
    {
        if (_module is not null) await _module.InvokeVoidAsync("release", _containerRef);
    }

    private Task OnCardKeyDown(KeyboardEventArgs e) => e.Key == "Escape" ? ReleaseAsync() : Task.CompletedTask;

    public async ValueTask DisposeAsync()
    {
        foreach (var url in _coverUrls.Values)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(url);
        }
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
