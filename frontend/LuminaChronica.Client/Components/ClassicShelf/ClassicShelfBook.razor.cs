using System.Globalization;
using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

public partial class ClassicShelfBook : ComponentBase, IDisposable
{
    // Leather colours for books without a cover tint (the shelf preview's
    // palette); picked by id so a book keeps its colour.
    private static readonly string[] Leathers =
        ["#5b1f2a", "#1f3a4d", "#2d4a2b", "#6b3a1e", "#3b2a4f", "#55222d", "#1d3b3b", "#4b3a17", "#203048", "#3a1414", "#24384a", "#5a3a12"];

    [Parameter, EditorRequired]
    public Book Book { get; set; } = null!;

    [Parameter]
    public double Zoom { get; set; } = 1;

    [Parameter]
    public bool ShowCoverText { get; set; } = true;

    [Parameter]
    public double? ProgressPercentage { get; set; }

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;
    private string? _tint;

    private string AccessibleLabel => string.IsNullOrWhiteSpace(Book.Author) ? Book.Title : $"{Book.Title}, {Book.Author}";

    private string SlotStyle
    {
        get
        {
            var size = ShelfLineLayout.SizeFor(Book);
            var colour = _tint ?? Leathers[Book.Id % Leathers.Length];
            return string.Create(CultureInfo.InvariantCulture,
                $"--w: {size.Width * Zoom:0.##}px; --h: {size.Height * Zoom:0.##}px; --d: {140 * Zoom:0.##}px; --c: {colour}");
        }
    }

    private static string Percent(double value) =>
        Math.Clamp(value, 0, 100).ToString("0.#", CultureInfo.InvariantCulture) + "%";

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
            _coverObjectUrl = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
            _tint = await CoverColorService.ExtractDominantColorAsync(requested, _coverObjectUrl);
        }
    }

    private void RevokeCover()
    {
        if (_coverObjectUrl is null) return;
        _ = BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
        _coverObjectUrl = null;
    }

    public void Dispose() => RevokeCover();
}
