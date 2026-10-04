using LuminaChronica.Client.Services;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The switch is static, so these tests never run alongside the others.
[CollectionDefinition(nameof(CoverPreferencesCollection), DisableParallelization = true)]
public class CoverPreferencesCollection;

// "Coverbilder anzeigen" (Settings): off, ApiClient downloads no book cover,
// so every component falls back to its text cover.
[Collection(nameof(CoverPreferencesCollection))]
public class CoverPreferencesTests
{
    [Theory]
    [InlineData("/api/books/19/cover", true)]
    [InlineData("api/books/19/cover", true)]
    [InlineData("/api/books/19/cover?v=2", true)]
    [InlineData("/api/books/19", false)]
    [InlineData("/api/projects/4/cover", false)]
    [InlineData("/api/books/19/covered", false)]
    public void IsBookCover_MatchesOnlyBookCoverUrls(string url, bool expected)
    {
        Assert.Equal(expected, CoverPreferences.IsBookCover(url));
    }

    [Fact]
    public async Task ApiClient_WithCoverImagesOff_DownloadsNoBookCover_ButOtherFiles()
    {
        var handler = new RoutedFakeHttpMessageHandler().When(_ => true, _ => new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) });
        var api = new ApiClient(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        try
        {
            CoverPreferences.ShowImages = false;

            Assert.Null(await api.GetBytesAsync("/api/books/19/cover"));
            Assert.NotNull(await api.GetBytesAsync("/api/projects/4/cover"));
        }
        finally
        {
            CoverPreferences.ShowImages = true;
        }
    }
}
