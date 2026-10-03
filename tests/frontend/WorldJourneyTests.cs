using System.Globalization;
using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The immersive Home of the Babylon and Alexandria themes (WorldJourney):
// every chapter is plain markup with its numbers worked out in C#, so the
// journey reads the same without journey.js.
public class WorldJourneyTests : BunitContext
{
    private const string EmptyListJson = """{"success":true,"data":[]}""";

    public WorldJourneyTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private void UseServices(RoutedFakeHttpMessageHandler? handler = null)
    {
        handler ??= new RoutedFakeHttpMessageHandler();
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
    }

    private static string DaysAgo(int days) => DateTime.UtcNow.Date.AddDays(-days).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DashboardResponse ReadingDashboard() => new()
    {
        ContinueReading =
        [
            new ContinueReadingItem { Book = new Book { Id = 7, Title = "Dune", Author = "Frank Herbert" }, Percentage = 50, LastOpened = "2020-01-01 10:00:00" },
            new ContinueReadingItem { Book = new Book { Id = 8, Title = "Emma", Author = "Jane Austen" }, Percentage = 30, LastOpened = "2020-01-01 10:00:00" },
        ],
        Overview = new DashboardOverview { TotalBooks = 3, FinishedBooks = 1, TotalFavorites = 0 },
    };

    [Fact]
    public void Journey_ContinueReading_ShowsTheBookItsPageAndTheOthersInProgress()
    {
        UseServices();

        var cut = Render<WorldJourney>(p => p
            .Add(x => x.World, "babylon")
            .Add(x => x.Dashboard, ReadingDashboard())
            .Add(x => x.FeaturedPages, 400));

        Assert.Equal("Dune", cut.Find("#journey-reading-title").TextContent);
        Assert.Equal("200", cut.Find(".journey-count strong").TextContent);
        Assert.Contains("/ 400 Seiten", cut.Find(".journey-count").TextContent);
        Assert.Equal("library/books/7/read", cut.Find("a.journey-book").GetAttribute("href"));
        var other = Assert.Single(cut.FindAll(".journey-sat"));
        Assert.Contains("Emma", other.TextContent);
        Assert.Contains("30 %", other.TextContent);
        // Babylon dresses the scene with the clay tablet, Alexandria with the lamp.
        Assert.NotEmpty(cut.FindAll(".journey-object--tablet"));
        Assert.Empty(cut.FindAll(".journey-object--lamp"));
    }

    [Fact]
    public void Journey_Goal_Babylon_IsARosetteWithOnePetalPerBook_TheReadOnesLit()
    {
        UseServices();

        var cut = Render<WorldJourney>(p => p
            .Add(x => x.World, "babylon")
            .Add(x => x.Dashboard, ReadingDashboard())
            .Add(x => x.Goal, new ReadingGoal { TargetBooks = 12, BooksFinishedThisYear = 5 }));

        var fields = cut.FindAll(".journey-field");
        Assert.Equal(12, fields.Count);
        Assert.Equal(5, cut.FindAll(".journey-field.is-lit").Count);
        Assert.Contains("5", cut.Find(".journey-goal-number").TextContent);
        Assert.Contains("von 12", cut.Find(".journey-goal-number").TextContent);
        Assert.Equal("5 Blätter der Rosette leuchten", cut.Find("#journey-goal-title").TextContent);
        Assert.NotEmpty(cut.FindAll(".journey-rosette-core"));
        // Each field carries its info card; the next open one names the book
        // in progress.
        Assert.Equal("Buch 1 von 12", fields[0].GetAttribute("data-tip-title"));
        Assert.Equal("Gelesen", fields[0].GetAttribute("data-tip-main"));
        Assert.Equal("Als Nächstes: Dune", fields[5].GetAttribute("data-tip-main"));
        Assert.Equal("50 % gelesen", fields[5].GetAttribute("data-tip-note"));
        Assert.Equal("Noch offen", fields[6].GetAttribute("data-tip-main"));
    }

    [Fact]
    public void Journey_Goal_Alexandria_IsARingAroundTheAstrolabe_WithTheMonths()
    {
        UseServices();

        var cut = Render<WorldJourney>(p => p
            .Add(x => x.World, "alexandria")
            .Add(x => x.Goal, new ReadingGoal { TargetBooks = 12, BooksFinishedThisYear = 1 }));

        Assert.Equal(12, cut.FindAll(".journey-field").Count);
        Assert.Empty(cut.FindAll(".journey-rosette-core"));
        Assert.Equal("images/themes/alexandria/astrolabe_disc.webp", cut.Find(".journey-astrolabe").GetAttribute("src"));
        Assert.Equal(12, cut.FindAll(".journey-dial-ticks text").Count);
        Assert.Equal("Ein Segment des Astrolabiums ist gesetzt", cut.Find("#journey-goal-title").TextContent);
    }

    [Fact]
    public void Journey_Goal_WithoutATarget_InvitesToSetOne()
    {
        UseServices();

        var cut = Render<WorldJourney>(p => p.Add(x => x.World, "babylon").Add(x => x.Goal, new ReadingGoal()));

        Assert.Empty(cut.FindAll(".journey-field"));
        Assert.Equal("statistics", cut.Find(".journey-goal-copy a.journey-cta").GetAttribute("href"));
    }

