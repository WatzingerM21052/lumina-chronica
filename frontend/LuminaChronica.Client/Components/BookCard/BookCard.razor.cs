using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public enum BookCardSize
{
    Small,
    Normal,
    Large,
}

public partial class BookCard : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Book Book { get; set; } = null!;

    [Parameter]
    public BookCardSize Size { get; set; } = BookCardSize.Normal;

    // Not fetched yet -- reading_progress has no producing feature until
    // Phase 4 (Reader). Left as an optional parameter so callers can supply
    // it once that exists, instead of this component reaching for an
    // endpoint that doesn't exist yet.
    [Parameter]
    public double? ProgressPercentage { get; set; }

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;

    protected override async Task OnParametersSetAsync()
    {
        if (Book.CoverUrl == _loadedCoverUrl) return;

        if (_coverObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
            _coverObjectUrl = null;
        }

        _loadedCoverUrl = Book.CoverUrl;
        if (Book.CoverUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Book.CoverUrl);
        if (result is { } cover)
        {
            _coverObjectUrl = await BlobUrlService.CreateObjectUrlAsync(cover.Bytes, cover.ContentType);
        }
    }

    public void Dispose()
    {
        if (_coverObjectUrl is not null)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
        }
    }
}
