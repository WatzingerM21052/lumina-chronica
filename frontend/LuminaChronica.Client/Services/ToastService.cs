namespace LuminaChronica.Client.Services;

public enum ToastKind
{
    Info,
    Success,
    Error,
}

public record ToastMessage(int Id, string Text, ToastKind Kind);

// Global toast/snackbar feedback (issue #349 Phase B, section 22) -- did
// not exist at all before this (0 hits in a full-frontend grep). Scoped
// (registered alongside every other app service in Program.cs), and
// ToastHost is mounted once in MainLayout, which persists across
// client-side navigations -- so a toast shown right before navigating
// away (e.g. after a delete that routes back to a list) is still visible
// after the navigation completes, unlike a page-local success message.
public class ToastService
{
    private int _nextId;

    public event Action<ToastMessage>? OnShow;

    /// <summary>
    /// If the caller navigates away right after this call (the common
    /// case -- e.g. after a delete), `await Task.Yield();` before calling
    /// `NavigationManager.NavigateTo`. `Show` triggers ToastHost's render
    /// synchronously, but the actual DOM flush is still async; without a
    /// yield, the navigation's own render can occasionally win the race and
    /// the toast never reaches the DOM even though it was added to
    /// ToastHost's internal state. Confirmed live, not just theoretical --
    /// see BookDetail.razor's DeleteAsync for the reference pattern.
    /// </summary>
    public void Show(string text, ToastKind kind = ToastKind.Info) =>
        OnShow?.Invoke(new ToastMessage(_nextId++, text, kind));
}
