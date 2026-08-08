using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class IconTests : BunitContext
{
    [Theory]
    [InlineData("bell")]
    [InlineData("person")]
    [InlineData("search")]
    [InlineData("exchange")]
    [InlineData("book")]
    [InlineData("project")]
    public void Icon_KnownName_RendersAnSvgWithContent(string name)
    {
        var cut = Render<Icon>(parameters => parameters.Add(p => p.Name, name));

        var svg = cut.Find("svg.icon");
        Assert.NotEmpty(svg.Children);
    }

    [Fact]
    public void Icon_IsHiddenFromScreenReaders()
    {
        // Decorative by default -- callers pair it with real visible text
        // (e.g. "Profil") or an aria-label on the wrapping control.
        var cut = Render<Icon>(parameters => parameters.Add(p => p.Name, "bell"));

        Assert.Equal("true", cut.Find("svg").GetAttribute("aria-hidden"));
    }

    [Fact]
    public void Icon_AppliesExtraClass()
    {
        var cut = Render<Icon>(parameters => parameters
            .Add(p => p.Name, "book")
            .Add(p => p.Class, "catalog-card-placeholder-icon"));

        Assert.Contains("catalog-card-placeholder-icon", cut.Find("svg").ClassList);
    }
}
