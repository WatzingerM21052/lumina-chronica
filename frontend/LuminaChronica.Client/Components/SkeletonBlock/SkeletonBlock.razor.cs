using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Generic shimmering placeholder shape (issue #349 Phase B) -- wraps the
// existing global .skeleton-shape/@keyframes skeleton-shimmer utility
// (app.css) so pages stop hand-rolling their own div+class per skeleton
// shape (see SkeletonCatalogCard for the composed card version).
public partial class SkeletonBlock : ComponentBase
{
    [Parameter]
    public string Width { get; set; } = "100%";

    [Parameter]
    public string Height { get; set; } = "1rem";

    [Parameter]
    public bool Circle { get; set; }

    [Parameter]
    public string? Class { get; set; }

    private string StyleAttribute => $"width:{Width};height:{Height};{(Circle ? "border-radius:50%;" : string.Empty)}";
}
