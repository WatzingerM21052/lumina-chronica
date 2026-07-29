using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// localStorage wrapper for the JWT, mirroring ThemeService's JS-module
// interop pattern.
public class TokenStore(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/auth.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<string?> GetTokenAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string?>("getToken");
    }

    public async Task SetTokenAsync(string token)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setToken", token);
    }

    public async Task ClearTokenAsync()
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("clearToken");
    }
}
