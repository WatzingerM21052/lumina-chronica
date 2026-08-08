using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Placeholder matching CatalogCard's shape (issue #349 Phase B) -- kept as
// its own small component rather than reusing CatalogCard's class names
// directly, since Blazor's per-component CSS-isolation scope attribute
// means a different component rendering the same class names would NOT
// pick up CatalogCard.razor.css's rules (the exact class of bug PR #313
// hit). The two aspect-ratio values are duplicated here deliberately --
// two numbers, not shared markup -- rather than reaching across the scope
// boundary.
public partial class SkeletonCatalogCard : ComponentBase
{
    /// <summary>"book" or "project" -- matches CatalogCard's own Kind values, controls cover aspect ratio.</summary>
    [Parameter, EditorRequired]
    public string Kind { get; set; } = "book";

    /// <summary>Projects show a type-tag line instead of a rating line under the title -- both are one extra text row, so this covers either case. Set false for a title-only card.</summary>
    [Parameter]
    public bool ShowSubtitle { get; set; } = true;
}
