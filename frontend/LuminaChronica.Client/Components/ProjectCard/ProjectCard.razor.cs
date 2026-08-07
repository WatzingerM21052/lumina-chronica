using Microsoft.AspNetCore.Components;
using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class ProjectCard : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public Project Project { get; set; } = null!;

    private string? _coverObjectUrl;
    private string? _loadedCoverUrl;

    protected override async Task OnParametersSetAsync()
    {
        if (Project.CoverUrl == _loadedCoverUrl) return;

        if (_coverObjectUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_coverObjectUrl);
            _coverObjectUrl = null;
        }

        _loadedCoverUrl = Project.CoverUrl;
        if (Project.CoverUrl is null) return;

        var result = await ApiClient.GetBytesAsync(Project.CoverUrl);
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
