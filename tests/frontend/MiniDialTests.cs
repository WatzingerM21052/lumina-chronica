using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class MiniDialTests : BunitContext
{
    [Fact]
    public void MiniDial_RendersValueAndPercentageCustomProperty()
    {
        var cut = Render<MiniDial>(parameters => parameters
            .Add(p => p.Value, 5)
            .Add(p => p.Percentage, 62.5));

        var root = cut.Find("div.mini-dial");
        Assert.Contains("--mini-dial-pct: 63", root.GetAttribute("style"));
        Assert.Equal("5", root.QuerySelector(".mini-dial-inner")!.TextContent);
    }

    [Fact]
    public void MiniDial_RoundsPercentageToNearestWholeNumber()
    {
        var cut = Render<MiniDial>(parameters => parameters
            .Add(p => p.Value, 1)
            .Add(p => p.Percentage, 33.3));

        var root = cut.Find("div.mini-dial");
        Assert.Contains("--mini-dial-pct: 33", root.GetAttribute("style"));
    }
}
