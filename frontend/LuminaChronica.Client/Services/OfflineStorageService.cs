using LuminaChronica.Client.Models;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/offlineStorage.js interop, mirroring BlobUrlService's JS-module
// pattern -- per-book file caching in IndexedDB for offline reading.
public class OfflineStorageService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/offlineStorage.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task SaveBookAsync(int id, string title, string? author, string format, byte[] fileBytes, string fileContentType)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("saveBook", id, title, author, format, fileBytes, fileContentType);
    }

    public async Task DeleteBookAsync(int id)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("deleteBook", id);
    }

    public async Task<OfflineStatus> GetStatusAsync(int id)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<OfflineStatus>("getStatus", id);
    }

    public async Task<OfflineBookFile?> GetBookFileAsync(int id)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<OfflineBookFile?>("getBookFile", id);
    }

    public async Task<List<OfflineBookSummary>> ListAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<List<OfflineBookSummary>>("listBooks");
    }
}
