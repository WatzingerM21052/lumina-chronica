using System.Net.Http.Headers;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;

namespace LuminaChronica.Client.Components;

// Avatar upload as its own dialog (profile backlog item raised 2026-09-25)
// -- replaces the old inline, always-visible dropzone next to the avatar
// preview (which uploaded immediately on file selection) with an explicit
// "Profilbild ändern" button and a preview-then-confirm step. Built on the
// shared Dialog primitive (Phase 4 migration); only the file picker and
// upload action are specific to this component.
public partial class AvatarUploadDialog : ComponentBase, IDisposable
{
    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter, EditorRequired]
    public EventCallback<UserProfile> OnUploaded { get; set; }

    [Parameter, EditorRequired]
    public EventCallback OnClose { get; set; }

    [Inject]
    private ApiClient ApiClient { get; set; } = null!;

    [Inject]
    private BlobUrlService BlobUrlService { get; set; } = null!;

    [Inject]
    private II18nService I18n { get; set; } = null!;

    private const long MaxAvatarBytes = 5 * 1024 * 1024;
    private static readonly string[] AllowedAvatarExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    private bool _isDragging;
    private byte[]? _selectedBytes;
    private string? _selectedContentType;
    private string? _selectedFileName;
    private string? _previewUrl;
    private string? _errorMessage;
    private ButtonBusyState _uploadState;

    private async Task OnFileSelectedAsync(InputFileChangeEventArgs e)
    {
        _errorMessage = null;

        var extension = Path.GetExtension(e.File.Name).ToLowerInvariant();
        if (!AllowedAvatarExtensions.Contains(extension))
        {
            _errorMessage = string.Format(I18n.T("avatarUploadDialog.invalidType"), string.Join(", ", AllowedAvatarExtensions));
            return;
        }
        if (e.File.Size > MaxAvatarBytes)
        {
            _errorMessage = string.Format(I18n.T("avatarUploadDialog.tooLarge"), MaxAvatarBytes / (1024 * 1024));
            return;
        }

        using var stream = e.File.OpenReadStream(MaxAvatarBytes);
        using var memoryStream = new MemoryStream();
        await stream.CopyToAsync(memoryStream);
        _selectedBytes = memoryStream.ToArray();
        _selectedContentType = string.IsNullOrWhiteSpace(e.File.ContentType) ? "application/octet-stream" : e.File.ContentType;
        _selectedFileName = e.File.Name;

        if (_previewUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_previewUrl);
        }
        _previewUrl = await BlobUrlService.CreateObjectUrlAsync(_selectedBytes, _selectedContentType);
    }

    private Task UploadAsync() =>
        AsyncButtonRunner.RunAsync(UploadCoreAsync, state =>
        {
            _uploadState = state;
            StateHasChanged();
        });

    private async Task<bool> UploadCoreAsync()
    {
        if (_selectedBytes is null || _selectedContentType is null || _selectedFileName is null) return false;
        _errorMessage = null;

        using var content = new MultipartFormDataContent();
        var byteContent = new ByteArrayContent(_selectedBytes);
        byteContent.Headers.ContentType = new MediaTypeHeaderValue(_selectedContentType);
        content.Add(byteContent, "\"avatar\"", $"\"{_selectedFileName}\"");

        var response = await ApiClient.PutMultipartAsync<UserProfile>("/api/users/me/avatar", content);
        if (response is { Success: true, Data: not null })
        {
            await ResetAsync();
            await OnUploaded.InvokeAsync(response.Data);
            return true;
        }

        _errorMessage = response?.Error?.Message ?? I18n.T("avatarUploadDialog.uploadFailed");
        return false;
    }

    private async Task CancelAsync()
    {
        await ResetAsync();
        await OnClose.InvokeAsync();
    }

    private async Task ResetAsync()
    {
        if (_previewUrl is not null)
        {
            await BlobUrlService.RevokeObjectUrlAsync(_previewUrl);
        }
        _previewUrl = null;
        _selectedBytes = null;
        _selectedContentType = null;
        _selectedFileName = null;
        _errorMessage = null;
    }

    public void Dispose()
    {
        if (_previewUrl is not null)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(_previewUrl);
        }
    }
}
