using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class DiscoverPageTests : BunitContext
{
    private const string BooksJson =
        """{"success":true,"data":{"items":[{"id":1,"title":"Discoverable Book","author":"Jane Doe","coverUrl":null,"genre":null,"averageRating":4.5,"ratingCount":2,"myRating":null,"ownerUsername":"alice"}],"total":1,"page":1,"pageSize":20}}""";

    private const string EmptyBooksJson = """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}""";

    private const string EmptyUsersJson = """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":20}}""";

    private const string UserResultsJson =
        """{"success":true,"data":{"items":[{"username":"alice","avatarUrl":null}],"total":1,"page":1,"pageSize":20}}""";

    private RoutedFakeHttpMessageHandler UseRoutes(string booksJson)
    {
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/discover/books", booksJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        return handler;
    }

    [Fact]
    public void Discover_RendersBookTitleAuthorOwnerAndRating()
    {
        UseRoutes(BooksJson);

        var cut = Render<Discover>();

        Assert.Contains("Discoverable Book", cut.Markup);
        Assert.Contains("Jane Doe", cut.Markup);
        Assert.Contains("von", cut.Markup);
        Assert.Equal("alice", cut.Find(".book-card-owner-link").TextContent.Trim());
        Assert.Contains("4.5", cut.Markup);
    }

    [Fact]
    public void Discover_ClickingOwnerName_NavigatesToTheirProfile_WithoutNavigatingTheCard()
    {
        // The owner's name is a separate clickable span with stopPropagation
        // (not a nested <a>, which would be invalid HTML inside the card's
        // own <a href> and behave unreliably across browsers).
        UseRoutes(BooksJson);

        var cut = Render<Discover>();
        cut.Find(".book-card-owner-link").Click();

        var navigation = Services.GetRequiredService<NavigationManager>();
        Assert.EndsWith("u/alice", navigation.Uri);
    }

    [Fact]
    public void Discover_ShowsEmptyState_WhenNoPublicBooks()
    {
        UseRoutes(EmptyBooksJson);

        var cut = Render<Discover>();

        Assert.Contains("Noch keine öffentlichen Bücher", cut.Markup);
    }

    [Fact]
    public void Discover_BookCard_LinksToTheBookItself_NotTheOwnersProfile_WithoutLeadingSlash()
    {
        // Previously linked to the owner's public profile -- clicking a book
        // should go straight to the book's own overview page. Also
        // regression coverage for the same leading-"/" GitHub Pages subpath
        // bug class as PR #302/#332.
        UseRoutes(BooksJson);

        var cut = Render<Discover>();

        var link = cut.Find("a.book-card");
        Assert.Equal("library/books/1", link.GetAttribute("href"));
    }

    [Fact]
    public void Discover_ChangingSort_RequestsRatingSort()
    {
        HttpRequestMessage? lastRequest = null;
        var handler = new RoutedFakeHttpMessageHandler().When(r => r.RequestUri!.AbsolutePath.EndsWith("/discover/books"), r =>
        {
            lastRequest = r;
            return RoutedFakeHttpMessageHandler.JsonResponse(BooksJson);
        });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Discover>();
        cut.Find("select").Change("rating");

        Assert.Contains("sort=rating", lastRequest?.RequestUri?.Query);
    }

    [Fact]
    public void Discover_TypingAUsername_ShowsMatchingResults()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/discover/books", EmptyBooksJson)
            .When(r => r.RequestUri!.AbsolutePath.EndsWith("/discover/users") && r.RequestUri.Query.Contains("search=ali"), _ => RoutedFakeHttpMessageHandler.JsonResponse(UserResultsJson))
            .WhenPathEndsWith("/discover/users", EmptyUsersJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Discover>();
        cut.Find("input").Input("ali");

        cut.WaitForAssertion(() => Assert.Contains("alice", cut.Markup), TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void Discover_UserResult_LinksToPublicProfile_WithoutLeadingSlash()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/discover/books", EmptyBooksJson)
            .WhenPathEndsWith("/discover/users", UserResultsJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Discover>();
        cut.Find("input").Input("ali");

        cut.WaitForAssertion(() =>
        {
            var link = cut.Find("li a");
            Assert.Equal("u/alice", link.GetAttribute("href"));
        }, TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void Discover_BlankSearch_ShowsNoResultsMessage()
    {
        UseRoutes(EmptyBooksJson);

        var cut = Render<Discover>();

        Assert.DoesNotContain("Keine Nutzer gefunden", cut.Markup);
    }
}
