using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/textPaginator.js interop, mirroring ScrollTrackerService's JS-module pattern.
public class TextPaginatorService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/textPaginator.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    // dotNetRef is typed as object (not a specific DotNetObjectReference<T>)
    // deliberately -- this service is shared/injected like ScrollTrackerService,
    // and typing it to the Reader page specifically would invert the usual
    // Services->Pages dependency direction. The caller creates a real
    // DotNetObjectReference<Reader>.Create(this); JS interop's wire protocol
    // only cares that it's a DotNetObjectReference instance, not its generic
    // parameter.
    public async Task<int> InitAsync(string viewportId, string contentId, object dotNetRef)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<int>("init", viewportId, contentId, dotNetRef);
    }

    public async Task<int> RelayoutAsync(string viewportId, string contentId)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<int>("relayout", viewportId, contentId);
    }

    public async Task<int> GoToPageAsync(string contentId, int page)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<int>("goToPage", contentId, page);
    }

    public async Task DestroyAsync(string contentId)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("destroy", contentId);
    }
}
