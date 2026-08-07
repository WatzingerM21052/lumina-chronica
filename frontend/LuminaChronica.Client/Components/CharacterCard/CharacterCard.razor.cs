using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class CharacterCard : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Character Character { get; set; } = null!;

    private string? _imageObjectUrl;
    private string? _loadedImageUrl;

    protected override async Task OnParametersSetAsync()
    {
        if (Character.ImageUrl == _loadedImageUrl) return;

        if (_imageObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_imageObjectUrl);
            _imageObjectUrl = null;
        }

        _loadedImageUrl = Character.ImageUrl;
        if (Character.ImageUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Character.ImageUrl);
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
