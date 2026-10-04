using Bunit;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

// The public page of a PUBLIC project (ProjectWorld, /projects/{id}/view):
// its world read-only for every visitor; entries open in a dialog.
public class ProjectWorldPageTests : BunitContext
{
    private const string WorldJson = """
        {"success":true,"data":{"id":4,"title":"Die Gärten von Nimrud","description":"Terrassen und Kanäle","type":"WORLD","coverUrl":null,
          "ownerUsername":"alice","createdAt":"2026-01-01",
          "characters":[{"id":7,"name":"Aldous","age":"20","origin":"Greywick","description":"Ein Kartograf.","personality":"Gewissenhaft.","biography":null,"imageUrl":null},
                        {"id":8,"name":"Ilvane","age":null,"origin":null,"description":null,"personality":null,"biography":null,"imageUrl":null}],
          "relationships":[{"characterAId":7,"characterBId":8,"relationshipType":"Schüler von","description":null}],
          "locations":[{"id":3,"name":"Hafen der Sterne","description":"Am Rand der Gärten.","imageUrl":null}],
          "timeline":[{"id":1,"title":"Gründung","date":"Jahr 0","description":null}],
          "lore":[{"id":5,"title":"Kanäle","content":"## Wasser\nfließt <script>x</script>"}],
          "books":[{"id":19,"title":"Salz und Sternenlicht","author":"Lena Kovač","coverUrl":null}]}}
        """;

    public ProjectWorldPageTests()
    {
        JSInterop.Mode = JSRuntimeMode.Loose;
    }

    private void UseRoutes(RoutedFakeHttpMessageHandler handler)
    {
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<BlobUrlService>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<IThemeService>(new FakeThemeService("classic-library"));
    }

    [Fact]
    public void ProjectWorld_ShowsTheWorldReadOnly_WithoutAnyEditingControls()
    {
        UseRoutes(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/api/projects/4/public", WorldJson));

        var cut = Render<ProjectWorld>(p => p.Add(x => x.Id, 4));

        cut.WaitForAssertion(() => Assert.Equal("Die Gärten von Nimrud", cut.Find("h1").TextContent));
        Assert.Equal("u/alice", cut.Find(".back-link").GetAttribute("href"));
        Assert.Equal(2, cut.FindAll(".entity-card--character").Count);
        Assert.Single(cut.FindAll(".entity-card--location"));
        Assert.Contains("Gründung", cut.Find(".public-timeline").TextContent);
        Assert.Single(cut.FindAll(".entity-card--lore"));
        Assert.Equal("library/books/19", cut.Find("a.catalog-card").GetAttribute("href"));
        // Nothing to change here: no edit, delete or add controls.
        Assert.Empty(cut.FindAll(".btn-icon-danger, #project-edit-button, .btn-primary"));
    }

    [Fact]
    public void ProjectWorld_ACharacter_OpensWithItsFullTextAndRelationships()
    {
        UseRoutes(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/api/projects/4/public", WorldJson));
        var cut = Render<ProjectWorld>(p => p.Add(x => x.Id, 4));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".entity-card--character")));

        cut.FindAll(".entity-card--character")[0].Click();

        Assert.Equal("Aldous", cut.Find(".dialog-title").TextContent.Trim());
        Assert.Contains("Gewissenhaft.", cut.Find(".public-entry").TextContent);
        Assert.Contains("Schüler von", cut.Find(".public-entry-relations").TextContent);

        // The other character in the relationship opens from there.
        cut.Find(".public-entry-relations button").Click();
        Assert.Equal("Ilvane", cut.Find(".dialog-title").TextContent.Trim());
    }

    [Fact]
    public void ProjectWorld_LoreMarkdown_RendersWithoutRawHtml()
    {
        UseRoutes(new RoutedFakeHttpMessageHandler().WhenPathEndsWith("/api/projects/4/public", WorldJson));
        var cut = Render<ProjectWorld>(p => p.Add(x => x.Id, 4));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll(".entity-card--lore")));

        cut.Find(".entity-card--lore").Click();

        Assert.NotNull(cut.Find(".lore-content h2"));
        Assert.Empty(cut.FindAll(".lore-content script"));
    }

    [Fact]
    public void ProjectWorld_APrivateOrMissingProject_SaysSo()
    {
        UseRoutes(new RoutedFakeHttpMessageHandler().When(_ => true, _ => RoutedFakeHttpMessageHandler.JsonResponse("""{"success":false,"error":{"code":"NOT_FOUND","message":"Project not found."}}""")));

        var cut = Render<ProjectWorld>(p => p.Add(x => x.Id, 9));

        cut.WaitForAssertion(() => Assert.Contains("nicht öffentlich", cut.Markup));
    }
}
