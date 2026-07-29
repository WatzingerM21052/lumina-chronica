using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Forms;
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

    [Fact]
    public void BookDetail_FavoriteToggle_CallsPostAndFlipsVisualState()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        HttpRequestMessage? capturedRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson))
            .When(r =>
            {
                capturedRequest = r;
                return true;
            }, _ => RoutedFakeHttpMessageHandler.JsonResponse("{}"));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.DoesNotContain("is-favorite", cut.Find("button.book-detail-favorite").ClassList);

        cut.Find("button.book-detail-favorite").Click();

        Assert.Equal(HttpMethod.Post, capturedRequest?.Method);
        Assert.Equal("/api/books/1/favorite", capturedRequest?.RequestUri?.AbsolutePath);
        Assert.Contains("is-favorite", cut.Find("button.book-detail-favorite").ClassList);
    }

    [Fact]
    public void BookDetail_EditForm_ReplacingCover_CallsPutMultipartOnCoverEndpoint()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        HttpRequestMessage? coverRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson))
            .When(r => r.Method == HttpMethod.Put && r.RequestUri!.AbsolutePath.EndsWith("/cover"), r =>
            {
                coverRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse(bookJson);
            })
            .When(r => r.Method == HttpMethod.Put, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.FindComponent<InputFile>().UploadFiles(InputFileContent.CreateFromText("cover bytes", "cover.jpg"));
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, coverRequest?.Method);
        Assert.Equal("/api/books/1/cover", coverRequest?.RequestUri?.AbsolutePath);
    }
}
