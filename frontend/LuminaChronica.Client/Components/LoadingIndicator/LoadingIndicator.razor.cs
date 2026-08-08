using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Modes control size/layout only (issue #349 Phase B). "Section" is the
// pre-existing look (3rem ring + text below, used to replace a page's main
// content while it loads) and is the default so all ~21 existing
// `<LoadingIndicator Text="..."/>` call sites keep rendering unchanged.
public enum LoadingIndicatorMode
{
    Inline,
    Button,
    Section,
    Page,
    Fullscreen,
}

// Semantic hint for what's loading (library/search/reading/writing/map/
// upload/save/ai/processing per the issue's spec). Deliberately inert for
// now -- every type renders the same animated ring until Phase E wires up
// real mascot assets per type. Exposed as a data attribute so that future
// work can target it in CSS/JS without another pass over every call site.
public enum LoadingIndicatorType
{
    Library,
    Search,
    Reading,
    Writing,
    Map,
    Upload,
    Save,
    Ai,
    Processing,
}

public partial class LoadingIndicator : ComponentBase
{
    [Parameter]
    public string? Text { get; set; }

    [Parameter]
    public LoadingIndicatorMode Mode { get; set; } = LoadingIndicatorMode.Section;

    [Parameter]
    public LoadingIndicatorType Type { get; set; } = LoadingIndicatorType.Library;

    private string ModeClass => Mode switch
    {
        LoadingIndicatorMode.Inline => "loading-indicator-inline",
        LoadingIndicatorMode.Button => "loading-indicator-button",
        LoadingIndicatorMode.Page => "loading-indicator-page",
        LoadingIndicatorMode.Fullscreen => "loading-indicator-fullscreen",
        _ => "loading-indicator-section",
    };

    private string TypeAttribute => Type.ToString().ToLowerInvariant();
}
