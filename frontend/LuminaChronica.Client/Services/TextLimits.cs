namespace LuminaChronica.Client.Services;

// Client-side mirror of backend/src/utils/textLimits.ts: the maxlength of
// every free-text field, so the browser stops input at the same point the
// backend would reject it (both count UTF-16 code units, so they agree for
// umlauts, emoji and every other script). The backend stays the
// authority; change both together.
public static class TextLimits
{
    public const int Title = 300;
    public const int ShortText = 200;
    public const int Code = 64;
    public const int Description = 10_000;
    public const int LongText = 50_000;
    public const int LoreContent = 200_000;
    public const int Comment = 2_000;
    public const int BookmarkNote = 2_000;
    public const int Tag = 50;
    public const int TagCount = 30;

    // The tags field is one comma-separated input: room for the maximum
    // number of maximum-length tags plus ", " between them.
    public const int TagsInput = TagCount * (Tag + 2);
}
