using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class CountAndDateTests
{
    private sealed class Strings : II18nService
    {
        public string CurrentLanguage => "de";
        public Task InitializeAsync() => Task.CompletedTask;
        public Task SetLanguageAsync(string language) => Task.CompletedTask;
        public string T(string key) => key switch
        {
            "x.books" => "{0} Bücher",
            "x.booksOne" => "{0} Buch",
            _ => key,
        };
    }

    [Theory]
    [InlineData(0, "0 Bücher")]
    [InlineData(1, "1 Buch")]
    [InlineData(2, "2 Bücher")]
    public void CountUsesTheSingularForExactlyOne(long count, string expected)
    {
        Assert.Equal(expected, new Strings().Count("x.books", count));
    }

    [Fact]
    public void DateTimeShowsAStoredUtcTimestampInLocalTime()
    {
        var expected = new DateTime(2026, 10, 11, 14, 53, 0, DateTimeKind.Utc).ToLocalTime().ToString("dd.MM.yyyy, HH:mm");

        Assert.Equal(expected, DisplayDate.DateTime("2026-10-11 14:53:00"));
    }

    [Fact]
    public void DateTimeKeepsAnUnparsableValue()
    {
        Assert.Equal("gestern", DisplayDate.DateTime("gestern"));
    }
}
