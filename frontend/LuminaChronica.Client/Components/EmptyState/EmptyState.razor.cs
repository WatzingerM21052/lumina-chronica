using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Per Teil 5 §70: empty states should be helpful, not just "nothing here" —
// e.g. "Deine Bibliothek ist noch leer. Füge dein erstes Buch hinzu und
// beginne deine Sammlung. [ Buch hinzufügen ]" rather than a bare "No books".
//
// Ornament (issue #349 Phase B, section 27/37/53/91: "kleine stilisierte
// Illustration/Ornament statt reinem 'No books.'-Text") unifies this
// component with the .empty-state-literary pattern that Discover.razor/
// PublicProfile.razor had each hand-rolled independently (❦ + italic
// reader-font message + dashed card) -- opt-in via the Ornament parameter
// rather than always-on, since several existing plain usages (Home,
// Library, NotFound, OfflineLibrary, Projects, Shelves, Statistics) haven't
// been reviewed for whether the literary treatment fits their context yet.
public partial class EmptyState : ComponentBase
{
    [Parameter, EditorRequired]
    public string Message { get; set; } = string.Empty;

    [Parameter]
    public string? ActionText { get; set; }

    [Parameter]
    public EventCallback OnAction { get; set; }

    /// <summary>Renders the action as a plain link instead of a button -- for a CTA that navigates rather than performs an in-place action (e.g. "Buch hinzufügen" → /library/upload). Takes precedence over OnAction when both are set.</summary>
    [Parameter]
    public string? ActionHref { get; set; }

    /// <summary>A single glyph (e.g. "❦") that switches on the literary card treatment (dashed gold border, paper card, italic reader-font message) instead of the plain default look.</summary>
    [Parameter]
    public string? Ornament { get; set; }
}
