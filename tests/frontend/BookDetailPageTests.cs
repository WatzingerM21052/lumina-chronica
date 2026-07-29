using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class BookDetailPageTests : BunitContext
{
    private void UseApiResponse(string responseJson)
    {
        var handler = new FakeHttpMessageHandler(responseJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
    }

    [Fact]
    public void BookDetail_RendersBookMetadata()
    {
        UseApiResponse("""
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":"A desert planet.",
                "coverUrl":null,"genre":"scifi","language":"en","visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """);

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Dune", cut.Markup);
        Assert.Contains("Frank Herbert", cut.Markup);
        Assert.Contains("A desert planet.", cut.Markup);
    }

    [Fact]
    public void BookDetail_EditButton_SwitchesToEditForm()
    {
        UseApiResponse("""
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """);

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();

        Assert.NotNull(cut.Find("#edit-title"));
    }

    [Fact]
    public void BookDetail_Tags_RenderAsLinksToFilteredLibrary()
    {
        UseApiResponse("""
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":["Science Fiction","Classics"],"file":{"format":"EPUB","size":1000}
            }}
            """);

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        var tagLinks = cut.FindAll("dd a").ToList();

        Assert.Equal(2, tagLinks.Count);
        Assert.Equal("library?tag=Science%20Fiction", tagLinks[0].GetAttribute("href"));
        Assert.Equal("Science Fiction", tagLinks[0].TextContent);
    }
}
