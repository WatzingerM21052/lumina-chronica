using System.Net.Http.Headers;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.AspNetCore.Components.Web;

namespace LuminaChronica.Client.Components;

// Avatar upload as its own overlay dialog (profile backlog item raised
// 2026-09-25) -- replaces the old inline, always-visible dropzone next to
// the avatar preview (which uploaded immediately on file selection) with an
// explicit "Profilbild ändern" button and a preview-then-confirm step.
// Mirrors ConfirmDialog's overlay/initial-focus/Escape-to-cancel
// conventions, but as its own component since it also needs a file picker
// and an upload action, not just a message + two buttons.
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

    private const long MaxAvatarBytes = 5 * 1024 * 1024;
    private static readonly string[] AllowedAvatarExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    private ElementReference _dialogElement;
    private bool _wasOpen;
    private bool _isDragging;
    private byte[]? _selectedBytes;
    private string? _selectedContentType;
    private string? _selectedFileName;
    private string? _previewUrl;
    private string? _errorMessage;
    private ButtonBusyState _uploadState;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (IsOpen && !_wasOpen)
        {
            await _dialogElement.FocusAsync();
        }
        _wasOpen = IsOpen;
    }

    private async Task OnFileSelectedAsync(InputFileChangeEventArgs e)
    {
        _errorMessage = null;

        var extension = Path.GetExtension(e.File.Name).ToLowerInvariant();
        if (!AllowedAvatarExtensions.Contains(extension))
        {
            _errorMessage = $"Dateityp muss eines von {string.Join(", ", AllowedAvatarExtensions)} sein.";
            return;
        }
        if (e.File.Size > MaxAvatarBytes)
        {
            _errorMessage = $"Datei überschreitet das {MaxAvatarBytes / (1024 * 1024)}MB-Limit.";
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

        _errorMessage = response?.Error?.Message ?? "Profilbild konnte nicht hochgeladen werden.";
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

    private Task HandleKeyDownAsync(KeyboardEventArgs e) => e.Key == "Escape" ? CancelAsync() : Task.CompletedTask;

    public void Dispose()
    {
        if (_previewUrl is not null)
        {
            _ = BlobUrlService.RevokeObjectUrlAsync(_previewUrl);
        }
    }
}
