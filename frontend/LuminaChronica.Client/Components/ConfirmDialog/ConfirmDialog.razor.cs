using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace LuminaChronica.Client.Components;

// Real overlay/focus-trap-lite confirm dialog, replacing the inline
// button-row-swap duplicated in BookDetail.razor/ShelfDetail.razor (issue
// #144, point 1). Not a full focus trap (Tab still exits to the rest of the
// page) -- for a two-button dialog, initial focus + overlay-click-to-cancel +
// Escape-to-cancel covers the actual complaint (easy to misclick when the
// button row shifts underneath the cursor) without building a generic
// trap-cycling mechanism nothing else in the app needs yet.
public partial class ConfirmDialog : ComponentBase
{
    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter, EditorRequired]
    public string Message { get; set; } = string.Empty;

    [Parameter]
    public string ConfirmText { get; set; } = "Ja, löschen";

    [Parameter]
    public string CancelText { get; set; } = "Abbrechen";

    [Parameter]
    public EventCallback OnConfirm { get; set; }

    [Parameter]
    public EventCallback OnCancel { get; set; }

    private ElementReference _dialogElement;
    private bool _wasOpen;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (IsOpen && !_wasOpen)
        {
            await _dialogElement.FocusAsync();
        }
        _wasOpen = IsOpen;
    }

    private Task ConfirmAsync() => OnConfirm.InvokeAsync();

    private Task CancelAsync() => OnCancel.InvokeAsync();

    private Task HandleKeyDownAsync(KeyboardEventArgs e) => e.Key == "Escape" ? CancelAsync() : Task.CompletedTask;
}
