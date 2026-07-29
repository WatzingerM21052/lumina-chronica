using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/scrollTracker.js interop, mirroring TokenStore/BlobUrlService's JS-module pattern.
public class ScrollTrackerService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/scrollTracker.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<double> GetScrollFractionAsync(string elementId)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<double>("getScrollFraction", elementId);
    }

    public async Task SetScrollFractionAsync(string elementId, double fraction)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setScrollFraction", elementId, fraction);
    }
}
