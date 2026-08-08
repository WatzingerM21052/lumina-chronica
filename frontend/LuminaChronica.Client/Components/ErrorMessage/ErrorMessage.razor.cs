using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Shared error-state presentation for action failures with no other
// recovery path (issue #349 Phase B, section 24: "ruhig, handlungsorientiert
// (Text + 'Erneut versuchen')") -- distinct from a page's own inline
// per-field validation errors (still plain <p class="form-error">, those
// are a different concern with no retry semantics). Targets the gap where
// a page currently shows a static error message and dead-ends, e.g.
// BookDetail's initial-load failure previously had no way to recover
// short of a manual browser refresh.
public partial class ErrorMessage : ComponentBase
{
    [Parameter, EditorRequired]
    public string Message { get; set; } = string.Empty;

    [Parameter]
    public string RetryText { get; set; } = "Erneut versuchen";

    /// <summary>No delegate -- renders the message alone, no button (e.g. an error the user can't retry, only navigate away from).</summary>
    [Parameter]
    public EventCallback OnRetry { get; set; }
}
