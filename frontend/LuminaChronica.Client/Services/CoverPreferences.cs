namespace LuminaChronica.Client.Services;

// "Coverbilder anzeigen" (Settings, per device; js/coverImages.js keeps it
// in localStorage). Read once at startup in Program.cs. Off, ApiClient
// never downloads a book cover, so every component falls back to its
// placeholder, which shows title and author. Static on purpose: dozens of
// components read covers, and a DI service would have to be registered in
// every one of their tests; tests that switch it reset it.
public static class CoverPreferences
{
    public static bool ShowImages { get; set; } = true;

    // /api/books/{id}/cover, with or without a query string.
    public static bool IsBookCover(string relativeUrl) =>
        System.Text.RegularExpressions.Regex.IsMatch(relativeUrl, @"^/?api/books/\d+/cover(\?|$)");
}
