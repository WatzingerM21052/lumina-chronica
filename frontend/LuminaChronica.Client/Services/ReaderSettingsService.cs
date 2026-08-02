using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/readerSettings.js interop, mirroring TokenStore's JS-module pattern.
public class ReaderSettingsService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/readerSettings.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<int> GetFontSizeAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<int>("getFontSize");
    }

    public async Task SetFontSizeAsync(int fontSize)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setFontSize", fontSize);
    }

    public async Task<double> GetPdfZoomAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<double>("getPdfZoom");
    }

    public async Task SetPdfZoomAsync(double zoom)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setPdfZoom", zoom);
    }
}
