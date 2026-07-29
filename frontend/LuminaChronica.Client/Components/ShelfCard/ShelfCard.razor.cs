using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class ShelfCard : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Shelf Shelf { get; set; } = null!;

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;

    protected override async Task OnParametersSetAsync()
    {
        if (Shelf.CoverUrl == _loadedCoverUrl) return;

        if (_coverObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
            _coverObjectUrl = null;
        }

        _loadedCoverUrl = Shelf.CoverUrl;
        if (Shelf.CoverUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Shelf.CoverUrl);
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
