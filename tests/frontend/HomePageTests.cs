using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class HomePageTests : BunitContext
{
    [Fact]
    public void Home_RendersWithoutThrowing_AndShowsWelcomeHeading()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}"""));

        var cut = Render<Home>();

        Assert.Contains("Willkommen zurück", cut.Markup);
    }

    [Fact]
    public void Home_ShowsEmptyStateForLibrary_WhenLibraryIsEmpty()
    {
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", """{"success":true,"data":{"items":[],"total":0,"page":1,"pageSize":6}}"""));

        var cut = Render<Home>();

        Assert.Contains("Deine Bibliothek ist noch leer", cut.Markup);
    }

    [Fact]
    public void Home_ShowsRecentBooks_WhenLibraryHasBooks()
    {
        // Regression coverage for the bug where Home always showed the
        // "library is empty" placeholder regardless of real data.
        const string booksJson = """
            {"success":true,"data":{"items":[
                {"id":1,"title":"Dune","author":"Frank Herbert","description":null,
                 "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                 "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null}
            ],"total":1,"page":1,"pageSize":6}}
            """;
        UseHandler(new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/status", """{"success":true,"data":{"status":"online"}}""")
            .WhenPathEndsWith("/api/books", booksJson));
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<Home>();

        Assert.Contains("Dune", cut.Markup);
        Assert.DoesNotContain("Deine Bibliothek ist noch leer", cut.Markup);
    }

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
    }
}
