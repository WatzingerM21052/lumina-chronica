using Bunit;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Forms;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class BookUploadPageTests : BunitContext
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
    public void BookUpload_RendersRequiredFields()
    {
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}""");

        var cut = Render<BookUpload>();

        Assert.NotNull(cut.Find("#title"));
        Assert.NotNull(cut.Find("#file"));
        Assert.NotNull(cut.Find("button[type=submit]"));
    }

    [Fact]
    public void BookUpload_SubmitWithoutFile_ShowsError()
    {
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}""");

        var cut = Render<BookUpload>();
        cut.Find("#title").Change("A Title");
        cut.Find("form").Submit();

        Assert.Contains("Bitte wähle eine Buchdatei aus.", cut.Markup);
    }

    [Fact]
    public void BookUpload_UnsupportedExtension_ShowsClientSideError()
    {
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}""");

        var cut = Render<BookUpload>();
        cut.FindComponents<InputFile>()[0].UploadFiles(InputFileContent.CreateFromText("not a book", "malware.exe"));

        Assert.Contains("Dateityp muss eines von", cut.Markup);
    }

    [Fact]
    public void BookUpload_ApiFailure_ShowsErrorMessage()
    {
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"Upload rejected by server."}}""");

        var cut = Render<BookUpload>();
        cut.Find("#title").Change("A Title");
        cut.FindComponents<InputFile>()[0].UploadFiles(InputFileContent.CreateFromText("epub-bytes", "book.epub"));
        cut.Find("form").Submit();

        Assert.Contains("Upload rejected by server.", cut.Markup);
    }

    [Fact]
    public void BookUpload_ReleaseDatePicker_SendsIsoDateString()
    {
        string? capturedBody = null;
        // The body must be read inside the responder, before SubmitAsync's
        // `using var content = new MultipartFormDataContent` disposes it.
        var handler = new RoutedFakeHttpMessageHandler().When(r =>
        {
            capturedBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
            return true;
        }, _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}"""));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();

        var cut = Render<BookUpload>();
        cut.Find("#title").Change("A Title");
        cut.Find("#releaseDate").Change("2026-03-15");
        cut.FindComponents<InputFile>()[0].UploadFiles(InputFileContent.CreateFromText("epub-bytes", "book.epub"));
        cut.Find("form").Submit();

        Assert.Contains("2026-03-15", capturedBody);
    }

    [Fact]
    public void BookUpload_EpubSelection_PrefillsEmptyFieldsFromExtractedMetadata()
    {
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}""");
        JSInterop.SetupModule("./js/metadataExtractor.js")
            .Setup<ExtractedMetadata>("extractEpub", _ => true)
            .SetResult(new ExtractedMetadata
            {
                Title = "Extracted Title",
                Author = "Extracted Author",
                Language = "de",
                HasCover = false,
            });

        var cut = Render<BookUpload>();
        cut.FindComponents<InputFile>()[0].UploadFiles(InputFileContent.CreateFromText("epub-bytes", "book.epub"));

        Assert.Equal("Extracted Title", cut.Find("#title").GetAttribute("value"));
        Assert.Equal("Extracted Author", cut.Find("#author").GetAttribute("value"));
        Assert.Equal("de", cut.Find("#language").GetAttribute("value"));
    }

    [Fact]
    public void BookUpload_EpubSelection_DoesNotOverwriteManuallyEnteredTitle()
    {
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}""");
        JSInterop.SetupModule("./js/metadataExtractor.js")
            .Setup<ExtractedMetadata>("extractEpub", _ => true)
            .SetResult(new ExtractedMetadata { Title = "Extracted Title", HasCover = false });

        var cut = Render<BookUpload>();
        cut.Find("#title").Change("My Own Title");
        cut.FindComponents<InputFile>()[0].UploadFiles(InputFileContent.CreateFromText("epub-bytes", "book.epub"));

        Assert.Equal("My Own Title", cut.Find("#title").GetAttribute("value"));
    }

    [Fact]
    public void BookUpload_TxtSelection_DoesNotAttemptExtraction()
    {
        // No JSInterop.SetupModule configured -- if the TXT branch tried to
        // extract metadata anyway, the unconfigured JS call would throw and
        // surface as a client-side error, unlike a real skip.
        UseApiResponse("""{"success":false,"error":{"code":"VALIDATION_ERROR","message":"not used"}}""");

        var cut = Render<BookUpload>();
        cut.FindComponents<InputFile>()[0].UploadFiles(InputFileContent.CreateFromText("plain text", "notes.txt"));

        Assert.DoesNotContain("form-error", cut.Markup);
    }
}
