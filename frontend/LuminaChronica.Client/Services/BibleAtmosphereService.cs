using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/bibleAtmosphere.js interop, mirroring TextPaginatorService's
// JS-module pattern -- Dark Academia theme's background parallax (issue #143).
public class BibleAtmosphereService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/bibleAtmosphere.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task InitAsync(string backgroundId)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("init", backgroundId);
    }

    public async Task DestroyAsync()
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("destroy");
    }
}
