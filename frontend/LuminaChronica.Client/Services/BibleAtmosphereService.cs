using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/bibleAtmosphere.js interop, mirroring TextPaginatorService's
// JS-module pattern -- Dark Academia theme's parallax/fade-in wiring (issue #143).
public class BibleAtmosphereService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/bibleAtmosphere.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task InitAsync(string rootId, string backgroundId)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("init", rootId, backgroundId);
    }

    public async Task ObserveNewFadeInsAsync(string rootId)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("observeNewFadeIns", rootId);
    }

    public async Task DestroyAsync(string rootId)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("destroy", rootId);
    }
}
