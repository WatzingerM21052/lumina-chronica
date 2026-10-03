using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class EntityCardTests : BunitContext
{
    public EntityCardTests()
    {
        var handler = new FakeHttpMessageHandler("""{"success":false,"error":{"code":"NOT_FOUND","message":"not found"}}""");
        Services.AddSingleton(new HttpClient(handler) { BaseAddress = new Uri("http://localhost/") });
        Services.AddSingleton<ApiClient>();
        Services.AddSingleton<II18nService, FakeI18nService>();
        Services.AddSingleton<BlobUrlService>();
    }

    // User report: long fields made character cards endless. The card shows
    // one line of age · origin and a capped two-line description.
    [Fact]
    public void CharacterCard_ShowsNameMetaAndACappedExcerpt()
    {
        var character = new Character
        {
            Id = 3, ProjectId = 2, Name = "Aldous Marrow", Age = "älter", Origin = "Wrenmoor Akademie, Greywick",
            Description = new string('x', 600),
        };

        var cut = Render<CharacterCard>(p => p.Add(x => x.Character, character));

        Assert.Equal("projects/2/characters/3", cut.Find("a.entity-card").GetAttribute("href"));
        Assert.Equal("Aldous Marrow", cut.Find(".entity-card-title").TextContent);
        Assert.Equal("älter · Wrenmoor Akademie, Greywick", cut.Find(".entity-card-meta").TextContent);
        var excerpt = cut.Find(".entity-card-excerpt").TextContent;
        Assert.True(excerpt.Length <= TextExcerpt.DefaultLength + 1, $"excerpt was {excerpt.Length} characters");
        Assert.EndsWith("…", excerpt);
        Assert.Equal("AM", cut.Find(".entity-card-initials").TextContent);
    }

    [Fact]
    public void CharacterCard_WithoutOptionalFields_RendersNoEmptyLines()
    {
        var cut = Render<CharacterCard>(p => p.Add(x => x.Character, new Character { Id = 1, ProjectId = 1, Name = "Bram" }));

        Assert.Empty(cut.FindAll(".entity-card-meta"));
        Assert.Empty(cut.FindAll(".entity-card-excerpt"));
    }

    // Lore previews are Markdown turned into text: no "##", no "**".
    [Fact]
    public void LoreEntryCard_PreviewIsPlainTextFromMarkdown()
    {
        var entry = new LoreEntry { Id = 5, ProjectId = 2, Title = "Die Kanäle", Content = "## Herkunft\n\nDie **Kanäle** folgen <b>den</b> Sternen." };

        var cut = Render<LoreEntryCard>(p => p.Add(x => x.Entry, entry));

        var excerpt = cut.Find(".entity-card-excerpt").TextContent;
        Assert.DoesNotContain("#", excerpt);
        Assert.DoesNotContain("*", excerpt);
        Assert.Contains("Kanäle folgen", excerpt);
        Assert.Empty(cut.FindAll(".entity-card-excerpt b"));
    }

    [Fact]
    public void TextExcerpt_CollapsesWhitespaceAndCaps()
    {
        Assert.Null(TextExcerpt.Of("   "));
        Assert.Equal("a b c", TextExcerpt.Of("a\n\n b\tc"));
        Assert.Equal("abc…", TextExcerpt.Of("abcdef", 3));
        Assert.Equal("41 · Greywick", TextExcerpt.Join("41", null, " Greywick "));
    }
}
