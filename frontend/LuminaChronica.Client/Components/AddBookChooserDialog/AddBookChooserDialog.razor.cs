using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// The "polished first impression" entry point named in the password-reset
// modernization design doc's §6.3 (D13) -- three labeled options instead of
// dropping the user straight onto BookUpload's 685-line combined form. All
// three navigate to the same /library/upload, which already handles file
// upload, ISBN lookup, and manual entry together in one page: the doc's
// original "routes onward to three destinations" framing assumed separate
// pages that don't exist in this codebase, so this is a labeled entry, not
// a router (see the design doc's corresponding CORRECTED note).
public partial class AddBookChooserDialog : ComponentBase
{
    [Parameter, EditorRequired]
    public bool IsOpen { get; set; }

    [Parameter]
    public EventCallback OnClose { get; set; }

    private void GoToUpload()
    {
        NavigationManager.NavigateTo("library/upload");
    }
}
