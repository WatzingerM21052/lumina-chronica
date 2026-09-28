using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class DialogGuardTests
{
    [Fact]
    public void RequestClose_WithoutChanges_ClosesRightAway()
    {
        var guard = new DialogGuard();
        var closed = false;

        guard.RequestClose(isDirty: false, () => closed = true);

        Assert.True(closed);
        Assert.False(guard.IsConfirmingDiscard);
    }

    [Fact]
    public void RequestClose_WithChanges_WaitsForConfirmation()
    {
        var guard = new DialogGuard();
        var closed = false;

        guard.RequestClose(isDirty: true, () => closed = true);
        Assert.False(closed);
        Assert.True(guard.IsConfirmingDiscard);

        guard.ConfirmDiscard();
        Assert.True(closed);
        Assert.False(guard.IsConfirmingDiscard);
    }

    [Fact]
    public void CancelDiscard_KeepsTheDialogOpen()
    {
        var guard = new DialogGuard();
        var closed = false;

        guard.RequestClose(isDirty: true, () => closed = true);
        guard.CancelDiscard();
        guard.ConfirmDiscard();

        Assert.False(closed);
        Assert.False(guard.IsConfirmingDiscard);
    }

    [Fact]
    public async Task SubmitAsync_IgnoresASecondSubmitWhileTheFirstRuns()
    {
        var guard = new DialogGuard();
        var calls = 0;
        var release = new TaskCompletionSource();

        var first = guard.SubmitAsync(async () => { calls++; await release.Task; });
        Assert.True(guard.IsSubmitting);
        await guard.SubmitAsync(() => { calls++; return Task.CompletedTask; });

        release.SetResult();
        await first;

        Assert.Equal(1, calls);
        Assert.False(guard.IsSubmitting);
    }

    [Fact]
    public async Task SubmitAsync_ResetsAfterAFailure()
    {
        var guard = new DialogGuard();

        await Assert.ThrowsAsync<InvalidOperationException>(() => guard.SubmitAsync(() => throw new InvalidOperationException()));

        Assert.False(guard.IsSubmitting);
    }
}
