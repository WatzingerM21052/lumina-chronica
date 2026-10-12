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

    // Sets a spine title the way a binder would: at the full size if it fits
    // the title piece, smaller for a long title (down to a readable minimum),
    // then in two lines if the spine is wide enough; only beyond that it is
    // cut. labelLength/labelWidth are the title piece's inner size in px.
    protected string TitleFit(double labelLength, double labelWidth, double basePx)
    {
        const double charEm = 0.5; // Cormorant Garamond bold, letter-spaced
        var full = basePx * Zoom;
        var min = 8.5 * Zoom;
        var length = Math.Max(1, Book.Title.Length);
        var oneLine = labelLength / (length * charEm);
        if (oneLine >= min) return $"--title-size: {Px(Math.Min(full, oneLine))}; --title-lines: 1";
        // Two lines: as large as both the length and the spine's width allow.
        var size = Math.Min(Math.Min(full, labelLength * 2 / (length * charEm)), (labelWidth - 2) / 2.15);
        return size >= min
            ? $"--title-size: {Px(size)}; --title-lines: 2"
            : $"--title-size: {Px(min)}; --title-lines: 1";
    }

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
