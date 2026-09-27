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

    // Names a title-less dialog (ConfirmDialog points it at its message).
    // Ignored when Title is set -- the rendered title always wins.
    [Parameter]
    public string? AriaLabelledBy { get; set; }

    // CSS selector (scoped to the card) for the element that gets focus on
    // open, e.g. a confirm's non-destructive button. Default: the first form
    // field in the body, else the card itself.
    [Parameter]
    public string? InitialFocusSelector { get; set; }

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

    private readonly string _instanceId = Guid.NewGuid().ToString("N");
    private string _autoTitleId => $"dialog-title-{_instanceId}";
    private string EffectiveTitleId => TitleId ?? _autoTitleId;
    private string SizeClass => Size.ToString().ToLowerInvariant();
    private string? EffectiveLabelledBy => Title is not null ? EffectiveTitleId : AriaLabelledBy;

    private ElementReference _dialogElement;
    private bool _wasOpen;
    // Tracks the lock itself, not render state -- _wasOpen only updates at
    // the end of a completed OnAfterRenderAsync, so a dispose that races a
    // still-open dialog (e.g. a navigation triggered from inside the dialog
    // body, before the next render lands) must not leave <html> permanently
    // stuck at overflow:hidden with no dialog left to unlock it.
    private bool _scrollLocked;
    private IJSObjectReference? _module;
    private DotNetObjectReference<Dialog>? _dotNetRef;
    private bool _focusActive;
    // Overlay close only counts when the press ALSO started on the scrim: a
    // text selection dragged out of an input and released over the scrim
    // still fires click on the overlay (review M-4).
    private bool _pointerDownOnOverlay;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (IsOpen && !_wasOpen)
        {
            _module ??= await JsRuntime.InvokeAsync<IJSObjectReference>("import", "./js/dialog.js");
            await _module.InvokeVoidAsync("lockScroll");
            _scrollLocked = true;
            _dotNetRef ??= DotNetObjectReference.Create(this);
            await _module.InvokeVoidAsync("activate", _instanceId, _dialogElement, _dotNetRef, InitialFocusSelector);
            _focusActive = true;
        }
        else if (!IsOpen && _wasOpen)
        {
            await ReleaseFocusAsync();
            await UnlockScrollAsync();
        }
        _wasOpen = IsOpen;
    }

    private void HandleOverlayPointerDown() => _pointerDownOnOverlay = true;

    private void HandleCardPointerDown() => _pointerDownOnOverlay = false;

    private Task HandleOverlayClickAsync()
    {
        var startedOnOverlay = _pointerDownOnOverlay;
        _pointerDownOnOverlay = false;
        return CloseOnOverlayClick && startedOnOverlay ? OnClose.InvokeAsync() : Task.CompletedTask;
    }

    private Task HandleKeyDownAsync(KeyboardEventArgs e) => e.Key == "Escape" && CloseOnEscape ? OnClose.InvokeAsync() : Task.CompletedTask;

    // Called by dialog.js when Escape is pressed while focus is outside the
    // card (see its onKeyDown) -- same rules as a keydown on the card.
    [JSInvokable]
    public Task OnEscapeFromOutside() => CloseOnEscape ? OnClose.InvokeAsync() : Task.CompletedTask;

    // For consumers whose content changes while open (a multi-step dialog):
    // the element that had focus may have just been removed.
    public async Task FocusFirstAsync()
    {
        if (_module is not null && IsOpen)
        {
            await _module.InvokeVoidAsync("focusFirst", _dialogElement);
        }
    }

    private async Task ReleaseFocusAsync()
    {
        if (_module is not null && _focusActive)
        {
            _focusActive = false;
            await _module.InvokeVoidAsync("deactivate", _instanceId);
        }
    }

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
        await ReleaseFocusAsync();
        await UnlockScrollAsync();
        _dotNetRef?.Dispose();
        if (_module is not null)
        {
            await _module.DisposeAsync();
        }
    }
}
