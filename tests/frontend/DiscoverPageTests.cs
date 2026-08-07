using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
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
        Assert.Contains("von alice", cut.Markup);
        Assert.Contains("4.5", cut.Markup);
    }

    [Fact]
    public void Discover_ShowsEmptyState_WhenNoPublicBooks()
    {
        UseRoutes(EmptyBooksJson);

        var cut = Render<Discover>();

        Assert.Contains("Noch keine öffentlichen Bücher", cut.Markup);
    }

    [Fact]
    public void Discover_BookCard_LinksToOwnersPublicProfile_WithoutLeadingSlash()
    {
        // Regression coverage for the same class of bug as PublicProfile's
        // link hotfix (PR #302) -- a leading "/" breaks on the GitHub Pages
        // subpath.
        UseRoutes(BooksJson);

        var cut = Render<Discover>();

        var link = cut.Find("a.book-card");
        Assert.Equal("u/alice", link.GetAttribute("href"));
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
