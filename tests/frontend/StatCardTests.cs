using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class StatCardTests : BunitContext
{
    [Fact]
    public void StatCard_RendersValueAndLabel_WithDashboardStatClasses()
    {
        var cut = Render<StatCard>(parameters => parameters
            .Add(p => p.Value, "4")
            .Add(p => p.Label, "Bücher"));

        var root = cut.Find("div.dashboard-stat");
        Assert.Equal("4", root.QuerySelector(".dashboard-stat-value")!.TextContent);
        Assert.Equal("Bücher", root.QuerySelector(".dashboard-stat-label")!.TextContent);
    }

    [Fact]
    public void StatCard_WithIconName_RendersIconBeforeValue()
    {
        var cut = Render<StatCard>(parameters => parameters
            .Add(p => p.Value, "4")
            .Add(p => p.Label, "Serie (Tage)")
            .Add(p => p.IconName, "flame"));

        var valueSpan = cut.Find(".dashboard-stat-value");
        Assert.NotNull(valueSpan.QuerySelector("svg.icon"));
        Assert.Equal("4", valueSpan.TextContent.Trim());
    }

    [Fact]
    public void StatCard_WithoutIconName_RendersNoIcon()
    {
        var cut = Render<StatCard>(parameters => parameters
            .Add(p => p.Value, "4")
            .Add(p => p.Label, "Bücher"));

        var valueSpan = cut.Find(".dashboard-stat-value");
        Assert.Null(valueSpan.QuerySelector("svg.icon"));
    }
}
