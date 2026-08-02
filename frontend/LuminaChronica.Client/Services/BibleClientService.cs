using LuminaChronica.Client.Models;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Services;

// wwwroot/js/bible.js interop -- translation preference (localStorage, not
// reading_progress, which FKs to books and has no concept of a non-book
// text), FUMS view-tracking (api.bible license requirement), and scrolling
// to a specific verse span after a chapter renders.
public class BibleClientService(IJSRuntime jsRuntime)
{
    private const string ModulePath = "./js/bible.js";

    private readonly Lazy<Task<IJSObjectReference>> _moduleTask = new(() =>
        jsRuntime.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());

    public async Task<string?> GetLastTranslationIdAsync()
    {
        var module = await _moduleTask.Value;
        return await module.InvokeAsync<string?>("getLastTranslationId");
    }

    public async Task SetLastTranslationIdAsync(string bibleId)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("setLastTranslationId", bibleId);
    }

    public async Task TrackViewAsync(string fumsToken)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("trackView", fumsToken);
    }

    public async Task ScrollToVerseAsync(string containerId, string sid)
    {
        var module = await _moduleTask.Value;
        await module.InvokeVoidAsync("scrollToVerse", containerId, sid);
    }
}
