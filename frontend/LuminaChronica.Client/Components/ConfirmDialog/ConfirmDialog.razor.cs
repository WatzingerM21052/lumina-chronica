using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

public partial class ConfirmDialog : ComponentBase
{
    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter, EditorRequired]
    public string Message { get; set; } = string.Empty;

    [Parameter]
    public string? ConfirmText { get; set; }

    [Parameter]
    public string? CancelText { get; set; }

    [Parameter]
    public EventCallback OnConfirm { get; set; }

    [Parameter]
    public EventCallback OnCancel { get; set; }

    // The question itself names the alertdialog (review N-1) -- no separate
    // title to keep in sync with it.
    private readonly string _messageId = $"confirm-message-{Guid.NewGuid():N}";

    private Task ConfirmAsync() => OnConfirm.InvokeAsync();

    private Task CancelAsync() => OnCancel.InvokeAsync();
}
