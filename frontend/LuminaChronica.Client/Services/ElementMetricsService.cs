using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/elementMetrics.js interop, mirroring BlobUrlService's
// lazy-module-import pattern.
public class ElementMetricsService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/elementMetrics.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<ElementSize> GetElementSizeAsync(ElementReference element)
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<ElementSize>("getElementSize", element);
    }
}

public record ElementSize(double Width, double Height);
