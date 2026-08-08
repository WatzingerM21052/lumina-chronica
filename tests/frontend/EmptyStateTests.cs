using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class EmptyStateTests : BunitContext
{
    [Fact]
    public void EmptyState_Plain_RendersMessageOnly_NoOrnamentNoLiteraryClass()
    {
        var cut = Render<EmptyState>(parameters => parameters
            .Add(p => p.Message, "Noch keine Bücher."));

        Assert.Empty(cut.FindAll(".empty-state-ornament"));
        Assert.DoesNotContain("empty-state-literary", cut.Find(".empty-state").ClassList);
        Assert.Contains("Noch keine Bücher.", cut.Markup);
    }

    [Fact]
    public void EmptyState_WithOrnament_AddsLiteraryClassAndRendersGlyph()
    {
        var cut = Render<EmptyState>(parameters => parameters
            .Add(p => p.Message, "Dieses Regal wartet noch auf seinen ersten Eintrag.")
            .Add(p => p.Ornament, "❦"));

        Assert.Contains("empty-state-literary", cut.Find(".empty-state").ClassList);
        Assert.Equal("❦", cut.Find(".empty-state-ornament").TextContent);
    }

    [Fact]
    public void EmptyState_ActionHref_RendersLinkNotButton()
    {
        var cut = Render<EmptyState>(parameters => parameters
            .Add(p => p.Message, "Beginne deine Sammlung.")
            .Add(p => p.ActionText, "Buch hinzufügen")
            .Add(p => p.ActionHref, "library/upload"));

        var link = cut.Find("a.btn");
        Assert.Equal("library/upload", link.GetAttribute("href"));
        Assert.Empty(cut.FindAll("button"));
    }

    [Fact]
    public void EmptyState_OnAction_RendersButton_AndInvokesCallback()
    {
        var invoked = false;
        var cut = Render<EmptyState>(parameters => parameters
            .Add(p => p.Message, "Leer.")
            .Add(p => p.ActionText, "Erneut versuchen")
            .Add(p => p.OnAction, () => invoked = true));

        cut.Find("button").Click();

        Assert.True(invoked);
    }

    [Fact]
    public void EmptyState_NoActionTextOrHref_RendersNeitherButtonNorLink()
    {
        var cut = Render<EmptyState>(parameters => parameters
            .Add(p => p.Message, "Leer."));

        Assert.Empty(cut.FindAll("button"));
        Assert.Empty(cut.FindAll("a"));
    }
}
