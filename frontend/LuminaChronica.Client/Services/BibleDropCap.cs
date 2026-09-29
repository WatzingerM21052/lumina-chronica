using System.Text.RegularExpressions;

namespace LuminaChronica.Client.Services;

// Marks the chapter's drop cap in the API.Bible HTML. CSS alone can't find
// it: the first <p> is often a section heading (class "s1", e.g. "Imitating
// Christ's Humility"), and the first text paragraph starts with the verse
// number (<span class="v">1</span>), so p:first-of-type::first-letter
// enlarged the heading's first letter (and would otherwise hit the "1").
// This wraps the first letter of the first text paragraph -- after its
// verse number, which stays as it is -- in <span class="bible-drop-cap">.
public static partial class BibleDropCap
{
    // USFM paragraph styles that are headings/titles, not running text.
    private static readonly HashSet<string> HeadingClasses =
        ["s", "s1", "s2", "s3", "s4", "ms", "ms1", "ms2", "mr", "r", "sr", "d", "cl", "cp", "sp", "qa", "mt", "mt1", "mt2"];

    [GeneratedRegex("<p(?<attrs>[^>]*)>", RegexOptions.IgnoreCase)]
    private static partial Regex ParagraphOpen();

    [GeneratedRegex("class\\s*=\\s*\"(?<cls>[^\"]*)\"", RegexOptions.IgnoreCase)]
    private static partial Regex ClassAttr();

    public static string Apply(string? html)
    {
        if (string.IsNullOrEmpty(html)) return html ?? string.Empty;

        foreach (Match p in ParagraphOpen().Matches(html))
        {
            var classMatch = ClassAttr().Match(p.Groups["attrs"].Value);
            var classes = classMatch.Success ? classMatch.Groups["cls"].Value.Split(' ', StringSplitOptions.RemoveEmptyEntries) : [];
            if (classes.Any(HeadingClasses.Contains)) continue;

            var start = p.Index + p.Length;
            var end = html.IndexOf("</p>", start, StringComparison.OrdinalIgnoreCase);
            if (end < 0) end = html.Length;

            var letter = FirstTextLetter(html, start, end);
            if (letter < 0) continue;

            return html[..letter] + "<span class=\"bible-drop-cap\">" + html[letter] + "</span>" + html[(letter + 1)..];
        }
        return html;
    }

    // Index of the first letter of the paragraph's own text, skipping tags,
    // the verse-number span's content and leading punctuation/quotes.
    private static int FirstTextLetter(string html, int start, int end)
    {
        var i = start;
        while (i < end)
        {
            if (html[i] == '<')
            {
                var close = html.IndexOf('>', i);
                if (close < 0) return -1;
                var tag = html.Substring(i, close - i + 1);
                // Skip a verse number span with its content.
                if (tag.StartsWith("<span", StringComparison.OrdinalIgnoreCase) && ClassAttr().Match(tag) is { Success: true } m
                    && m.Groups["cls"].Value.Split(' ').Contains("v"))
                {
                    var spanEnd = html.IndexOf("</span>", close, StringComparison.OrdinalIgnoreCase);
                    if (spanEnd < 0) return -1;
                    i = spanEnd + "</span>".Length;
                    continue;
                }
                i = close + 1;
                continue;
            }
            if (html[i] == '&')
            {
                var semi = html.IndexOf(';', i);
                i = semi < 0 ? i + 1 : semi + 1;
                continue;
            }
            if (char.IsLetter(html[i])) return i;
            i++;
        }
        return -1;
    }
}
