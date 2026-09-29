using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

// User report: in Phil. 2 the drop cap was the "I" of the section heading
// "Imitating Christ's Humility" instead of the "T" of "Therefore".
public class BibleDropCapTests
{
    private const string Philippians2 =
        "<p class=\"s1\">Imitating Christ’s Humility</p>" +
        "<p class=\"p\"><span data-number=\"1\" data-sid=\"PHP 2:1\" class=\"v\">1</span>Therefore if you have any encouragement, " +
        "<span data-number=\"2\" data-sid=\"PHP 2:2\" class=\"v\">2</span>then make my joy complete.</p>";

    [Fact]
    public void SkipsTheSectionHeading_AndMarksTheFirstLetterOfTheText()
    {
        var html = BibleDropCap.Apply(Philippians2);

        Assert.Contains("<p class=\"s1\">Imitating", html);
        Assert.Contains("<span class=\"bible-drop-cap\">T</span>herefore", html);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(html, "bible-drop-cap"));
    }

    [Fact]
    public void Verse1Number_StaysAsItIs()
    {
        var html = BibleDropCap.Apply(Philippians2);

        // User feedback: verse 1's number must stay visible.
        Assert.Contains("data-sid=\"PHP 2:1\" class=\"v\">1</span><span class=\"bible-drop-cap\">T</span>", html);
    }

    [Fact]
    public void ChapterWithoutHeading_MarksTheFirstParagraph()
    {
        var html = BibleDropCap.Apply("<p class=\"p\"><span class=\"v\">1</span>In the beginning God created.</p>");

        Assert.Contains("<span class=\"bible-drop-cap\">I</span>n the beginning", html);
    }

    [Fact]
    public void LeadingQuoteOrEntity_IsSkipped()
    {
        var html = BibleDropCap.Apply("<p class=\"q1\"><span class=\"v\">1</span>&#8220;“Blessed is the one.</p>");

        Assert.Contains("<span class=\"bible-drop-cap\">B</span>lessed", html);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("<p class=\"s1\">Only a heading</p>")]
    public void NothingToMark_ReturnsTheInputUnchanged(string? input)
    {
        Assert.Equal(input ?? string.Empty, BibleDropCap.Apply(input));
    }
}
