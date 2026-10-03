using Markdig;

namespace LuminaChronica.Client.Components;

// Short plain-text previews for the project cards: a lore entry's Markdown
// shows as text (no "##" or "*"), and every preview is capped so a very
// long field can't make a card endless -- the card clamps the lines, this
// keeps the DOM small too.
public static class TextExcerpt
{
    // HTML in a user's Markdown stays text, never markup (same as lore).
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder().DisableHtml().Build();

    public const int DefaultLength = 220;

    public static string? Of(string? text, int maxLength = DefaultLength)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var flat = string.Join(' ', text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return flat.Length <= maxLength ? flat : flat[..maxLength].TrimEnd() + "…";
    }

    public static string? FromMarkdown(string? markdown, int maxLength = DefaultLength) =>
        string.IsNullOrWhiteSpace(markdown) ? null : Of(Markdown.ToPlainText(markdown, Pipeline), maxLength);

    // "41 · Wrenmoor Akademie" -- only the parts that are filled in.
    public static string? Join(params string?[] parts)
    {
        var filled = parts.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p!.Trim()).ToList();
        return filled.Count == 0 ? null : string.Join(" · ", filled);
    }
}
