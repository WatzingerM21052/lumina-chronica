using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryRoomTests : BunitContext
{
    private static readonly List<ShelfSection> Sections =
    [
        new("Zuletzt gelesen", ShelfSectionKind.Recent, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }], new Dictionary<int, double> { [1] = 80 }),
        new("Fantasy", ShelfSectionKind.Genre, [new Book { Id = 1, Title = "Momo", Author = "Michael Ende" }, new Book { Id = 2, Title = "Krabat" }]),
    ];

    public LibraryRoomTests()
    {
        Services.AddSingleton(new HttpClient(new FakeHttpMessageHandler("{}")) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<CoverColorService>();
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    [Fact]
    public void WithoutWebGl_TheClassicShelfStandsIn()
    {
        JSInterop.SetupModule("./js/libraryRoom/index.js").Setup<bool>("supported").SetResult(false);

        var cut = Render<LibraryRoom>(p => p.Add(x => x.Sections, Sections));

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".classic-shelf")));
        Assert.Contains("klassische Regal", cut.Find(".library-room-fallback").TextContent);
    }

    [Fact]
    public void WithWebGl_ListsCasesAndBooks_AndOpensWhatTheSceneReports()
    {
        var module = JSInterop.SetupModule("./js/libraryRoom/index.js");
        module.Setup<bool>("supported").SetResult(true);
        var goTo = module.SetupVoid("goTo", _ => true);
        var pick = module.SetupVoid("pickBook", _ => true);
        BookOpenRequest? opened = null;

        var cut = Render<LibraryRoom>(p => p.Add(x => x.Sections, Sections).Add(x => x.OnOpen, (BookOpenRequest r) => opened = r));

        Assert.Equal(["Zuletzt gelesen", "Fantasy"], cut.FindAll(".library-room-case").Select(b => b.TextContent.Trim()));
        Assert.Equal(3, cut.FindAll(".library-room-index a").Count);

        cut.FindAll(".library-room-case")[1].Click();
        Assert.Equal(1, Assert.Single(goTo.Invocations).Arguments[1]);

        cut.FindAll(".library-room-index a")[2].Click();
        Assert.Equal(2, Assert.Single(pick.Invocations).Arguments[1]);

        cut.InvokeAsync(() => cut.Instance.Open(1, 10, 20, 30, 40));
        Assert.Equal(80, opened!.Progress);
        Assert.Equal(new BookSpreadSource(null, 10, 20, 30, 40), opened.Source);
    }

    [Fact]
    public void CaseChanged_MarksTheCase_AndShowsTheWayBack()
    {
        JSInterop.SetupModule("./js/libraryRoom/index.js").Setup<bool>("supported").SetResult(true);
        var cut = Render<LibraryRoom>(p => p.Add(x => x.Sections, Sections));
        Assert.Empty(cut.FindAll(".library-room-home"));

        cut.InvokeAsync(() => cut.Instance.CaseChanged(1));

        Assert.Equal("true", cut.FindAll(".library-room-case")[1].GetAttribute("aria-pressed"));
        Assert.NotEmpty(cut.FindAll(".library-room-home"));
    }

    [Fact]
    public void OldRoomAndRotundaChoices_BecomeTheLibrary()
    {
        Assert.Equal(ShelfStyles.Library, ShelfStyles.Normalize("room"));
        Assert.Equal(ShelfStyles.Library, ShelfStyles.Normalize("rotunda"));
        Assert.Equal([ShelfStyles.Classic, ShelfStyles.Leather, ShelfStyles.Library, ShelfStyles.Legacy], ShelfStyles.Available);
    }
}
