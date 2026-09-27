using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace LuminaChronica.Client.Components;

public enum DialogSize
{
    Small,
    Medium,
    Large,
    Sheet,
}

// Shared overlay/card primitive (design doc
// docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md
// §6.1). ConfirmDialog, AvatarUploadDialog and FollowListDialog each
// duplicate the same overlay/card CSS and focus/Escape dance, and all three
// share the same three defects this fixes: no aria-labelledby, no body
// scroll lock, and a hardcoded rgba(0,0,0,0.5) scrim instead of a shared
// elevation token. Ships under the password-reset dialog first (Phase 3);
// the three existing dialogs are migrated onto this primitive later, in a
// separate PR (Phase 4) -- not touched here.
public partial class Dialog : ComponentBase, IAsyncDisposable
{
    [Inject]
    private IJSRuntime JsRuntime { get; set; } = default!;

    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter]
    public string? Title { get; set; }

    // Lets a consumer point its own aria-describedby (or similar) at the
    // rendered title. Auto-generated per instance when omitted -- most
    // consumers don't need to know or care what the id actually is, but
    // aria-labelledby always needs a real one to point at.
    [Parameter]
    public string? TitleId { get; set; }

    [Parameter]
    public DialogSize Size { get; set; } = DialogSize.Small;

    // "alertdialog" for destructive confirms, "dialog" otherwise -- both are
    // already used correctly elsewhere in this codebase (ConfirmDialog vs.
    // FollowListDialog/AvatarUploadDialog); this just centralizes the choice
    // as a parameter instead of three separate hardcoded copies.
    [Parameter]
    public string Role { get; set; } = "dialog";

    [Parameter]
    public bool CloseOnOverlayClick { get; set; } = true;

    [Parameter]
    public bool CloseOnEscape { get; set; } = true;

    [Parameter]
    public bool ShowCloseButton { get; set; } = true;

    [Parameter]
    public EventCallback OnClose { get; set; }

    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter]
    public RenderFragment? Footer { get; set; }

    private readonly string _autoTitleId = $"dialog-title-{Guid.NewGuid():N}";
    private string EffectiveTitleId => TitleId ?? _autoTitleId;
    private string SizeClass => Size.ToString().ToLowerInvariant();

    private ElementReference _dialogElement;
    private bool _wasOpen;
    // Tracks the lock itself, not render state -- _wasOpen only updates at
    // the end of a completed OnAfterRenderAsync, so a dispose that races a
    // still-open dialog (e.g. a navigation triggered from inside the dialog
    // body, before the next render lands) must not leave <html> permanently
    // stuck at overflow:hidden with no dialog left to unlock it.
    private bool _scrollLocked;
    private IJSObjectReference? _module;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (IsOpen && !_wasOpen)
        {
            _module ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/dialog.js");
            await _module.InvokeVoidAsync("lockScroll");
            _scrollLocked = true;
            await _dialogElement.FocusAsync();
        }
        else if (!IsOpen && _wasOpen)
        {
            await UnlockScrollAsync();
        }
        _wasOpen = IsOpen;
    }

    private Task HandleOverlayClickAsync() => CloseOnOverlayClick ? OnClose.InvokeAsync() : Task.CompletedTask;

    private Task HandleKeyDownAsync(KeyboardEventArgs e) => e.Key == "Escape" && CloseOnEscape ? OnClose.InvokeAsync() : Task.CompletedTask;

    private async Task UnlockScrollAsync()
    {
        if (_module is not null && _scrollLocked)
        {
            await _module.InvokeVoidAsync("unlockScroll");
            _scrollLocked = false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await UnlockScrollAsync();
        if (_module is not null)
        {
            await _module.DisposeAsync();
        }
    }
}
