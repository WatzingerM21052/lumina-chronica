using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class ShelfBook : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Book Book { get; set; } = null!;

    [Parameter]
    public double? ProgressPercentage { get; set; }

    [Parameter]
    public string? Href { get; set; }

    [Parameter]
    public bool ShowFavorite { get; set; } = true;

    [Parameter]
    public string? OwnerUsername { get; set; }

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;
    private bool _isFavorite;
    private int? _loadedBookId;

    // Tight-banded resting rotation only (no combined rotateZ lean) --
    // wider variation combined with a simultaneous tilt read as a
    // "chaotic zigzag" during design validation, not natural shelf
    // clutter. Deterministic per book (not random) so it stays stable
    // across re-renders without needing any shared/coordinated state
    // with the parent ShelfRow. Uses % 7 (not % 5) so this decorrelates
    // from the palette index (Book.Id % 5, set in the .razor markup) --
    // note that any (Book.Id * k) % 5 is just a relabeling of Id % 5
    // (since multiplication by a unit mod 5 is a bijection on its
    // residues), so it would NOT actually decorrelate; only a different
    // modulus does. The multiplier is reduced to keep the same ~2.8deg
    // resting band as before despite the wider 7-cycle.
    private double RestRotation => -9.5 - (Book.Id % 7) * 0.47;

    private string AccessibleLabel => string.IsNullOrWhiteSpace(Book.Author)
        ? Book.Title
        : $"{Book.Title}, {Book.Author}";

    protected override async Task OnParametersSetAsync()
    {
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
