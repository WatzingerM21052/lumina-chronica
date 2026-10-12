using System.Globalization;
using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

// Where a book was taken from: an element on the page (Key = its
// data-spread-key) or, for the 3D room, a rectangle on screen.
public record BookSpreadSource(string? Key, double Left = 0, double Top = 0, double Width = 0, double Height = 0);

public partial class BookSpread
{
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    // How long the flight waits for the cover picture before it starts
    // with the tooled cover (the picture then fades in).
    private static readonly TimeSpan CoverWait = TimeSpan.FromMilliseconds(600);

    // Called after the book is back on its shelf (the 3D room puts its own
    // book back then).
    [Parameter]
    public EventCallback OnClosed { get; set; }

    private Book? _book;
    private double? _progress;
    private BookSpreadSource? _source;
    private string _colour = Leathers[0];
    private string? _coverUrl;
    private readonly List<string> _urls = [];
    private bool _openPending;
    private bool _closing;
    private ElementReference _rootRef;
    private IJSObjectReference? _module;

    public bool IsOpen => _book is not null;

    private static string Percent(double value) => Math.Clamp(value, 0, 100).ToString("0.#", CultureInfo.InvariantCulture) + "%";

    public async Task OpenAsync(Book book, double? progress, BookSpreadSource source)
    {
        if (_book is not null || _closing) return;
        _book = book;
        _progress = progress;
        _source = source;
        _colour = Leathers[book.Id % Leathers.Length];
        _coverUrl = null;

        if (book.CoverUrl is { } coverUrl)
        {
            var load = LoadCoverAsync(book, coverUrl);
            await Task.WhenAny(load, Task.Delay(CoverWait));
        }

        _openPending = true;
        StateHasChanged();
    }

    private async Task LoadCoverAsync(Book book, string coverUrl)
    {
        var result = await ApiClient.GetBytesAsync(coverUrl);
        if (result is not { } cover || _book?.Id != book.Id) return;
        var url = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
        _urls.Add(url);
        if (_book?.Id != book.Id) return;
        _coverUrl = url;
        StateHasChanged();
    }

    public async Task CloseAsync()
    {
        if (_book is null || _closing) return;
        _closing = true;
        try
        {
            if (_module is not null) await _module.InvokeVoidAsync("close", _rootRef);
        }
        catch (Exception)
        {
            // No JS (tests): close at once.
        }
        _book = null;
        _closing = false;
        StateHasChanged();
        await OnClosed.InvokeAsync();
    }

    private Task OnKeyDown(KeyboardEventArgs e) => e.Key == "Escape" ? CloseAsync() : Task.CompletedTask;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (!_openPending || _source is null) return;
        _openPending = false;
        try
        {
            _module ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/bookSpread.js");
            await _module.InvokeVoidAsync("open", _rootRef, _source.Key, new { left = _source.Left, top = _source.Top, width = _source.Width, height = _source.Height });
        }
        catch (Exception)
        {
            // No JS (tests): the spread just shows.
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var url in _urls)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(url);
        }
        if (_module is not null)
        {
            try
            {
                await _module.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
            }
        }
    }
}
