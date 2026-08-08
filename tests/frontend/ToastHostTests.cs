using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ToastHostTests : BunitContext
{
    [Fact]
    public void ToastHost_RendersNothing_BeforeAnyToastShown()
    {
        Services.AddSingleton<ToastService>();

        var cut = Render<ToastHost>();

        Assert.Empty(cut.FindAll(".toast"));
    }

    [Fact]
    public void ToastHost_RendersToast_WithKindClassAndText_WhenServiceShowsOne()
    {
        Services.AddSingleton<ToastService>();
        var toastService = Services.GetRequiredService<ToastService>();

        var cut = Render<ToastHost>();
        cut.InvokeAsync(() => toastService.Show("Buch gelöscht.", ToastKind.Success));

        var toast = cut.Find(".toast");
        Assert.Contains("toast-success", toast.ClassList);
        Assert.Contains("Buch gelöscht.", toast.TextContent);
    }

    [Fact]
    public void ToastHost_DefaultKind_RendersAsInfo()
    {
        Services.AddSingleton<ToastService>();
        var toastService = Services.GetRequiredService<ToastService>();

        var cut = Render<ToastHost>();
        cut.InvokeAsync(() => toastService.Show("Hinweis."));

        Assert.Contains("toast-info", cut.Find(".toast").ClassList);
    }

    [Fact]
    public void ToastHost_DismissButton_RemovesThatToast()
    {
        Services.AddSingleton<ToastService>();
        var toastService = Services.GetRequiredService<ToastService>();

        var cut = Render<ToastHost>();
        cut.InvokeAsync(() => toastService.Show("Wird entfernt."));

        cut.Find(".toast-dismiss").Click();

        Assert.Empty(cut.FindAll(".toast"));
    }

    [Fact]
    public void ToastHost_MultipleToasts_StackIndependently()
    {
        Services.AddSingleton<ToastService>();
        var toastService = Services.GetRequiredService<ToastService>();

        var cut = Render<ToastHost>();
        cut.InvokeAsync(() => toastService.Show("Erstes."));
        cut.InvokeAsync(() => toastService.Show("Zweites.", ToastKind.Error));

        var toasts = cut.FindAll(".toast");
        Assert.Equal(2, toasts.Count);
        cut.Find(".toast-dismiss").Click();
        Assert.Single(cut.FindAll(".toast"));
    }
}
