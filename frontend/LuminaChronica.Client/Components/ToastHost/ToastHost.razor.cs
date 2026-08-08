using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Mounted once in MainLayout (issue #349 Phase B, section 22) -- MainLayout
// persists across client-side navigations, so a toast queued right before
// e.g. a post-delete NavigateTo is still visible on the page that follows.
public partial class ToastHost : ComponentBase, IDisposable
{
    private const int AutoDismissMs = 4000;

    private readonly List<ToastMessage> _toasts = [];

    protected override void OnInitialized() => ToastService.OnShow += HandleShow;

    // Not InvokeAsync(StateHasChanged) -- HandleShow already runs
    // synchronously on the renderer's own dispatch (Show() is called
    // directly from a page's own event-handler chain, e.g. BookDetail's
    // DeleteAsync). Wrapping in InvokeAsync posts the re-render to the next
    // sync-context tick instead of applying it immediately -- if the
    // caller's very next line is a NavigationManager.NavigateTo (as it is
    // for the delete-then-navigate case this was built for), the
    // navigation's own render can supersede the queued one before it ever
    // runs, silently dropping the toast. Confirmed live: with InvokeAsync,
    // _toasts held the item (count=1) but 0 <div class="toast"> ever
    // rendered; switching to a direct call fixed it (toastCount:1
    // immediately after the click, verified via a JS trace since a
    // screenshot can't reliably land inside the ~4s auto-dismiss window).
    private void HandleShow(ToastMessage toast)
    {
        _toasts.Add(toast);
        StateHasChanged();

        _ = AutoDismissAsync(toast.Id);
    }

    private async Task AutoDismissAsync(int id)
    {
        await Task.Delay(AutoDismissMs);
        await InvokeAsync(() => Dismiss(id));
    }

    private void Dismiss(int id)
    {
        _toasts.RemoveAll(t => t.Id == id);
        StateHasChanged();
    }

    private static string IconFor(ToastKind kind) => kind switch
    {
        ToastKind.Success => "check",
        ToastKind.Error => "alert",
        _ => "info",
    };

    public void Dispose() => ToastService.OnShow -= HandleShow;
}
