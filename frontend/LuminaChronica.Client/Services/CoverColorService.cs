using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// Thin wrapper around coverColor.js, following BlobUrlService's exact
// established shape for a lazily-imported single-purpose JS module.
public class CoverColorService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/coverColor.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    // coverUrl is the stable cache key (Book.CoverUrl); objectUrl is the
    // actual loadable blob: URL, only used by the JS module on a cache
    // miss. Returns null if extraction failed or the JS call itself
    // threw -- callers must treat null as "no tint available, use the
    // existing procedural fallback," never as an error to surface.
    // Virtual so tests can substitute a fake result without needing to
    // mock JS interop for this specific call (see ShelfBookTests.cs).
    public virtual async Task<string?> ExtractDominantColorAsync(string coverUrl, string objectUrl)
    {
        try
        {
            var module = await _moduleTask.Value;
            return await module.InvokeAsync<string?>("extractDominantColor", coverUrl, objectUrl);
        }
        catch (Exception)
        {
            return null;
        }
    }
}
