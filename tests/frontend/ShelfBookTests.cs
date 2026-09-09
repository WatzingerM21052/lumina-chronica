using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfBookTests : BunitContext
{
    public ShelfBookTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
    }

    private static Book MakeBook() => new() { Id = 1, Title = "The Hobbit", Author = "J.R.R. Tolkien", CoverUrl = null };

    private sealed class FakeCoverColorService(string? result) : CoverColorService(null!)
    {
        public override Task<string?> ExtractDominantColorAsync(string coverUrl, string objectUrl) => Task.FromResult(result);
    }

    [Fact]
    public void ShelfBook_RendersAccessibleLabelWithTitleAndAuthor()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("The Hobbit, J.R.R. Tolkien", cut.Find("a.shelf-book").GetAttribute("aria-label"));
    }

    [Fact]
    public void ShelfBook_NoAuthor_AccessibleLabelIsTitleOnly()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, new Book { Id = 2, Title = "Anonymous Work" }));

        Assert.Equal("Anonymous Work", cut.Find("a.shelf-book").GetAttribute("aria-label"));
    }

    [Fact]
    public void ShelfBook_LinksToBookDetailPage()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("library/books/1", cut.Find("a.shelf-book").GetAttribute("href"));
    }

    [Fact]
    public void ShelfBook_SpineAndCoverTitleText_AreAriaHidden()
    {
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.Equal("true", cut.Find(".shelf-book-spine-title").GetAttribute("aria-hidden"));
        Assert.Equal("true", cut.Find(".shelf-book-cover-title").GetAttribute("aria-hidden"));
    }

    [Fact]
    public void ShelfBook_FavoriteToggle_CallsPostAndFlipsVisualState()
    {
        HttpRequestMessage? capturedRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().When(r =>
        {
            capturedRequest = r;
            return true;
        }, _ => RoutedFakeHttpMessageHandler.JsonResponse("{}"));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);

        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        Assert.DoesNotContain("is-favorite", cut.Find("button.shelf-book-favorite").ClassList);

        cut.Find("button.shelf-book-favorite").Click();

        Assert.Equal(HttpMethod.Post, capturedRequest?.Method);
        Assert.Equal("/api/books/1/favorite", capturedRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("is-favorite", cut.Find("button.shelf-book-favorite").ClassList);
    }

    [Fact]
    public void ShelfBook_ShowFavoriteFalse_HidesFavoriteButton()
    {
        var cut = Render<ShelfBook>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.ShowFavorite, false));

        Assert.Empty(cut.FindAll("button.shelf-book-favorite"));
    }

    [Fact]
    public void ShelfBook_OwnerUsername_RendersBorrowedBadge()
    {
        var cut = Render<ShelfBook>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.OwnerUsername, "bob"));

        Assert.Contains("Geliehen von bob", cut.Find(".shelf-book-borrowed-badge").TextContent);
    }

    [Fact]
    public void ShelfBook_ProgressPercentage_RendersProgressBarWidth()
    {
        var cut = Render<ShelfBook>(parameters => parameters
            .Add(p => p.Book, MakeBook())
            .Add(p => p.ProgressPercentage, 42.0));

        Assert.Contains("width: 42%", cut.Find(".shelf-book-progress-bar").GetAttribute("style"));
    }

    [Fact]
    public void ShelfBook_CoverColorExtracted_AppliesTintStyleAndClass()
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/cover", "fake cover bytes", "image/jpeg");
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        JSInterop.SetupModule("./js/blobUrl.js").Setup<string>("createObjectUrl", _ => true).SetResult("blob:fake-cover-url");
        Services.AddSingleton<CoverColorService>(new FakeCoverColorService("rgb(120, 60, 30)"));

        var book = new Book { Id = 3, Title = "Farbtest", CoverUrl = "/api/books/3/cover" };
        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, book));

        var anchor = cut.Find("a.shelf-book");
        Assert.Contains("--shelf-book-tint: rgb(120, 60, 30)", anchor.GetAttribute("style"));
        Assert.Contains("has-cover-tint", anchor.ClassList);
    }

    [Fact]
    public void ShelfBook_NoCoverImage_DoesNotApplyTint()
    {
        Services.AddSingleton<CoverColorService>(new FakeCoverColorService("rgb(120, 60, 30)"));

        var cut = Render<ShelfBook>(parameters => parameters.Add(p => p.Book, MakeBook()));

        var anchor = cut.Find("a.shelf-book");
        Assert.DoesNotContain("--shelf-book-tint", anchor.GetAttribute("style"));
        Assert.DoesNotContain("has-cover-tint", anchor.ClassList);
    }
}
