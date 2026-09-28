using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class CardInitialsTests
{
    [Theory]
    [InlineData("Elarion", "E")]
    [InlineData("Das Silbertal", "DS")]
    [InlineData("die kartografin der nebelinseln", "DK")]
    [InlineData("  Ätherfall  ", "Ä")]
    [InlineData("«Veyra» Nord", "VN")]
    [InlineData("中文 名字", "中名")]
    [InlineData("", "?")]
    [InlineData(null, "?")]
    [InlineData("— —", "?")]
    public void Of_TakesTheFirstLetterOfUpToTwoWords(string? name, string expected)
    {
        Assert.Equal(expected, CardInitials.Of(name));
    }
}
