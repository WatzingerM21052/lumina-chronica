using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class AsyncButtonTests : BunitContext
{
    [Fact]
    public async Task RunAsync_FastSuccess_SkipsLoading_ShowsSuccessThenIdle()
    {
        // Finishes well under the 180ms show-loading threshold -- should
        // never observe Loading (issue #349 Phase B section 46/47: no flash
        // on a fast request).
        var states = new List<ButtonBusyState>();

        // Task.FromResult, not a short real Task.Delay -- a real timer
        // delay (even 10ms) can occasionally exceed the 180ms threshold
        // under thread-pool contention when the full suite runs in
        // parallel, making this test flaky for no reason relevant to what
        // it's actually checking (the race logic, not real elapsed time).
        await AsyncButtonRunner.RunAsync(
            () => Task.FromResult(true),
            state => states.Add(state));

        Assert.DoesNotContain(ButtonBusyState.Loading, states);
        Assert.Equal(ButtonBusyState.Success, states[0]);
        Assert.Equal(ButtonBusyState.Idle, states[^1]);
    }

    [Fact]
    public async Task RunAsync_SlowSuccess_ShowsLoadingThenSuccessThenIdle()
    {
        var states = new List<ButtonBusyState>();

        await AsyncButtonRunner.RunAsync(
            async () => { await Task.Delay(300); return true; },
            state => states.Add(state));

        Assert.Equal([ButtonBusyState.Loading, ButtonBusyState.Success, ButtonBusyState.Idle], states);
    }

    [Fact]
    public async Task RunAsync_Failure_NeverShowsSuccess_EndsIdle()
    {
        var states = new List<ButtonBusyState>();

        await AsyncButtonRunner.RunAsync(
            () => Task.FromResult(false),
            state => states.Add(state));

        Assert.DoesNotContain(ButtonBusyState.Success, states);
        Assert.Equal(ButtonBusyState.Idle, states[^1]);
    }

    [Theory]
    [InlineData("Speichern", null, "Gespeichert", 17)] // "Gespeichert" (11 chars) is widest
    [InlineData("Teilen", null, "OK", 13)] // "Teilen…" (7 chars) is widest
    public void MinWidthCh_ReservesSpaceForWidestVariant(string idle, string? loading, string success, int expected)
    {
        Assert.Equal(expected, AsyncButtonContent.MinWidthCh(idle, loading, success));
    }

    [Fact]
    public void AsyncButtonContent_Idle_RendersOnlyIdleText()
    {
        var cut = Render<AsyncButtonContent>(parameters => parameters
            .Add(p => p.State, ButtonBusyState.Idle)
            .Add(p => p.IdleText, "Speichern")
            .Add(p => p.SuccessText, "Gespeichert"));

        Assert.Equal("Speichern", cut.Markup.Trim());
    }

    [Fact]
    public void AsyncButtonContent_Loading_RendersSpinnerAndDefaultEllipsisText()
    {
        var cut = Render<AsyncButtonContent>(parameters => parameters
            .Add(p => p.State, ButtonBusyState.Loading)
            .Add(p => p.IdleText, "Speichern")
            .Add(p => p.SuccessText, "Gespeichert"));

        Assert.NotEmpty(cut.FindAll(".loading-indicator-button"));
        Assert.Contains("Speichern…", cut.Markup);
    }

    [Fact]
    public void AsyncButtonContent_Success_RendersCheckmarkAndSuccessTextOnce()
    {
        var cut = Render<AsyncButtonContent>(parameters => parameters
            .Add(p => p.State, ButtonBusyState.Success)
            .Add(p => p.IdleText, "Speichern")
            .Add(p => p.SuccessText, "Gespeichert"));

        Assert.NotEmpty(cut.FindAll(".async-button-check"));
        // Regression: an earlier version's caller passed "✓ Gespeichert" as
        // SuccessText, doubling up with this component's own checkmark span
        // ("✓✓ Gespeichert") -- assert the rendered text has exactly one.
        var checkCount = cut.Markup.Count(c => c == '✓');
        Assert.Equal(1, checkCount);
    }
}
