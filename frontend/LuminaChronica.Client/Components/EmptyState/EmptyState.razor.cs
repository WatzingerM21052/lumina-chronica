using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Per Teil 5 §70: empty states should be helpful, not just "nothing here" —
// e.g. "Deine Bibliothek ist noch leer. Füge dein erstes Buch hinzu und
// beginne deine Sammlung. [ Buch hinzufügen ]" rather than a bare "No books".
public partial class EmptyState : ComponentBase
{
    [Parameter, EditorRequired]
    public string Message { get; set; } = string.Empty;

    [Parameter]
    public string? ActionText { get; set; }

    [Parameter]
    public EventCallback OnAction { get; set; }
}
