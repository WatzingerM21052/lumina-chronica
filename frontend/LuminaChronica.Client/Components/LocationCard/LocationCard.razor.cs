using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class LocationCard : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Location Location { get; set; } = null!;

    private string? _imageObjectUrl;
    private string? _loadedImageUrl;

    protected override async Task OnParametersSetAsync()
    {
        if (Location.ImageUrl == _loadedImageUrl) return;

        if (_imageObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_imageObjectUrl);
            _imageObjectUrl = null;
        }

        _loadedImageUrl = Location.ImageUrl;
        if (Location.ImageUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Location.ImageUrl);
        if (result is { } image)
        {
            _imageObjectUrl = await BlobUrlService.CreateObjectUrlAsync(image.Bytes, image.ContentType);
        }
    }

    public void Dispose()
    {
        if (_imageObjectUrl is not null)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(_imageObjectUrl);
        }
    }
}
