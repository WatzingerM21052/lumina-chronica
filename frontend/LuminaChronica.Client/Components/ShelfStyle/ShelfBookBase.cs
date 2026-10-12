using System.Globalization;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// One book of a shelf style: its link label, its colour (the cover's tint,
// else a leather colour picked by id) and its cover picture, loaded once
// per cover URL and revoked again on dispose.
public abstract class ShelfBookBase : ComponentBase, IDisposable
{
    // Leather colours for books without a cover tint (the shelf preview's
    // palette); picked by id so a book keeps its colour.
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Inject]
    private ApiClient ApiClient { get; set; } = null!;

    [Inject]
    private BlobUrlService BlobUrlService { get; set; } = null!;

    [Inject]
    private CoverColorService CoverColorService { get; set; } = null!;

    [Parameter, EditorRequired]
    public Book Book { get; set; } = null!;

    [Parameter]
    public double Zoom { get; set; } = 1;

    [Parameter]
    public bool ShowCoverText { get; set; } = true;

    [Parameter]
    public double? ProgressPercentage { get; set; }

    protected string? CoverObjectUrl { get; private set; }

    private string? _loadedCoverUrl;
    private string? _tint;

    protected string AccessibleLabel => string.IsNullOrWhiteSpace(Book.Author) ? Book.Title : $"{Book.Title}, {Book.Author}";

    protected string Colour => _tint ?? Leathers[Book.Id % Leathers.Length];

    protected static string Percent(double value) =>
        Math.Clamp(value, 0, 100).ToString("0.#", CultureInfo.InvariantCulture) + "%";

    protected static string Px(double value) => value.ToString("0.##", CultureInfo.InvariantCulture) + "px";

    protected override async Task OnParametersSetAsync()
    {
        if (Book.CoverUrl == _loadedCoverUrl) return;

        RevokeCover();
        _loadedCoverUrl = Book.CoverUrl;
        _tint = null;
        if (Book.CoverUrl is null) return;

        var requested = Book.CoverUrl;
        var result = await ApiClient.GetBytesAsync(requested);
        if (result is { } cover && requested == _loadedCoverUrl)
        {
            CoverObjectUrl = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
            _tint = await CoverColorService.ExtractDominantColorAsync(requested, CoverObjectUrl);
        }
    }

    private void RevokeCover()
    {
        if (CoverObjectUrl is null) return;
        _ = BlobUrlService.RevokeObjectUrlAsync(CoverObjectUrl);
        CoverObjectUrl = null;
    }

    public void Dispose()
    {
        RevokeCover();
        GC.SuppressFinalize(this);
    }
}
