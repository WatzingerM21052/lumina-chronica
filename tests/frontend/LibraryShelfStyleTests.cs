using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The library's Regal view with the shelf styles (spec 2026-10-11): classic
// by default, the previous shelf as "legacy".
public class LibraryShelfStyleTests : BunitContext
{
    private const string BooksJson = """{"success":true,"data":{"items":[{"id":1,"title":"Momo","genre":"Fantasy","createdAt":"2026-01-01T00:00:00Z"},{"id":2,"title":"Faust","createdAt":"2026-01-01T00:00:00Z"}],"total":2,"page":1,"pageSize":100}}""";
    private const string DashboardJson = """{"success":true,"data":{"continueReading":[{"book":{"id":2,"title":"Faust","createdAt":"2026-01-01T00:00:00Z"},"percentage":40,"lastOpened":"2026-10-10T00:00:00Z"},{"book":{"id":99,"title":"Geliehen","createdAt":"2026-01-01T00:00:00Z"},"percentage":10,"lastOpened":"2026-10-09T00:00:00Z"}],"recommendations":[]}}""";

    public LibraryShelfStyleTests()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/dashboard", DashboardJson)
            .WhenPathEndsWith("/api/books/facets", """{"success":true,"data":{"genres":[],"tags":[]}}""")
            .WhenPathEndsWith("/api/books", BooksJson);
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
        Services.AddSingleton<TimeProvider>(new FakeTimeProvider());
        Services.AddSingleton<IThemeService>(new FakeThemeService());
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void ShelfView_IsClassicByDefault_WithRecentlyReadFirst()
    {
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".classic-shelf")));
        Assert.Empty(cut.FindAll(".shelf-cabinet"));
        // The borrowed book (id 99) isn't in the library list, so it stays out.
        Assert.Equal(["Zuletzt gelesen", "Fantasy", "Ohne Genre"], cut.FindAll(".classic-shelf-plaque").Select(p => p.TextContent));
        Assert.Equal(3, cut.FindAll("a.classic-shelf-slot").Count);
    }

    [Fact]
    public void ShelfView_LegacyStyle_RendersThePreviousShelf()
    {
        JSInterop.SetupModule("./js/libraryPreferences.js").Setup<string?>("getShelfStyle", _ => true).SetResult("legacy");
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".shelf-cabinet")));
        Assert.Empty(cut.FindAll(".classic-shelf"));
    }

    [Fact]
    public void ShelfView_LeatherStyle_RendersLeatherVolumes()
    {
        JSInterop.SetupModule("./js/libraryPreferences.js").Setup<string?>("getShelfStyle", _ => true).SetResult("leather");
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".leather-shelf")));
        Assert.Empty(cut.FindAll(".classic-shelf"));
        Assert.Equal(3, cut.FindAll("a.leather-shelf-book").Count);
    }

    [Fact]
    public void ShelfView_LibraryStyle_RendersTheLibraryRoom()
    {
        JSInterop.SetupModule("./js/libraryPreferences.js").Setup<string?>("getShelfStyle", _ => true).SetResult("rotunda");
        JSInterop.SetupModule("./js/libraryRoom/index.js").Setup<bool>("supported").SetResult(true);
        var cut = Render<Library>();

        cut.Find("#view-shelf").Click();

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".library-room")));
        // real book sizes there: no size choice
        Assert.Empty(cut.FindAll(".library-shelf-book-zoom"));
    }
}
