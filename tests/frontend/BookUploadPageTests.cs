using Bunit;
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
}
