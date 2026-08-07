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

    // Defaults to the book detail page; the Home dashboard's continue-reading
    // cards override this to link straight into the Reader, which resolves
    // the saved position itself (see reading_progress.position in Database.md).
    [Parameter]
    public string? Href { get; set; }

    // Favoriting stays owner-only (see bookService.ts's addFavorite/removeFavorite);
    // the Home dashboard's continue-reading cards set this to false for a
    // borrowed (SHARED, not owned) book so the star button -- which would
    // just 404 -- never renders.
    [Parameter]
    public bool ShowFavorite { get; set; } = true;

    // Set for a borrowed book: the owner's username, rendered as a
    // "Geliehen von {username}" badge instead of the favorite star.
    [Parameter]
    public string? OwnerUsername { get; set; }

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;
    private bool _isFavorite;
    private int? _loadedBookId;

    protected override async Task OnParametersSetAsync()
    {
        // Book.IsFavorite only reflects the value at last fetch -- re-sync
        // local state whenever a different book is bound, but let a toggle
        // click's own optimistic update stand until the next real fetch.
        if (Book.Id != _loadedBookId)
        {
            _loadedBookId = Book.Id;
            _isFavorite = Book.IsFavorite;
        }

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

    private async Task ToggleFavoriteAsync()
    {
        var wasFavorite = _isFavorite;
        _isFavorite = !wasFavorite;

        var succeeded = wasFavorite
            ? await ApiClient.DeleteAsync($"/api/books/{Book.Id}/favorite")
            : await ApiClient.PostAsync($"/api/books/{Book.Id}/favorite");

        if (!succeeded)
        {
            _isFavorite = wasFavorite;
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
