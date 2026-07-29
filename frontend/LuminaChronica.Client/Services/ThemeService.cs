using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

public class ThemeService(IJSRuntime jsRuntime) : IThemeService
{
    private const string ModulePath = "./js/theme.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<string> GetThemeAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string>("getTheme");
    }

    public async Task SetThemeAsync(string theme)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setTheme", theme);
    }
}