    [Fact]
    public void Journey_Sky_HasAStarPerDay_LinksReadingDaysInAWeek_AndMarksTheBestDay()
    {
        UseServices();
        // Three days in a row in the current week would cross week starts on
        // a Monday, so the facts are checked, not the exact line count.
        var days = new List<CalendarDay>
        {
            new() { Date = DaysAgo(1), Count = 1, Pages = 30, Books = ["Dune"] },
            new() { Date = DaysAgo(2), Count = 1, Pages = 70, Books = ["Dune", "Emma"] },
            new() { Date = DaysAgo(3), Count = 1, Pages = 10, Books = ["Emma"] },
            new() { Date = DaysAgo(400), Count = 1, Pages = 500, Books = ["Old"] },
        };

        var cut = Render<WorldJourney>(p => p.Add(x => x.World, "babylon").Add(x => x.CalendarDays, days));

        var today = DateTime.UtcNow.Date;
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var expectedStars = (today - monday.AddDays(-7 * (WorldJourney.SkyWeeks - 1))).Days + 1;
        Assert.Equal(expectedStars, cut.FindAll(".journey-star").Count);
        // The 500-page day lies outside the 34 weeks: not the best, not counted.
        var best = Assert.Single(cut.FindAll(".journey-star.is-best"));
        Assert.Equal("70 Seiten", best.GetAttribute("data-tip-main"));
        Assert.Equal("Dune · Emma", best.GetAttribute("data-tip-text"));
        Assert.Equal(3, cut.FindAll(".journey-star--1, .journey-star--2, .journey-star--4").Count);
        var facts = cut.FindAll(".journey-facts strong").Select(f => f.TextContent).ToList();
        Assert.Equal(["110", "3", "3", "37"], facts);
        Assert.NotEmpty(cut.FindAll(".journey-constellation"));
    }

    [Fact]
    public void Journey_Library_ShowsCountsAndUpToThreeBooks()
    {
        UseServices();
        var books = Enumerable.Range(1, 5).Select(i => new Book { Id = i, Title = $"Buch {i}", Author = "A" }).ToList();

        var cut = Render<WorldJourney>(p => p
            .Add(x => x.World, "alexandria")
            .Add(x => x.Dashboard, ReadingDashboard())
            .Add(x => x.Books, books));

        Assert.Equal(3, cut.FindAll(".journey-tome").Count);
        Assert.Equal("library/books/1", cut.Find(".journey-tome").GetAttribute("href"));
        Assert.Equal(["3", "1", "0"], cut.FindAll(".journey-library-stats strong").Select(s => s.TextContent).ToList());
        Assert.Equal("Was in den Regalen ruht", cut.Find("#journey-library-title").TextContent);
        Assert.NotEmpty(cut.FindAll(".journey-niche"));
    }

    [Fact]
    public void Journey_World_ShowsTheNewestProjectWithItsCountsAndLatestEvent()
    {
        var handler = new RoutedFakeHttpMessageHandler()
            .WhenPathEndsWith("/api/projects/4/characters", """{"success":true,"data":[{"id":1},{"id":2}]}""")
            .WhenPathEndsWith("/api/projects/4/locations", """{"success":true,"data":[{"id":1}]}""")
            .WhenPathEndsWith("/api/projects/4/timeline", """{"success":true,"data":[{"id":3,"projectId":4,"title":"Gründung","date":"Jahr 0","order":0,"createdAt":""},{"id":9,"projectId":4,"title":"Fund der Tafel","date":"Jahr 1205","description":"Im dritten Kanal.","order":1,"createdAt":""}]}""")
            .WhenPathEndsWith("/api/projects/4/lore", EmptyListJson)
            .WhenPathEndsWith("/api/projects/4/books", EmptyListJson)
            .WhenPathEndsWith("/api/projects/4/files", """{"success":true,"data":[{"id":1},{"id":2},{"id":3}]}""");
        UseServices(handler);

        var cut = Render<WorldJourney>(p => p
            .Add(x => x.World, "babylon")
            .Add(x => x.Projects, [new Project { Id = 4, Title = "Die Gärten von Nimrud", Description = "Terrassen und Kanäle", Type = "WORLD" }]));

        cut.WaitForAssertion(() => Assert.Equal(6, cut.FindAll(".journey-world-facts a").Count));
        Assert.Equal("Die Gärten von Nimrud", cut.Find("#journey-world-title").TextContent);
        Assert.Equal(["2", "1", "2", "0", "0", "3"], cut.FindAll(".journey-world-facts strong").Select(s => s.TextContent).ToList());
        Assert.Contains("Jahr 1205: Fund der Tafel. Im dritten Kanal.", cut.Find(".journey-chronicle-text").TextContent);
        Assert.Equal("projects/4", cut.Find(".journey-world-row a.journey-cta").GetAttribute("href"));
        // No cover of its own: the world's painting stands in.
        Assert.Contains("is-fallback", cut.Find(".journey-world-image").ClassName);
    }

    [Fact]
    public void Journey_Finale_LeadsToTheAppsPages()
    {
        UseServices();

        var cut = Render<WorldJourney>(p => p.Add(x => x.World, "babylon").Add(x => x.Dashboard, ReadingDashboard()));

        Assert.Equal(["library", "projects", "statistics", "discover"], cut.FindAll(".journey-door").Select(d => d.GetAttribute("href")).ToList());
        Assert.Contains("3 Bücher, 1 davon gelesen", cut.Find(".journey-door").TextContent);
    }
}
