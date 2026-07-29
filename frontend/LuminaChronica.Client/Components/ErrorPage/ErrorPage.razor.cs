using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace LuminaChronica.Client.Components;

// Wraps content in an ErrorBoundary with a friendly fallback message, per
// Teil 5 §71: not "ERROR 500" but e.g. "Dein Buch konnte gerade nicht
// geladen werden. Bitte versuche es erneut."
public partial class ErrorPage : ComponentBase
{
    private ErrorBoundary? _errorBoundary;

    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter]
    public string Message { get; set; } = "Etwas ist schiefgelaufen. Bitte versuche es erneut.";

    private void Reset() => _errorBoundary?.Recover();
}
