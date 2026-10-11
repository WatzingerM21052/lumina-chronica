using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

// A [x](javascript:...) link in a public lore entry ran in the visitor's
// session on click -- raw HTML was already disabled, link targets weren't.
public class SafeMarkdownTests
{
    [Theory]
    [InlineData("[x](javascript:alert(1))")]
    [InlineData("[x](JavaScript:alert(1))")]
    [InlineData("[x](java&#x09;script:alert(1))")]
    [InlineData("[x](javascript&#58;alert(1))")]
    [InlineData("[x](data:text/html;base64,PHNjcmlwdD4=)")]
    [InlineData("[x](vbscript:msgbox)")]
    [InlineData("<javascript:alert(1)>")]
    [InlineData("[x][r]\n\n[r]: javascript:alert(1)")]
    [InlineData("![x](javascript:alert(1))")]
    public void DangerousTargetsLoseTheirTarget(string markdown)
    {
        var html = SafeMarkdown.ToHtml(markdown);

        Assert.DoesNotContain("script:", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("data:", html, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("[x](https://example.com/a)", "href=\"https://example.com/a\"")]
    [InlineData("[x](http://example.com)", "href=\"http://example.com\"")]
    [InlineData("[x](mailto:a@example.com)", "href=\"mailto:a@example.com\"")]
    [InlineData("[x](#kapitel-1)", "href=\"#kapitel-1\"")]
    [InlineData("[x](kapitel/2)", "href=\"kapitel/2\"")]
    [InlineData("<https://example.com>", "href=\"https://example.com\"")]
    public void SafeTargetsStay(string markdown, string expected)
    {
        Assert.Contains(expected, SafeMarkdown.ToHtml(markdown));
    }

    [Fact]
    public void RawHtmlStaysText()
    {
        var html = SafeMarkdown.ToHtml("a <img src=x onerror=alert(1)> b");

        Assert.DoesNotContain("<img", html);
        Assert.Contains("&lt;img", html);
    }

    [Fact]
    public void ReaderPipelineKeepsGitHubHeadingIds()
    {
        var html = SafeMarkdown.ToHtml("# Kapitel 1 – Der Anfang", SafeMarkdown.WithHeadingIds);

        Assert.Contains("id=\"kapitel-1--der-anfang\"", html);
    }
}
