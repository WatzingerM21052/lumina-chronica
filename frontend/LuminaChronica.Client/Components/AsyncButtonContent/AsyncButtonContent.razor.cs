using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

// Renders a <button>'s inner content (icon + label) for the current
// ButtonBusyState -- the <button> element itself stays authored per-page
// (type="submit"/"button", disabled, class) so this never has to fight
// EditForm's own submit/validation wiring. See AsyncButtonRunner for the
// state machine driving it and MinWidthCh below for the layout-shift fix
// that goes with it.
public partial class AsyncButtonContent : ComponentBase
{
    [Parameter, EditorRequired]
    public ButtonBusyState State { get; set; }

    [Parameter, EditorRequired]
    public string IdleText { get; set; } = string.Empty;

    /// <summary>Defaults to "{IdleText}…" -- fine for verb-first German labels ("Speichern…"), override for anything that reads oddly with a trailing ellipsis.</summary>
    [Parameter]
    public string? LoadingText { get; set; }

    /// <summary>No default -- a past-participle form ("Gespeichert") can't be derived from the infinitive automatically, and guessing wrong reads worse than requiring it explicitly.</summary>
    [Parameter, EditorRequired]
    public string SuccessText { get; set; } = string.Empty;

    private string DisplayText => State switch
    {
        ButtonBusyState.Loading => LoadingText ?? $"{IdleText}…",
        ButtonBusyState.Success => SuccessText,
        _ => IdleText,
    };

    /// <summary>
    /// A `min-width` value (in `ch`) reserving space for the widest of the
    /// three label variants plus the loading spinner/checkmark icon, so a
    /// state change never shifts the button's own width (issue #349 Phase B,
    /// section 17's "kein Layout-Shift" requirement). Apply via the caller's
    /// own &lt;button style="min-width: @X.MinWidthCh()ch"&gt; -- not baked
    /// into this component's own markup, since it sizes the outer element
    /// this component doesn't own.
    /// </summary>
    public static int MinWidthCh(string idleText, string? loadingText, string successText)
    {
        var widest = new[] { idleText, loadingText ?? $"{idleText}…", successText }.Max(s => s.Length);
        // `ch` is defined by the "0" glyph's width, which is narrower than
        // this UI font's average character -- +3 measured short by ~1.6ch
        // in practice (live-checked: button grew 124px -> 137px on Success
        // despite a reserved min-width). +6 leaves real headroom for the
        // icon+gap and the font-metric slop rather than cutting it exactly.
        return widest + 6;
    }
}
