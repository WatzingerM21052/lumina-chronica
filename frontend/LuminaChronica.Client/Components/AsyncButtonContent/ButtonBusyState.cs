namespace LuminaChronica.Client.Components;

// Button state model (issue #349 Phase B, section 14/17): a button's own
// transient feedback while an async action runs, layered on top of
// whatever persistent success/error messaging a page already shows (e.g.
// a form-level error paragraph) rather than replacing it.
public enum ButtonBusyState
{
    Idle,
    Loading,
    Success,
}
