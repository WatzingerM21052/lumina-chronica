using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ErrorMessageTests : BunitContext
{
    [Fact]
    public void ErrorMessage_RendersMessageAndAlertRole_NoButtonWithoutOnRetry()
    {
        var cut = Render<ErrorMessage>(parameters => parameters
            .Add(p => p.Message, "Buch konnte nicht geladen werden."));

        Assert.Equal("alert", cut.Find(".error-message").GetAttribute("role"));
        Assert.Contains("Buch konnte nicht geladen werden.", cut.Markup);
        Assert.Empty(cut.FindAll("button"));
    }

    [Fact]
    public void ErrorMessage_WithOnRetry_RendersButton_AndInvokesCallback()
    {
        var retried = false;
        var cut = Render<ErrorMessage>(parameters => parameters
            .Add(p => p.Message, "Fehler.")
            .Add(p => p.OnRetry, () => retried = true));

        cut.Find("button").Click();

        Assert.True(retried);
    }

    [Fact]
    public void ErrorMessage_DefaultRetryText_IsErneutVersuchen()
    {
        var cut = Render<ErrorMessage>(parameters => parameters
            .Add(p => p.Message, "Fehler.")
            .Add(p => p.OnRetry, () => { }));

        Assert.Equal("Erneut versuchen", cut.Find("button").TextContent.Trim());
    }
}
