namespace LuminaChronica.Client.Services;

// Shared behaviour for a page's form dialogs (UI/UX plan A5): closing with
// unsaved input asks first, and a submit ignores double clicks. One
// instance per page; the page renders a single ConfirmDialog bound to
// IsConfirmingDiscard / ConfirmDiscard / CancelDiscard.
//
// All members are called from Blazor event handlers, so the page re-renders
// on its own afterwards -- no StateHasChanged needed here.
public sealed class DialogGuard
{
    private Action? _pendingClose;

    public bool IsConfirmingDiscard => _pendingClose is not null;

    public bool IsSubmitting { get; private set; }

    // Closes right away when nothing was typed; otherwise parks the close
    // until the user confirms "Verwerfen".
    public void RequestClose(bool isDirty, Action close)
    {
        if (isDirty)
        {
            _pendingClose = close;
            return;
        }
        close();
    }

    public void ConfirmDiscard()
    {
        var close = _pendingClose;
        _pendingClose = null;
        close?.Invoke();
    }

    public void CancelDiscard() => _pendingClose = null;

    public async Task SubmitAsync(Func<Task> submit)
    {
        if (IsSubmitting) return;
        IsSubmitting = true;
        try
        {
            await submit();
        }
        finally
        {
            IsSubmitting = false;
        }
    }

    public static bool HasText(string? value) => !string.IsNullOrWhiteSpace(value);
}
