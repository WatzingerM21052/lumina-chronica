using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class WorldBackdropTests : BunitContext
{
    [Fact]
    public void WorldBackdrop_WithPicture_PaintsItAsBackground()
    {
        var cut = Render<WorldBackdrop>(p => p.Add(x => x.Kind, "book").Add(x => x.ImageUrl, "blob:https://example.test/abc"));

        var image = cut.Find(".world-backdrop-image");
        Assert.Equal("background-image: url('blob:https://example.test/abc')", image.GetAttribute("style"));
        Assert.DoesNotContain("world-backdrop-image--texture", image.ClassList);
        Assert.Equal("true", cut.Find(".world-backdrop").GetAttribute("aria-hidden"));
    }

    [Fact]
    public void WorldBackdrop_WithoutPicture_FallsBackToTheThemeTexture()
    {
        var cut = Render<WorldBackdrop>(p => p.Add(x => x.Kind, "lore"));

        var image = cut.Find(".world-backdrop-image");
        Assert.Null(image.GetAttribute("style"));
        Assert.Contains("world-backdrop-image--texture", image.ClassList);
    }

    // The URL goes into inline CSS: anything that could close url('...')
    // is refused rather than escaped.
    [Theory]
    [InlineData("blob:x') ; background: red")]
    [InlineData("https://e.test/a\"b")]
    public void WorldBackdrop_RefusesUrlsThatCouldBreakOutOfCss(string url)
    {
        var cut = Render<WorldBackdrop>(p => p.Add(x => x.Kind, "book").Add(x => x.ImageUrl, url));

        Assert.Null(cut.Find(".world-backdrop-image").GetAttribute("style"));
    }
}
