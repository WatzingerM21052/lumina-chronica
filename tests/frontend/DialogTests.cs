using System.Threading.Tasks;
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// Components/Dialog -- the shared overlay/card primitive (design doc
// docs/superpowers/specs/2026-09-27-password-reset-modernization-design.md
// §6.1/§8 item 12). ConfirmDialog/AvatarUploadDialog/FollowListDialog are
// NOT migrated onto this yet (deliberately -- Phase 4), so this is the
// first dedicated test file for a dialog-shaped component in this repo.
public class DialogTests : BunitContext
{
    public DialogTests()
    {
        Services.AddSingleton<II18nService, FakeI18nService>();
        // Loose: every test here opens the dialog, which triggers the
        // scroll-lock module import + FocusAsync in OnAfterRenderAsync --
        // none of these tests are about that interop itself, so there's no
        // value in configuring bUnit's JSInterop to expect it individually.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void Dialog_RendersNothingWhenClosed()
    {
        var cut = Render<Dialog>(parameters => parameters.Add(p => p.IsOpen, false));

        Assert.Empty(cut.Markup.Trim());
    }

    [Fact]
    public void Dialog_RendersWhenOpen()
    {
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.ChildContent, "<p>Body content</p>"));

        Assert.NotNull(cut.Find(".dialog"));
        Assert.Contains("Body content", cut.Markup);
    }

    [Fact]
    public void Dialog_SetsAriaModalAndAriaLabelledByPointingAtTheRenderedTitle()
    {
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.Title, "Test Title"));

        var dialog = cut.Find(".dialog");
        Assert.Equal("true", dialog.GetAttribute("aria-modal"));

        var labelledBy = dialog.GetAttribute("aria-labelledby");
        Assert.False(string.IsNullOrEmpty(labelledBy));
        Assert.Equal("Test Title", cut.Find($"#{labelledBy}").TextContent);
    }

    [Fact]
    public void Dialog_Escape_ClosesByDefault()
    {
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.OnClose, () => closed = true));

        cut.Find(".dialog").KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.True(closed);
    }

    [Fact]
    public void Dialog_Escape_DoesNotCloseWhenCloseOnEscapeIsFalse()
    {
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.CloseOnEscape, false)
            .Add(p => p.OnClose, () => closed = true));

        cut.Find(".dialog").KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.False(closed);
    }

    [Fact]
    public void Dialog_OverlayClick_ClosesByDefault()
    {
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.OnClose, () => closed = true));

        cut.Find(".dialog-overlay").MouseDown();
        cut.Find(".dialog-overlay").Click();

        Assert.True(closed);
    }

    [Fact]
    public void Dialog_OverlayClick_DoesNotCloseWhenCloseOnOverlayClickIsFalse()
    {
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.CloseOnOverlayClick, false)
            .Add(p => p.OnClose, () => closed = true));

        cut.Find(".dialog-overlay").MouseDown();
        cut.Find(".dialog-overlay").Click();

        Assert.False(closed);
    }

    [Fact]
    public void Dialog_ClickingInsideTheCard_NeverBubblesToTheOverlaysCloseHandler()
    {
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.OnClose, () => closed = true));

        // First prove the overlay's onclick handler is actually live (same
        // assertion as Dialog_OverlayClick_ClosesByDefault) -- this test
        // reuses that same instance so the throw below can only mean
        // stopPropagation blocked a real, reachable handler, not that the
        // handler was missing/renamed for some unrelated reason.
        cut.Find(".dialog-overlay").MouseDown();
        cut.Find(".dialog-overlay").Click();
        Assert.True(closed);
        closed = false;

        // .dialog's onclick:stoppropagation halts bubbling before it ever
        // reaches that same handler -- bUnit models that exactly like a
        // real browser would: the dispatch finds no reachable handler
        // along the (truncated) path and throws, rather than silently
        // reaching the overlay. That throw is itself the proof
        // stopPropagation is doing its job.
        Assert.Throws<MissingEventHandlerException>(() => cut.Find(".dialog").Click());
        Assert.False(closed);
    }

    [Fact]
    public void Dialog_FooterSlot_RendersWhenProvided()
    {
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.Footer, "<button>Speichern</button>"));

        var actions = cut.Find(".dialog-actions");
        Assert.Contains("Speichern", actions.TextContent);
    }

    [Fact]
    public async Task Dialog_DisposedWhileStillOpen_StillUnlocksScroll()
    {
        // Regression test: DisposeAsync used to gate the unlock on _wasOpen,
        // which is only set at the end of a completed OnAfterRenderAsync --
        // a dispose racing that (e.g. a navigation fired from inside the
        // dialog body, before the next render lands) left <html> stuck at
        // overflow:hidden forever, with no dialog left on screen to unlock
        // it. Track the lock counts directly rather than trusting render
        // state as a proxy for it.
        var cut = Render<Dialog>(parameters => parameters.Add(p => p.IsOpen, true));
        Assert.Single(JSInterop.Invocations["lockScroll"]);

        await cut.InvokeAsync(() => cut.Instance.DisposeAsync());

        Assert.Single(JSInterop.Invocations["unlockScroll"]);
    }

    [Fact]
    public void Dialog_ReRenderedWhileOpen_ThenClosed_LocksAndUnlocksExactlyOnce()
    {
        // User report: after closing the follower list the page stayed
        // unscrollable. FollowListDialog re-renders right after opening
        // (its list arrives); a second OnAfterRenderAsync pass before the
        // first had finished used to lock the page again, and the close
        // released only one lock. Locks and unlocks must always pair up.
        var cut = Render<Dialog>(parameters => parameters.Add(p => p.IsOpen, true).Add(p => p.Title, "Follower"));
        cut.Render(parameters => parameters.Add(p => p.Title, "Follower (2)"));
        cut.Render(parameters => parameters.Add(p => p.Title, "Follower (3)"));

        cut.Render(parameters => parameters.Add(p => p.IsOpen, false));

        Assert.Single(JSInterop.Invocations["lockScroll"]);
        Assert.Single(JSInterop.Invocations["unlockScroll"]);
    }

    [Fact]
    public void Dialog_NoFooterSlot_RendersNoActionsContainer()
    {
        var cut = Render<Dialog>(parameters => parameters.Add(p => p.IsOpen, true));

        Assert.Empty(cut.FindAll(".dialog-actions"));
    }

    [Fact]
    public void Dialog_DragFromInsideTheCardReleasedOnTheScrim_DoesNotClose()
    {
        // Review M-4: selecting text in an input and releasing the mouse over
        // the scrim fires a click on the overlay (the common ancestor of the
        // mousedown and mouseup targets) -- that used to close form dialogs
        // and drop what was typed.
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.OnClose, () => closed = true));

        cut.Find(".dialog").MouseDown();
        cut.Find(".dialog-overlay").Click();

        Assert.False(closed);
    }

    [Fact]
    public void Dialog_OnOpen_ActivatesFocusManagement_AndOnClose_ReleasesIt()
    {
        // activate: remember the opener, move focus into the dialog, trap
        // Tab and catch Escape even after the focused element was removed
        // (review M-3). deactivate: hand focus back to the opener.
        var cut = Render<Dialog>(parameters => parameters.Add(p => p.IsOpen, true));
        Assert.Single(JSInterop.Invocations["activate"]);

        cut.Render(parameters => parameters.Add(p => p.IsOpen, false));
        Assert.Single(JSInterop.Invocations["deactivate"]);
    }

    [Fact]
    public void Dialog_PassesTheInitialFocusSelectorToActivate()
    {
        Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.InitialFocusSelector, ".my-cancel"));

        var invocation = Assert.Single(JSInterop.Invocations["activate"]);
        Assert.Contains(".my-cancel", invocation.Arguments);
    }

    [Fact]
    public void Dialog_WithoutTitle_UsesAriaLabelledByWhenGiven()
    {
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.AriaLabelledBy, "some-message-id"));

        Assert.Equal("some-message-id", cut.Find(".dialog").GetAttribute("aria-labelledby"));
    }

    [Fact]
    public async Task Dialog_EscapeReportedFromJs_ClosesLikeAKeyDown()
    {
        // dialog.js calls this when Escape is pressed while focus has fallen
        // out of the card (e.g. to <body> after the focused button was
        // removed by a step change) -- @onkeydown on the card never sees it.
        var closed = false;
        var cut = Render<Dialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.OnClose, () => closed = true));

        await cut.InvokeAsync(() => cut.Instance.OnEscapeFromOutside());

        Assert.True(closed);
    }

    [Fact]
    public void ConfirmDialog_IsNamedByItsMessage_AndFocusesCancelFirst()
    {
        // Review N-1: role=alertdialog without a name was announced only as
        // "alert dialog". The message itself is the name; initial focus on
        // the non-destructive button per WAI-APG.
        var cut = Render<ConfirmDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.Message, "Regal wirklich löschen?"));

        var labelledBy = cut.Find(".dialog").GetAttribute("aria-labelledby");
        Assert.False(string.IsNullOrEmpty(labelledBy));
        Assert.Equal("Regal wirklich löschen?", cut.Find($"#{labelledBy}").TextContent);

        var invocation = Assert.Single(JSInterop.Invocations["activate"]);
        Assert.Contains(".confirm-dialog-cancel", invocation.Arguments);
        Assert.NotNull(cut.Find("button.confirm-dialog-cancel"));
    }

    [Fact]
    public void ConfirmDialog_IsDestructiveByDefault_WithCancelFirstAndTheRedActionLast()
    {
        // §7.3 color discipline: every current ConfirmDialog confirms a delete
        // or a discard, so the confirm button is --color-error (btn-danger),
        // never the brass primary; the one action sits rightmost, after Abbrechen.
        var cut = Render<ConfirmDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.Message, "Regal wirklich löschen?"));

        var buttons = cut.FindAll(".dialog-actions button");
        Assert.Equal(2, buttons.Count);
        Assert.Contains("confirm-dialog-cancel", buttons[0].ClassList);
        Assert.Contains("btn-danger", buttons[1].ClassList);
        Assert.Empty(cut.FindAll(".dialog-actions .btn-primary"));
    }

    [Fact]
    public void ConfirmDialog_NonDestructive_UsesThePrimaryButton()
    {
        var cut = Render<ConfirmDialog>(parameters => parameters
            .Add(p => p.IsOpen, true)
            .Add(p => p.Message, "Weiter?")
            .Add(p => p.Destructive, false));

        Assert.Single(cut.FindAll(".dialog-actions .btn-primary"));
        Assert.Empty(cut.FindAll(".dialog-actions .btn-danger"));
    }
}
