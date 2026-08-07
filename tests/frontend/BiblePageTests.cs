using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class BiblePageTests : BunitContext
{
    private const string NivId = "78a9f6124f344018-01";
    private const string WebId = "web-id";

    private const string TranslationsJson = """
        {"success":true,"data":[
            {"id":"78a9f6124f344018-01","abbreviation":"NIV","name":"New International Version 2011","language":"en","isBiblica":true},
            {"id":"web-id","abbreviation":"WEB","name":"World English Bible","language":"en","isBiblica":false}
        ]}
        """;

    private const string BooksJson = """
        {"success":true,"data":[
            {"id":"PHP","name":"Phil.","nameLong":"Philippians"},
            {"id":"GEN","name":"Gen.","nameLong":"Genesis"}
        ]}
        """;

    private const string ChaptersForBookJson = """
        {"success":true,"data":[
            {"id":"PHP.1","number":"1","reference":"Phil. 1"},
            {"id":"PHP.2","number":"2","reference":"Phil. 2"}
        ]}
        """;

    private const string NivChapterJson = """
        {"success":true,"data":{
            "id":"PHP.2","reference":"Phil. 2",
            "content":"<p><span data-sid=\"PHP 2:14\" class=\"v\">14</span>Do everything without grumbling</p>",
            "copyright":"NIV copyright text","next":{"id":"PHP.3","number":"3"},"previous":{"id":"PHP.1","number":"1"},
            "fumsToken":"tok-niv"
        }}
        """;

    private const string WebChapterJson = """
        {"success":true,"data":{
            "id":"PHP.2","reference":"Phil. 2",
            "content":"<p><span data-sid=\"PHP 2:14\" class=\"v\">14</span>Do all things without murmurings</p>",
            "copyright":"WEB copyright text","next":{"id":"PHP.3","number":"3"},"previous":{"id":"PHP.1","number":"1"},
            "fumsToken":"tok-web"
        }}
        """;

    public BiblePageTests()
    {
        // Loose mode: getLastTranslationId returning null (default) is
        // exactly the "no saved preference yet" case this page starts from.
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private void UseHandler(RoutedFakeHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") };
        Services.AddSingleton(httpClient);
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BibleClientService>();
        Services.AddSingleton<BibleAtmosphereService>();
    }

    private RoutedFakeHttpMessageHandler DefaultHandler() =>
        new RoutedFakeHttpMessageHandler()
            .When(r => r.RequestUri!.AbsolutePath == "/api/bible/translations", _ => RoutedFakeHttpMessageHandler.JsonResponse(TranslationsJson))
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/books/{NivId}", _ => RoutedFakeHttpMessageHandler.JsonResponse(BooksJson))
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/books/{NivId}/PHP/chapters", _ => RoutedFakeHttpMessageHandler.JsonResponse(ChaptersForBookJson))
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/chapters/{NivId}/PHP.2", _ => RoutedFakeHttpMessageHandler.JsonResponse(NivChapterJson));

    [Fact]
    public void Bible_OnInitialLoad_ShowsPhilippians2AndScrollsToVerse14()
    {
        var scrollHandler = JSInterop.SetupVoid("scrollToVerse", _ => true);
        scrollHandler.SetVoidResult();
        UseHandler(DefaultHandler());

        var cut = Render<Bible>();

        Assert.Contains("Phil. 2", cut.Markup);
        Assert.Contains("Do everything without grumbling", cut.Markup);

        // The component awaits a short Task.Delay before scrolling (lets the
        // browser apply the DOM patch first) -- WaitForAssertion retries
        // until that continuation actually runs instead of racing it.
        cut.WaitForAssertion(() =>
        {
            var invocation = Assert.Single(scrollHandler.Invocations);
            Assert.Equal("PHP 2:14", invocation.Arguments[1]);
        });
    }

    [Fact]
    public void Bible_ShowsBiblicaLinkForNiv_NotForOtherTranslations()
    {
        UseHandler(DefaultHandler());

        var cut = Render<Bible>();

        Assert.Contains("Biblica", cut.Markup);
    }

    [Fact]
    public void Bible_ChangingTranslation_ReloadsSameChapterAndPersistsChoice()
    {
        var setTranslationHandler = JSInterop.SetupVoid("setLastTranslationId", _ => true);
        setTranslationHandler.SetVoidResult();
        var handler = DefaultHandler()
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/books/{WebId}", _ => RoutedFakeHttpMessageHandler.JsonResponse(BooksJson))
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/books/{WebId}/PHP/chapters", _ => RoutedFakeHttpMessageHandler.JsonResponse(ChaptersForBookJson))
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/chapters/{WebId}/PHP.2", _ => RoutedFakeHttpMessageHandler.JsonResponse(WebChapterJson));
        UseHandler(handler);

        var cut = Render<Bible>();
        cut.Find("select").Change(WebId);

        Assert.Contains("Do all things without murmurings", cut.Markup);
        Assert.DoesNotContain("Biblica", cut.Markup);

        var invocation = Assert.Single(setTranslationHandler.Invocations);
        Assert.Equal(WebId, invocation.Arguments[0]);
    }

    [Fact]
    public void Bible_NextChapterButton_LoadsChapterFromNextRef()
    {
        const string chapter3Json = """
            {"success":true,"data":{
                "id":"PHP.3","reference":"Phil. 3","content":"<p>Finally, my brothers...</p>",
                "copyright":"NIV copyright text","next":null,"previous":{"id":"PHP.2","number":"2"},
                "fumsToken":"tok-niv-3"
            }}
            """;
        var handler = DefaultHandler()
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/chapters/{NivId}/PHP.3", _ => RoutedFakeHttpMessageHandler.JsonResponse(chapter3Json));
        UseHandler(handler);

        var cut = Render<Bible>();
        cut.FindAll("button").Single(b => b.TextContent.Contains("Nächstes Kapitel")).Click();

        Assert.Contains("Phil. 3", cut.Markup);
        Assert.Contains("Finally, my brothers", cut.Markup);
    }

    [Fact]
    public void Bible_ArrowRightOnChapter_LoadsChapterFromNextRef()
    {
        const string chapter3Json = """
            {"success":true,"data":{
                "id":"PHP.3","reference":"Phil. 3","content":"<p>Finally, my brothers...</p>",
                "copyright":"NIV copyright text","next":null,"previous":{"id":"PHP.2","number":"2"},
                "fumsToken":"tok-niv-3"
            }}
            """;
        var handler = DefaultHandler()
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/chapters/{NivId}/PHP.3", _ => RoutedFakeHttpMessageHandler.JsonResponse(chapter3Json));
        UseHandler(handler);

        var cut = Render<Bible>();
        cut.Find("article.bible-chapter").KeyDown(new Microsoft.AspNetCore.Components.Web.KeyboardEventArgs { Key = "ArrowRight" });

        Assert.Contains("Phil. 3", cut.Markup);
        Assert.Contains("Finally, my brothers", cut.Markup);
    }

    [Fact]
    public async Task Bible_Search_ShowsResults_AndSelectingOneLoadsThatChapter()
    {
        const string searchJson = """
            {"success":true,"data":{
                "total":1,
                "results":[{"id":"PHP.4.4","reference":"Phil. 4:4","text":"Rejoice in the Lord always"}]
            }}
            """;
        const string chapter4Json = """
            {"success":true,"data":{
                "id":"PHP.4","reference":"Phil. 4",
                "content":"<p><span data-sid=\"PHP 4:4\" class=\"v\">4</span>Rejoice in the Lord always</p>",
                "copyright":"NIV copyright text","next":null,"previous":{"id":"PHP.3","number":"3"},
                "fumsToken":"tok-niv-4"
            }}
            """;
        var handler = DefaultHandler()
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/search/{NivId}", _ => RoutedFakeHttpMessageHandler.JsonResponse(searchJson))
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/chapters/{NivId}/PHP.4", _ => RoutedFakeHttpMessageHandler.JsonResponse(chapter4Json));
        UseHandler(handler);

        var cut = Render<Bible>();

        // Bible.razor's OnInitializedAsync chains five awaited API calls;
        // each one's continuation is posted (not run inline) to the
        // renderer's synchronization context, so a plain cut.Find(...).X()
        // right after Render() can race a still-in-flight continuation and
        // grab an element whose event handler ID is about to be replaced
        // (issue #247). cut.InvokeAsync runs the find+trigger as one unit
        // on that same context, per bUnit's own guidance.
        await cut.InvokeAsync(() => cut.Find("input[type=search]").Input("Rejoice"));
        await cut.InvokeAsync(() => cut.FindAll("button").Single(b => b.TextContent.Trim() == "Suchen").Click());

        Assert.Contains("Phil. 4:4", cut.Markup);

        await cut.InvokeAsync(() => cut.Find("button.bible-search-result").Click());

        Assert.Contains("Phil. 4", cut.Markup);
        Assert.Contains("Rejoice in the Lord always", cut.Markup);
    }

    [Fact]
    public void Bible_DefaultsToStandardTheme_ShowsHero_NoAtmosphere()
    {
        UseHandler(DefaultHandler());

        var cut = Render<Bible>();

        Assert.Contains("bible-hero", cut.Markup);
        Assert.DoesNotContain("bible-page--dark-academia", cut.Markup);
        Assert.DoesNotContain("bible-atmosphere", cut.Markup);
    }

    [Fact]
    public void Bible_TogglingDarkAcademia_HidesHero_ShowsAtmosphere_AndPersistsChoice()
    {
        var setThemeHandler = JSInterop.SetupVoid("setBibleTheme", _ => true);
        setThemeHandler.SetVoidResult();
        UseHandler(DefaultHandler());

        var cut = Render<Bible>();
        cut.FindAll("button").Single(b => b.TextContent.Trim() == "Dark Academia").Click();

        Assert.DoesNotContain("bible-hero-image", cut.Markup);
        Assert.Contains("bible-page--dark-academia", cut.Markup);
        Assert.Contains("bible-atmosphere", cut.Markup);
        Assert.Contains("bible-title-immersive", cut.Markup);

        var invocation = Assert.Single(setThemeHandler.Invocations);
        Assert.Equal("dark-academia", invocation.Arguments[0]);
    }

    [Fact]
    public void Bible_PersistedDarkAcademiaTheme_RestoresOnLoad()
    {
        JSInterop.Setup<string>("getBibleTheme", _ => true).SetResult("dark-academia");
        UseHandler(DefaultHandler());

        var cut = Render<Bible>();

        Assert.DoesNotContain("bible-hero-image", cut.Markup);
        Assert.Contains("bible-page--dark-academia", cut.Markup);
        Assert.Contains("bible-atmosphere", cut.Markup);
    }

    [Fact]
    public void Bible_DarkAcademiaTheme_NextChapter_StaysInThemeAndLoadsNewChapter()
    {
        // The theme choice shouldn't reset or fight chapter navigation --
        // BibleAtmosphere stays mounted across a chapter change within the
        // same theme.
        const string chapter3Json = """
            {"success":true,"data":{
                "id":"PHP.3","reference":"Phil. 3","content":"<p>Finally, my brothers...</p>",
                "copyright":"NIV copyright text","next":null,"previous":{"id":"PHP.2","number":"2"},
                "fumsToken":"tok-niv-3"
            }}
            """;
        JSInterop.Setup<string>("getBibleTheme", _ => true).SetResult("dark-academia");
        var handler = DefaultHandler()
            .When(r => r.RequestUri!.AbsolutePath == $"/api/bible/chapters/{NivId}/PHP.3", _ => RoutedFakeHttpMessageHandler.JsonResponse(chapter3Json));
        UseHandler(handler);

        var cut = Render<Bible>();
        cut.FindAll("button").Single(b => b.TextContent.Contains("Nächstes Kapitel")).Click();

        Assert.Contains("Phil. 3", cut.Markup);
        Assert.Contains("bible-page--dark-academia", cut.Markup);
    }
}
