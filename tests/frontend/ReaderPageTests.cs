using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
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
        Services.AddSingleton<OfflineStorageService>();
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
        Assert.Contains("epub-reader-progress", cut.Markup);
    }

    [Fact]
    public void Reader_PassesSavedCfiToEpubReader_NotALiteralPlaceholder()
    {
        // Regression test for issue #75: <EpubReader InitialCfi="_initialCfi" ...>
        // (missing the @ prefix) compiled fine but bound the literal string
        // "_initialCfi" instead of the field's actual value, since InitialCfi
        // is string-typed and a bare identifier type-checks as a string
        // literal. This asserts the real saved CFI reaches the child
        // component's parameter, not the field's own name.
        const string progressJson = """{"success":true,"data":{"chapter":2,"position":"epubcfi(/6/8!/4/2/1:0)","percentage":25.0}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", progressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        var epubReader = cut.FindComponent<EpubReader>();
        Assert.Equal("epubcfi(/6/8!/4/2/1:0)", epubReader.Instance.InitialCfi);
    }

    [Fact]
    public void Reader_RendersPdfReaderWithoutThrowing()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("PDF"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake pdf bytes", "application/pdf");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("pdf-reader-frame", cut.Markup);
        Assert.Contains("pdf-reader-zoom", cut.Markup);
    }

    [Fact]
    public void Reader_PassesSavedPageToPdfReader_NotALiteralPlaceholder()
    {
        // Same regression class as above, for PdfReader.InitialPage.
        const string progressJson = """{"success":true,"data":{"chapter":7,"position":"7","percentage":50.0}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("PDF"))
            .WhenPathEndsWith("/api/reading/1", progressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake pdf bytes", "application/pdf");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        var pdfReader = cut.FindComponent<PdfReader>();
        Assert.Equal(7, pdfReader.Instance.InitialPage);
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

    [Fact]
    public void Reader_FallsBackToOfflineCopy_WhenApiUnavailable()
    {
        const string failureJson = """{"success":false,"error":{"code":"NETWORK_ERROR","message":"nope"}}""";
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", failureJson)
            .WhenPathEndsWith("/api/reading/1", NoProgressJson);
        UseHandler(handler);

        var fileBytes = System.Text.Encoding.UTF8.GetBytes("Hello from an offline copy.");
        JSInterop.SetupModule("./js/offlineStorage.js")
            .Setup<OfflineBookFile?>("getBookFile", _ => true)
            .SetResult(new OfflineBookFile { Title = "Test Book", Author = "Author", Format = "TXT", FileBytes = fileBytes, FileContentType = "text/plain" });

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Hello from an offline copy.", cut.Markup);
    }

    [Fact]
    public void Reader_ShowsErrorWhenApiFailsAndNoOfflineCopyExists()
    {
        const string failureJson = """{"success":false,"error":{"code":"NOT_FOUND","message":"Buch nicht gefunden."}}""";
        var handler = new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/api/books/1", failureJson);
        UseHandler(handler);

        JSInterop.SetupModule("./js/offlineStorage.js")
            .Setup<OfflineBookFile?>("getBookFile", _ => true)
            .SetResult(null);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Buch nicht gefunden.", cut.Markup);
    }
}
