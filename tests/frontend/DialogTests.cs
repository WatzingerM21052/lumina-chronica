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
    public void Dialog_NoFooterSlot_RendersNoActionsContainer()
    {
        var cut = Render<Dialog>(parameters => parameters.Add(p => p.IsOpen, true));

        Assert.Empty(cut.FindAll(".dialog-actions"));
    }
}
