namespace LuminaChronica.Client.Components;

// Drives a button through Idle -> (Loading) -> (Success) -> Idle around an
// async action (issue #349 Phase B, section 46/47). A plain static helper,
// not a component: the caller keeps full control of its own <button>
// markup/type="submit" vs onclick wiring (EditForm's OnValidSubmit needs to
// stay in charge of validation, which a component owning its own @onclick
// would fight), this just supplies the timing.
public static class AsyncButtonRunner
{
    // Never show Loading if the action finishes within ~180ms -- avoids a
    // flash on a fast request. Once Success is shown, hold it a beat so
    // it's actually readable rather than instant.
    private static readonly TimeSpan ShowLoadingAfter = TimeSpan.FromMilliseconds(180);
    private static readonly TimeSpan HoldSuccessFor = TimeSpan.FromMilliseconds(1000);

    /// <param name="action">The real work. Must not throw -- return false on failure (matching this codebase's existing convention of catching internally and setting a page-level error message) rather than letting an exception escape.</param>
    /// <param name="setState">Applies the new state and re-renders (e.g. <c>state => { _saveState = state; StateHasChanged(); }</c>).</param>
    public static async Task RunAsync(Func<Task<bool>> action, Action<ButtonBusyState> setState)
    {
        var work = action();
        var delay = Task.Delay(ShowLoadingAfter);
        if (await Task.WhenAny(work, delay) != work)
        {
            setState(ButtonBusyState.Loading);
        }

        var success = await work;
        if (success)
        {
            setState(ButtonBusyState.Success);
            await Task.Delay(HoldSuccessFor);
        }

        setState(ButtonBusyState.Idle);
    }
}
