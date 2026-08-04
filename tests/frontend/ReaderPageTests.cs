using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Web;
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
        Services.AddSingleton<TextPaginatorService>();
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
    public void Reader_ShowsTypographyControls_AndAppliesFontFamilyChoice()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Hello from a plain text book.", "text/plain");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("reader-controls", cut.Markup);
        Assert.DoesNotContain("reader-content--font-sans", cut.Markup);

        // Settings live behind a menu button now, not always-visible controls.
        var toggle = cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen");
        toggle.Click();

        var sansButton = cut.FindAll("button").Single(b => b.TextContent == "Sans");
        sansButton.Click();

        Assert.Contains("reader-content--font-sans", cut.Markup);
    }

    [Fact]
    public void Reader_TxtFormat_SettingsMenu_ShowsReaderModeToggle_WithoutRealisticOption()
    {
        // Issue #155: TXT/MD gained a real Book/Scroll View toggle (CSS
        // multi-column pagination, see textPaginator.js) -- Realistisch stays
        // PDF-only, that's unrelated (StPageFlip/pdf.js specific).
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Hello from a plain text book.", "text/plain");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();

        Assert.Contains("Ansicht", cut.Markup);
        Assert.DoesNotContain("Realistisch", cut.Markup);
    }

    [Fact]
    public void Reader_TxtFormat_BookMode_ShowsPageNav_ScrollMode_DoesNot()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Hello from a plain text book.", "text/plain");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");
        JSInterop.SetupModule("./js/textPaginator.js").Setup<int>("init", _ => true).SetResult(1);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Weiter ▶", cut.Markup);
        Assert.Contains("◀ Zurück", cut.Markup);
        Assert.Contains("reader-content--paginated", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.FindAll("button").Single(b => b.TextContent == "Scroll").Click();

        Assert.DoesNotContain("Weiter ▶", cut.Markup);
        Assert.DoesNotContain("◀ Zurück", cut.Markup);
        Assert.DoesNotContain("reader-content--paginated", cut.Markup);
    }

    [Fact]
    public void Reader_TxtFormat_PersistedRealisticMode_CoercedToBook()
    {
        // Same coercion class as EPUB's (Reader_EpubFormat_PersistedRealisticMode_CoercedToBook)
        // -- _readerMode is one global persisted setting shared across every
        // format, so a value from a PDF/EPUB session ("realistic") could
        // otherwise reach TXT/MD, which only understands "book"/"scroll".
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Hello from a plain text book.", "text/plain");
        UseHandler(handler);
        var readerSettingsModule = JSInterop.SetupModule("./js/readerSettings.js");
        readerSettingsModule.Setup<string>("getReaderMode", _ => true).SetResult("realistic");
        var setReaderModeHandler = readerSettingsModule.SetupVoid("setReaderMode", _ => true);
        setReaderModeHandler.SetVoidResult();
        JSInterop.SetupModule("./js/textPaginator.js").Setup<int>("init", _ => true).SetResult(1);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains(setReaderModeHandler.Invocations, i => i.Arguments[0] as string == "book");
        Assert.Contains("Weiter ▶", cut.Markup);
    }

    [Fact]
    public void Reader_EpubFormat_ScrollModeToggle_HidesPageTurnButtonsAndAppliesScrollClass()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("Weiter ▶", cut.Markup);
        Assert.Contains("◀ Zurück", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.FindAll("button").Single(b => b.TextContent == "Scroll").Click();

        Assert.DoesNotContain("Weiter ▶", cut.Markup);
        Assert.DoesNotContain("◀ Zurück", cut.Markup);
        Assert.Contains("epub-reader-frame--scroll", cut.Markup);
    }

    [Fact]
    public void Reader_EpubFormat_SettingsMenu_DoesNotShowRealisticModeToggle()
    {
        // Issue #189: the section-capture implementation still has an
        // unresolved bug (silently falls back to looking identical to Buch
        // View) -- gated back off for EPUB rather than offering a mode that
        // doesn't actually work. epubReader.js's realistic-view code is
        // deliberately left in place as a starting point for a future
        // attempt; only this toggle is hidden. Buch/Scroll stay available.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();

        Assert.Contains("Buch", cut.Markup);
        Assert.Contains("Scroll", cut.Markup);
        Assert.DoesNotContain("Realistisch", cut.Markup);
    }

    [Fact]
    public void Reader_EpubFormat_PersistedRealisticMode_CoercedToBook()
    {
        // A "realistic" mode saved from before the toggle above was hidden
        // again would otherwise still reach EpubReader's ReaderMode
        // parameter and try to init the broken realistic view on every
        // load -- Reader.razor corrects an already-persisted value even
        // though the toggle itself is gone.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);
        var readerSettingsModule = JSInterop.SetupModule("./js/readerSettings.js");
        readerSettingsModule.Setup<string>("getReaderMode", _ => true).SetResult("realistic");
        var setReaderModeHandler = readerSettingsModule.SetupVoid("setReaderMode", _ => true);
        setReaderModeHandler.SetVoidResult();

        var epubModule = JSInterop.SetupModule("./js/epubReader.js");
        var initHandler = epubModule.SetupVoid("init", _ => true);
        initHandler.SetVoidResult();

        Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        var invocation = Assert.Single(initHandler.Invocations);
        Assert.Equal("book", invocation.Arguments[^1]);
        Assert.Contains(setReaderModeHandler.Invocations, i => i.Arguments[0] as string == "book");
    }

    [Fact]
    public void Reader_MarkdownHeading_GetsGitHubStyleSlugId()
    {
        // User-reported: a hand-written TOC's #kapitel-1--der-schleier-...
        // links (double hyphen, from a heading containing " – ") didn't work
        // -- Markdig's *default* auto-identifier slug collapses to a single
        // hyphen instead. AutoIdentifierOptions.GitHub matches what a TOC
        // written against GitHub's own markdown preview actually expects;
        // this pins that exact slug so a future pipeline change can't
        // silently regress it back to the single-hyphen default.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("MD"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "### Kapitel 1 – Der Schleier des Morgens", "text/markdown");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        Assert.Contains("id=\"kapitel-1--der-schleier-des-morgens\"", cut.Markup);
    }

    [Fact]
    public void Reader_TxtFormat_SplitsOnPageBreakMarker_IntoSeparateSegments()
    {
        // User-requested: a literal ---Seitenumbruch--- line forces a page
        // break in Book View (CSS break-after, see app.css), since plain
        // text has no other structure to hang one off. The marker itself
        // must not appear in the rendered text.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Erster Teil.\n---Seitenumbruch---\nZweiter Teil.", "text/plain");
        UseHandler(handler);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        var segments = cut.FindAll(".reader-content-txt-segment");
        Assert.Equal(2, segments.Count);
        Assert.Equal("Erster Teil.", segments[0].TextContent);
        Assert.Equal("Zweiter Teil.", segments[1].TextContent);
        Assert.DoesNotContain("Seitenumbruch", cut.Markup);
    }

    [Fact]
    public void Reader_TxtFormat_SettingsMenu_ShowsPagePerChapterCheckbox_OnlyInBookMode()
    {
        // Source follow-up to issue #155: a chapter longer than one
        // column-height page still spanned multiple pages under the flowed
        // layout (break-after:column only forces a break *after* a boundary,
        // not a cap on what's between two) -- "Seite pro Kapitel" is the
        // user-requested alternative mode. The checkbox only makes sense in
        // Book View (Scroll View already shows everything, scrolled).
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Hello.", "text/plain");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");
        JSInterop.SetupModule("./js/textPaginator.js").Setup<int>("init", _ => true).SetResult(1);

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();

        Assert.Contains("Seite pro Kapitel", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent == "Scroll").Click();

        Assert.DoesNotContain("Seite pro Kapitel", cut.Markup);
    }

    [Fact]
    public void Reader_TxtFormat_PagePerChapter_ShowsOneSegmentAtATime_AndNavigates()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("TXT"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "Erster Teil.\n---Seitenumbruch---\nZweiter Teil.", "text/plain");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");
        var paginatorModule = JSInterop.SetupModule("./js/textPaginator.js");
        paginatorModule.Setup<int>("init", _ => true).SetResult(1);
        paginatorModule.SetupVoid("destroy", _ => true).SetVoidResult();
        paginatorModule.SetupVoid("initChapterMode", _ => true).SetVoidResult();
        paginatorModule.SetupVoid("destroyChapterMode", _ => true).SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.Find("input[type=checkbox]").Change(true);

        var segments = cut.FindAll(".reader-content-txt-segment");
        Assert.Single(segments);
        Assert.Equal("Erster Teil.", segments[0].TextContent);
        Assert.Contains("Seite 1 / 2", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent == "Weiter ▶").Click();

        segments = cut.FindAll(".reader-content-txt-segment");
        Assert.Single(segments);
        Assert.Equal("Zweiter Teil.", segments[0].TextContent);
        Assert.Contains("Seite 2 / 2", cut.Markup);
    }

    [Fact]
    public void Reader_MdFormat_PagePerChapter_SplitsOnHr_AndShowsOneChapterAtATime()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("MD"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "# Kapitel 1\n\nErster Text.\n\n---\n\n# Kapitel 2\n\nZweiter Text.", "text/markdown");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");
        var paginatorModule = JSInterop.SetupModule("./js/textPaginator.js");
        paginatorModule.Setup<int>("init", _ => true).SetResult(1);
        paginatorModule.SetupVoid("destroy", _ => true).SetVoidResult();
        paginatorModule.SetupVoid("initChapterMode", _ => true).SetVoidResult();
        paginatorModule.SetupVoid("destroyChapterMode", _ => true).SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.Find("input[type=checkbox]").Change(true);

        Assert.Contains("Kapitel 1", cut.Markup);
        Assert.Contains("Erster Text.", cut.Markup);
        Assert.DoesNotContain("Kapitel 2", cut.Markup);
        Assert.Contains("Seite 1 / 2", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent == "Weiter ▶").Click();

        Assert.Contains("Kapitel 2", cut.Markup);
        Assert.Contains("Zweiter Text.", cut.Markup);
        Assert.DoesNotContain("Erster Text.", cut.Markup);
    }

    [Fact]
    public void Reader_MdFormat_PagePerChapter_TocLinkAcrossSegments_SwitchesToOwningSegment()
    {
        // The common case: a TOC lives in its own leading segment and links
        // to headings in *later* segments, which aren't in the DOM while
        // chapter mode only renders the current one -- textPaginator.js's
        // initChapterMode reports that back via OnChapterAnchorNotFound
        // (invoked here directly, standing in for the JS click interception
        // bUnit can't exercise for real).
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("MD"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "# TOC\n\n[Kapitel 2](#kapitel-2)\n\n---\n\n# Kapitel 1\n\nText.\n\n---\n\n# Kapitel 2\n\nZiel-Text.", "text/markdown");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");
        var paginatorModule = JSInterop.SetupModule("./js/textPaginator.js");
        paginatorModule.Setup<int>("init", _ => true).SetResult(1);
        paginatorModule.SetupVoid("destroy", _ => true).SetVoidResult();
        paginatorModule.SetupVoid("initChapterMode", _ => true).SetVoidResult();
        paginatorModule.SetupVoid("destroyChapterMode", _ => true).SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.Find("input[type=checkbox]").Change(true);

        Assert.Contains("Seite 1 / 3", cut.Markup);

        cut.InvokeAsync(() => cut.Instance.OnChapterAnchorNotFound("kapitel-2"));

        Assert.Contains("Seite 3 / 3", cut.Markup);
        Assert.Contains("Ziel-Text.", cut.Markup);
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

        // UseAutoIdentifiers (added for TOC anchor-link support, issue #155
        // follow-up) gives every heading a real id attribute now, so this can't
        // assert the exact literal "<h1>Heading</h1>" anymore.
        Assert.Contains("<h1 id=\"heading\">Heading</h1>", cut.Markup);
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
    public void Reader_EpubFrame_ArrowKeys_CallNextAndPrev()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);

        var epubModule = JSInterop.SetupModule("./js/epubReader.js");
        var nextHandler = epubModule.SetupVoid("next", _ => true);
        nextHandler.SetVoidResult();
        var prevHandler = epubModule.SetupVoid("prev", _ => true);
        prevHandler.SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        var frame = cut.Find(".epub-reader-frame");

        frame.KeyDown(new KeyboardEventArgs { Key = "ArrowRight" });
        Assert.Single(nextHandler.Invocations);

        frame.KeyDown(new KeyboardEventArgs { Key = "ArrowLeft" });
        Assert.Single(prevHandler.Invocations);
    }

    [Fact]
    public void Reader_ShowsEpubTableOfContents_AndNavigatesOnClick()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("EPUB"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake epub bytes", "application/epub+zip");
        UseHandler(handler);

        var epubModule = JSInterop.SetupModule("./js/epubReader.js");
        epubModule
            .Setup<List<TocItem>>("getToc", _ => true)
            .SetResult(
            [
                new TocItem { Label = "Kapitel 1", Href = "chapter1.xhtml", Level = 0 },
                new TocItem { Label = "Kapitel 2", Href = "chapter2.xhtml", Level = 0 },
            ]);
        epubModule.SetupVoid("goTo", _ => true).SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));

        var epubReader = cut.FindComponent<EpubReader>();
        epubReader.WaitForAssertion(() => Assert.Contains("📑 Inhaltsverzeichnis", epubReader.Markup), TimeSpan.FromSeconds(2));
        var tocToggle = cut.FindAll("button").Single(b => b.TextContent == "📑 Inhaltsverzeichnis");
        tocToggle.Click();

        Assert.Contains("Kapitel 1", cut.Markup);
        Assert.Contains("Kapitel 2", cut.Markup);

        cut.FindAll("button.epub-toc-item").First(b => b.TextContent == "Kapitel 2").Click();

        Assert.Single(JSInterop.Invocations["goTo"], inv => inv.Arguments.Contains("chapter2.xhtml"));
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
        // PDF gets a settings menu now (issue #174: the Book/Scroll View
        // toggle applies to PDF too), but font-size/family/line-height/
        // page-width still don't -- PDF has no text layout for them to act
        // on -- so those specific rows should be absent from the popover.
        Assert.Contains("reader-controls", cut.Markup);
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        Assert.Contains("Ansicht", cut.Markup);
        Assert.DoesNotContain("Schriftgröße", cut.Markup);
    }

    [Fact]
    public void Reader_PdfFormat_ScrollModeToggle_CallsSetFlow()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("PDF"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake pdf bytes", "application/pdf");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");

        var pdfModule = JSInterop.SetupModule("./js/pdfReader.js");
        pdfModule.Setup<int>("init", _ => true).SetResult(10);
        pdfModule.Setup<int>("getCurrentPage", _ => true).SetResult(1);
        pdfModule.SetupVoid("onScrolled", _ => true).SetVoidResult();
        var setFlowHandler = pdfModule.SetupVoid("setFlow", _ => true);
        setFlowHandler.SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.FindAll("button").Single(b => b.TextContent == "Scroll").Click();

        var invocation = Assert.Single(setFlowHandler.Invocations);
        Assert.Equal("scroll", invocation.Arguments[1]);
    }

    [Fact]
    public void Reader_PdfFormat_RealisticModeToggle_CallsSetFlowAndKeepsZoomControls()
    {
        // Issue #182, zoom added to Realistic View in a later follow-up
        // (user-requested: "möglichkeit alles größer zu machen"): StPageFlip's
        // book geometry is still fixed at init, but pdfReader.js's setZoom now
        // applies a CSS transform to the already-rendered container instead of
        // re-rendering -- so unlike the original design, the zoom controls
        // stay visible and usable in this mode too.
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("PDF"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake pdf bytes", "application/pdf");
        UseHandler(handler);
        JSInterop.SetupModule("./js/readerSettings.js").Setup<string>("getReaderMode", _ => true).SetResult("book");

        var pdfModule = JSInterop.SetupModule("./js/pdfReader.js");
        pdfModule.Setup<int>("init", _ => true).SetResult(10);
        pdfModule.Setup<int>("getCurrentPage", _ => true).SetResult(1);
        pdfModule.SetupVoid("onScrolled", _ => true).SetVoidResult();
        var setFlowHandler = pdfModule.SetupVoid("setFlow", _ => true);
        setFlowHandler.SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        Assert.Contains("pdf-reader-zoom", cut.Markup);

        cut.FindAll("button").Single(b => b.TextContent == "⚙ Einstellungen").Click();
        cut.FindAll("button").Single(b => b.TextContent == "Realistisch").Click();

        var invocation = Assert.Single(setFlowHandler.Invocations);
        Assert.Equal("realistic", invocation.Arguments[1]);
        Assert.Contains("pdf-reader-zoom", cut.Markup);
    }

    [Fact]
    public void Reader_PdfViewport_ArrowKeys_CallNextAndPrev()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/books/1", BookJson("PDF"))
            .WhenPathEndsWith("/api/reading/1", NoProgressJson)
            .WhenPathEndsWith("/api/books/1/file", "fake pdf bytes", "application/pdf");
        UseHandler(handler);

        var pdfModule = JSInterop.SetupModule("./js/pdfReader.js");
        pdfModule.Setup<int>("init", _ => true).SetResult(10);
        pdfModule.Setup<int>("getCurrentPage", _ => true).SetResult(1);
        var nextHandler = pdfModule.SetupVoid("next", _ => true);
        nextHandler.SetVoidResult();
        var prevHandler = pdfModule.SetupVoid("prev", _ => true);
        prevHandler.SetVoidResult();

        var cut = Render<Reader>(parameters => parameters.Add(p => p.Id, 1));
        var viewport = cut.Find(".pdf-reader-viewport");

        viewport.KeyDown(new KeyboardEventArgs { Key = "ArrowRight" });
        Assert.Single(nextHandler.Invocations);

        viewport.KeyDown(new KeyboardEventArgs { Key = "ArrowLeft" });
        Assert.Single(prevHandler.Invocations);
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
