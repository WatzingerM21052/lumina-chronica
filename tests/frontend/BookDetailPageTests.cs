using System.Linq;
using Bunit;
using LuminaChronica.Client.Models;
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
        Services.AddSingleton<OfflineStorageService>();
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
    public void BookDetail_EditForm_VisibilitySelector_ShowsCurrentValueAndSendsChange()
    {
        // Community Phase 1 (issue #300) -- visibility has existed in the DB
        // and this model since v1.0/v2.0 but was never actually settable
        // until now.
        UseApiResponse("""
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PUBLIC","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """);

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();

        Assert.Equal("PUBLIC", cut.Find("#edit-visibility").GetAttribute("value"));

        cut.Find("#edit-visibility").Change("PRIVATE");
        Assert.Equal("PRIVATE", cut.Find("#edit-visibility").GetAttribute("value"));
    }

    [Fact]
    public void BookDetail_EditForm_VisibilitySelector_OffersSharedAndExplainsSharing()
    {
        // v3.2 (issue #321) swapped PUBLIC/SHARED semantics: SHARED is now
        // the explicit-share-list tier (see Models/Book.cs's
        // BookVisibilityOption), distinct from Project/Shelf's plain
        // PRIVATE/PUBLIC VisibilityOption. Switching to SHARED lazily fetches
        // the share list (OnVisibilityChangedAsync) -- needs its own route,
        // not UseApiResponse's single fixed response, or that GET would
        // deserialize the book JSON as List<DiscoverUser> and throw.
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/shares", """{"success":true,"data":[]}""")
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();

        var options = cut.FindAll("#edit-visibility option").Select(o => o.GetAttribute("value")).ToList();
        Assert.Equal(["PRIVATE", "SHARED", "PUBLIC"], options);

        cut.Find("#edit-visibility").Change("SHARED");
        Assert.Equal("SHARED", cut.Find("#edit-visibility").GetAttribute("value"));
        Assert.Contains("können nur von den unten ausgewählten Personen vollständig gelesen werden", cut.Markup);
        Assert.Contains("Geteilt mit", cut.Markup);

        cut.Find("#edit-visibility").Change("PUBLIC");
        Assert.Contains("für jeden angemeldeten Nutzer vollständig lesbar", cut.Markup);
    }

    [Fact]
    public void BookDetail_ShareManager_RendersExistingShares_AndRemoveSendsDelete()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,
                "coverUrl":null,"genre":null,"language":null,"visibility":"SHARED","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;
        const string sharesJson = """{"success":true,"data":[{"username":"carol","avatarUrl":null}]}""";

        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, r =>
            {
                deleteRequest = r;
                return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":null}""");
            })
            .WhenPathEndsWith("/shares", sharesJson)
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();

        Assert.Contains("carol", cut.Markup);

        cut.FindAll(".book-share-list button").Single(b => b.TextContent.Trim() == "Entfernen").Click();

        Assert.Equal(HttpMethod.Delete, deleteRequest?.Method);
        Assert.Equal("/api/books/1/shares/carol", deleteRequest?.RequestUri?.AbsolutePath);
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
    public void BookDetail_EditForm_ReleaseDatePicker_SendsIsoDateStringOnSave()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        string? capturedBody = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson))
            .When(r => r.Method == HttpMethod.Put, r =>
            {
                capturedBody = r.Content?.ReadAsStringAsync().GetAwaiter().GetResult();
                return RoutedFakeHttpMessageHandler.JsonResponse(bookJson);
            });
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.Find("#edit-releaseDate").Change("2026-03-15");
        cut.Find("form.auth-form").Submit();

        Assert.Contains("2026-03-15", capturedBody);
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
        Services.AddSingleton<OfflineStorageService>();

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
        Services.AddSingleton<OfflineStorageService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.FindComponent<InputFile>().UploadFiles(InputFileContent.CreateFromText("cover bytes", "cover.jpg"));
        cut.Find("form").Submit();

        Assert.Equal(HttpMethod.Put, coverRequest?.Method);
        Assert.Equal("/api/books/1/cover", coverRequest?.RequestUri?.AbsolutePath);
    }

    [Fact]
    public void BookDetail_EditForm_EnrichmentLookup_ShowsPreview_AppliesOnlyOnConfirm()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":"My Own Genre","language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        var handler = new RoutedFakeHttpMessageHandler().When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();
        JSInterop.SetupModule("./js/metadataEnrichment.js")
            .Setup<EnrichedMetadata>("lookupByIsbn", _ => true)
            .SetResult(new EnrichedMetadata
            {
                Found = true,
                Genre = "Fantasy fiction",
                Publisher = "Enriched Publisher",
                Pages = 250,
                HasCover = false,
            });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.Find("#edit-isbn").Change("9783791500119");
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Info abrufen").Click();

        // Nothing is applied yet -- the preview shows what was found.
        Assert.True(string.IsNullOrEmpty(cut.Find("#edit-publisher").GetAttribute("value")));
        Assert.Contains("Gefundene Daten", cut.Markup);
        Assert.Contains("wird gesetzt: Enriched Publisher", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Übernehmen").Click();

        // Genre came pre-filled from the book itself -- must stay untouched.
        // Publisher/pages were empty -- must be filled.
        Assert.Equal("My Own Genre", cut.Find("#edit-genre").GetAttribute("value"));
        Assert.Equal("Enriched Publisher", cut.Find("#edit-publisher").GetAttribute("value"));
        Assert.Equal("250", cut.Find("#edit-pages").GetAttribute("value"));
        Assert.DoesNotContain("Gefundene Daten", cut.Markup);
    }

    [Fact]
    public void BookDetail_EditForm_EnrichmentPreview_Discard_LeavesFormUnchanged()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        var handler = new RoutedFakeHttpMessageHandler().When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();
        JSInterop.SetupModule("./js/metadataEnrichment.js")
            .Setup<EnrichedMetadata>("lookupByIsbn", _ => true)
            .SetResult(new EnrichedMetadata { Found = true, Publisher = "Enriched Publisher", HasCover = false });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.Find("#edit-isbn").Change("9783791500119");
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Info abrufen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Verwerfen").Click();

        Assert.True(string.IsNullOrEmpty(cut.Find("#edit-publisher").GetAttribute("value")));
        Assert.DoesNotContain("Gefundene Daten", cut.Markup);
    }

    [Fact]
    public void BookDetail_EditForm_EnrichmentLookup_NotFound_ShowsStatusMessage()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        var handler = new RoutedFakeHttpMessageHandler().When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();
        JSInterop.SetupModule("./js/metadataEnrichment.js")
            .Setup<EnrichedMetadata>("lookupByIsbn", _ => true)
            .SetResult(new EnrichedMetadata { Found = false });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.Find("#edit-isbn").Change("0000000000000");
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Info abrufen").Click();

        Assert.Contains("Keine Daten gefunden.", cut.Markup);
    }

    [Fact]
    public void BookDetail_EditForm_EnrichmentSearch_SelectingResultSetsIsbnAndShowsPreview()
    {
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        var handler = new RoutedFakeHttpMessageHandler().When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();
        var module = JSInterop.SetupModule("./js/metadataEnrichment.js");
        module.Setup<List<EnrichmentSearchResult>>("searchByQuery", _ => true).SetResult(
        [
            new EnrichmentSearchResult { Key = "/works/OL1W", Title = "Der Herr der Ringe", Author = "J.R.R. Tolkien", Year = 1954, CoverId = 123, Isbn = "9783791500119" },
        ]);
        module.Setup<EnrichedMetadata>("lookupByIsbn", _ => true).SetResult(
            new EnrichedMetadata { Found = true, Publisher = "Tolkien Verlag", HasCover = false });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.Find("#edit-enrichment-search").Change("Der Herr der Ringe");
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Suchen").Click();

        Assert.Contains("Der Herr der Ringe", cut.Markup);

        cut.Find("button.enrichment-search-result").Click();

        Assert.Equal("9783791500119", cut.Find("#edit-isbn").GetAttribute("value"));
        Assert.Contains("Gefundene Daten", cut.Markup);
        Assert.Contains("wird gesetzt: Tolkien Verlag", cut.Markup);
    }

    [Fact]
    public void BookDetail_EditForm_EnrichmentSearch_GoogleBooksResult_UsesGoogleBooksLookupNotIsbnLookup()
    {
        // Regression coverage: a Google Books result with an ISBN must not
        // silently re-route through OpenLibrary's lookupByIsbn -- Source
        // must dispatch to lookupByGoogleBooksId instead.
        const string bookJson = """
            {"success":true,"data":{
                "id":1,"title":"Dune","author":"Frank Herbert","description":null,"isFavorite":false,
                "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
                "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
            }}
            """;

        var handler = new RoutedFakeHttpMessageHandler().When(r => r.Method == HttpMethod.Get, _ => RoutedFakeHttpMessageHandler.JsonResponse(bookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();
        var module = JSInterop.SetupModule("./js/metadataEnrichment.js");
        module.Setup<List<EnrichmentSearchResult>>("searchByQuery", _ => true).SetResult(
        [
            new EnrichmentSearchResult
            {
                Source = "googlebooks", GoogleBooksId = "zyTCAlFPjgYC", Title = "Dune", Author = "Frank Herbert",
                Year = 1965, CoverUrl = "https://books.google.com/cover.jpg", Isbn = "9780441013593",
            },
        ]);
        module.Setup<EnrichedMetadata>("lookupByGoogleBooksId", _ => true).SetResult(
            new EnrichedMetadata { Found = true, Publisher = "Google Books Verlag", HasCover = false });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.Find("#edit-button").Click();
        cut.Find("#edit-enrichment-search").Change("Dune");
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Suchen").Click();
        cut.Find("button.enrichment-search-result").Click();

        // Selecting the ISBN would have taken the OpenLibrary path instead --
        // confirm the ISBN field was NOT filled from the result (that only
        // happens on the OpenLibrary branch) and the Google Books result made
        // it into the preview.
        Assert.True(string.IsNullOrEmpty(cut.Find("#edit-isbn").GetAttribute("value")));
        Assert.Contains("wird gesetzt: Google Books Verlag", cut.Markup);
    }

    private const string OfflineTestBookJson = """
        {"success":true,"data":{
            "id":1,"title":"Dune","author":"Frank Herbert","description":null,
            "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
            "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":{"format":"EPUB","size":1000}
        }}
        """;

    [Fact]
    public void BookDetail_OfflineButton_ShowsSaveWhenNotYetSaved()
    {
        UseApiResponse(OfflineTestBookJson);
        JSInterop.SetupModule("./js/offlineStorage.js")
            .Setup<OfflineStatus>("getStatus", _ => true)
            .SetResult(new OfflineStatus { Saved = false, SizeBytes = 0 });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Offline speichern", cut.Markup);
        Assert.DoesNotContain("Offline entfernen", cut.Markup);
    }

    [Fact]
    public void BookDetail_OfflineButton_ShowsRemoveWithSizeWhenAlreadySaved()
    {
        UseApiResponse(OfflineTestBookJson);
        JSInterop.SetupModule("./js/offlineStorage.js")
            .Setup<OfflineStatus>("getStatus", _ => true)
            .SetResult(new OfflineStatus { Saved = true, SizeBytes = 2 * 1024 * 1024 });

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Offline entfernen (2.0 MB)", cut.Markup);
    }

    [Fact]
    public void BookDetail_OfflineButton_SaveOffline_DownloadsFileAndCallsSaveBook()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1/shelves", """{"success":true,"data":[]}""")
            .WhenPathEndsWith("/api/shelves", """{"success":true,"data":[]}""")
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip")
            .WhenPathEndsWith("/api/books/1", OfflineTestBookJson);
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();

        var offlineModule = JSInterop.SetupModule("./js/offlineStorage.js");
        offlineModule.Setup<OfflineStatus>("getStatus", _ => true).SetResult(new OfflineStatus { Saved = false, SizeBytes = 0 });
        var saveHandler = offlineModule.SetupVoid("saveBook", _ => true);
        saveHandler.SetVoidResult();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Offline speichern").Click();

        var invocation = Assert.Single(saveHandler.Invocations);
        Assert.Equal(1, Convert.ToInt32(invocation.Arguments[0]));
        Assert.Equal("Dune", invocation.Arguments[1]);
        Assert.Equal("Frank Herbert", invocation.Arguments[2]);
        Assert.Equal("EPUB", invocation.Arguments[3]);
    }

    [Fact]
    public void BookDetail_OfflineButton_RemoveOffline_CallsDeleteBook()
    {
        UseApiResponse(OfflineTestBookJson);
        var offlineModule = JSInterop.SetupModule("./js/offlineStorage.js");
        offlineModule.Setup<OfflineStatus>("getStatus", _ => true).SetResult(new OfflineStatus { Saved = true, SizeBytes = 1024 });
        var deleteHandler = offlineModule.SetupVoid("deleteBook", _ => true);
        deleteHandler.SetVoidResult();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim().StartsWith("Offline entfernen")).Click();

        var invocation = Assert.Single(deleteHandler.Invocations);
        Assert.Equal(1, Convert.ToInt32(invocation.Arguments[0]));
        Assert.DoesNotContain("Offline entfernen", cut.Markup);
    }

    private const string SimpleBookJson = """
        {"success":true,"data":{
            "id":1,"title":"Dune","author":"Frank Herbert","description":null,
            "coverUrl":null,"genre":null,"language":null,"visibility":"PRIVATE","createdAt":"2026-01-01",
            "isbn":null,"publisher":null,"releaseDate":null,"pages":null,"tags":[],"file":null
        }}
        """;

    [Fact]
    public void BookDetail_DeleteButton_OpensConfirmDialog()
    {
        UseApiResponse(SimpleBookJson);

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();

        Assert.Contains("Buch wirklich löschen?", cut.Markup);
    }

    [Fact]
    public void BookDetail_ConfirmDialog_Cancel_ClosesWithoutSendingDeleteRequest()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, r => { deleteRequest = r; return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}"""); })
            .When(_ => true, _ => RoutedFakeHttpMessageHandler.JsonResponse(SimpleBookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Abbrechen").Click();

        Assert.DoesNotContain("Buch wirklich löschen?", cut.Markup);
        Assert.Null(deleteRequest);
    }

    [Fact]
    public void BookDetail_ConfirmDialog_Confirm_SendsDeleteRequest()
    {
        HttpRequestMessage? deleteRequest = null;
        var handler = new RoutedFakeHttpMessageHandler()
            .When(r => r.Method == HttpMethod.Delete, r => { deleteRequest = r; return RoutedFakeHttpMessageHandler.JsonResponse("""{"success":true,"data":true}"""); })
            .When(_ => true, _ => RoutedFakeHttpMessageHandler.JsonResponse(SimpleBookJson));
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<OfflineStorageService>();

        var cut = Render<BookDetail>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Löschen").Click();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Ja, löschen").Click();

        Assert.NotNull(deleteRequest);
        Assert.Equal("/api/books/1", deleteRequest!.RequestUri!.AbsolutePath);
    }
}
