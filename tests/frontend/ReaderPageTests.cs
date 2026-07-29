using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ReaderPageTests : BunitContext
{
    private const string BookJsonTemplate = """
        {"success":true,"data":{
            "id":1,"title":"Test Book","author":"Author","description":null,
            "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
            "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],
            "file":{"format":"__FORMAT__","size":10}
        }}
        """;

    private const string NoProgressJson = """{"success":true,"data":null}""";

    private static string BookJson(string format) => BookJsonTemplate.Replace("__FORMAT__", format);

    public ReaderPageTests()
    {
        // Reader.razor's periodic/on-dispose progress save goes through JS
        // interop (scrollTracker.js) and a fire-and-forget POST -- loose mode
        // avoids needing to hand-configure every interop call just to render.
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<ScrollTrackerService>();
        Services.AddSingleton<ReaderSettingsService>();
    }

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
    }

    [Fact]
    public void Reader_RendersTxtContent()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Hello from a plain text book.", "text/plain");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Hello from a plain text book.", cut.Markup);
    }

    [Fact]
    public void Reader_RendersMarkdownAsHtml()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("MD"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "# Heading\n\nSome **bold** text.", "text/markdown");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("<h1>Heading</h1>", cut.Markup);
        Assert.Contains("<strong>bold</strong>", cut.Markup);
    }

    [Fact]
    public void Reader_StripsRawHtmlFromMarkdown()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("MD"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Safe text <script>alert('xss')</script> more text.", "text/markdown");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.DoesNotContain("<script>", cut.Markup);
    }

    [Fact]
    public void Reader_RendersEpubReaderWithoutThrowing()
    {
        // Full epub.js behavior isn't practically unit-testable (real DOM/
        // iframe rendering); this only proves the EPUB branch wires up and
        // renders its container without an exception -- live verification
        // covers CFI resume and pagination, same approach as covers/blob-URLs.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("epub-reader-frame", cut.Markup);
    }

    [Fact]
    public void Reader_ShowsErrorWhenBookHasNoFile()
    {
        const string noFileJson = """
            {"success":true,"data":{
                "id":1,"title":"Test Book","author":null,"description":null,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null
            }}
            """;
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/api/books/1", noFileJson);
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("keine Datei hinterlegt", cut.Markup);
    }
}
