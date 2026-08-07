using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/blobUrl.js interop, mirroring TokenStore's JS-module pattern.
public class BlobUrlService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/blobUrl.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<string> CreateObjectUrlAsync(byte[] bytes, string mimeType)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("createObjectUrl", bytes, mimeType);
    }

    public async Task RevokeObjectUrlAsync(string url)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("revokeObjectUrl", url);
    }

    public async Task TriggerDownloadAsync(string url, string filename)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("triggerDownload", url, filename);
    }
}
