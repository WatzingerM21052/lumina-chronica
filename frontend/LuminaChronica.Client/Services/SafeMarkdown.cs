using System.Text.RegularExpressions;
using Markdig;
using Markdig.Extensions.AutoIdentifiers;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace LuminaChronica.Client.Services;

// Every place that turns a user's Markdown into HTML goes through here.
// DisableHtml alone kept raw tags as text, but a link like
// [x](javascript:...) still became a real href and ran on click -- in a
// public lore entry, a shared MD book or a project file that runs in the
// reader's session (the token lives in localStorage). Links and images may
// only point to http(s), mailto or a relative target; anything else is
// rendered as its plain text.
public static partial class SafeMarkdown
{
    // HTML in a user's Markdown stays text, never markup.
    public static readonly MarkdownPipeline Default = new MarkdownPipelineBuilder().DisableHtml().Build();

    // Book reader: headings get ids so a hand-written table of contents
    // has targets. GitHub's slug rule on purpose: Markdig's default collapses
    // "Kapitel 1 – Der..." to kapitel-1-der-..., but a TOC written against
    // GitHub's preview expects kapitel-1--der-... (checked against a real
    // reported file).
    public static readonly MarkdownPipeline WithHeadingIds =
        new MarkdownPipelineBuilder().DisableHtml().UseAutoIdentifiers(AutoIdentifierOptions.GitHub).Build();

    public static string ToHtml(string markdown, MarkdownPipeline? pipeline = null)
    {
        pipeline ??= Default;
        var document = Markdown.Parse(markdown, pipeline);
        // Collected first: replacing nodes while walking the tree would cut
        // the walk short.
        var unsafeLinks = document.Descendants<LinkInline>().Where(l => !IsSafeUrl(l.Url)).ToList();
        var unsafeAutolinks = document.Descendants<AutolinkInline>().Where(a => !a.IsEmail && !IsSafeUrl(a.Url)).ToList();
        // Plain text, not href="#": with <base href="/"> a "#" link would
        // navigate to the home page.
        foreach (var link in unsafeLinks)
        {
            link.ReplaceBy(new LiteralInline(string.Concat(link.Descendants<LiteralInline>().Select(l => l.Content.ToString()))), copyChildren: false);
        }
        foreach (var autolink in unsafeAutolinks)
        {
            autolink.ReplaceBy(new LiteralInline(autolink.Url), copyChildren: false);
        }
        return document.ToHtml(pipeline);
    }

    public static bool IsSafeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return true;
        // Browsers ignore control characters and whitespace inside a scheme
        // ("java\tscript:"), so they must not hide one from this check.
        var compact = NoiseChars().Replace(url, "");
        var scheme = SchemePrefix().Match(compact);
        if (!scheme.Success) return true; // relative path, #anchor, //host
        var name = scheme.Groups[1].Value.ToLowerInvariant();
        return name is "http" or "https" or "mailto";
    }

    [GeneratedRegex(@"[\s\x00-\x1f\x7f]+")]
    private static partial Regex NoiseChars();

    [GeneratedRegex(@"^([A-Za-z][A-Za-z0-9+.\-]*):")]
    private static partial Regex SchemePrefix();
}
