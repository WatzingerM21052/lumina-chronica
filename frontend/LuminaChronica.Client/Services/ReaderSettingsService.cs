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

    public async Task<string> GetFontFamilyAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("getFontFamily");
    }

    public async Task SetFontFamilyAsync(string fontFamily)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setFontFamily", fontFamily);
    }

    public async Task<string> GetLineHeightAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("getLineHeight");
    }

    public async Task SetLineHeightAsync(string lineHeight)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setLineHeight", lineHeight);
    }

    public async Task<string> GetPageWidthAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("getPageWidth");
    }

    public async Task SetPageWidthAsync(string pageWidth)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setPageWidth", pageWidth);
    }

    public async Task<string> GetReaderModeAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("getReaderMode");
    }

    public async Task SetReaderModeAsync(string mode)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setReaderMode", mode);
    }

    public async Task<string> GetScrollbarHideAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("getScrollbarHide");
    }

    public async Task SetScrollbarHideAsync(string value)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setScrollbarHide", value);
    }
}
