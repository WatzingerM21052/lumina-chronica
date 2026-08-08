using Bunit;
using LuminaChronica.Client.Components;
using Microsoft.AspNetCore.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

// CatalogCard (issue #315/#339) is the shared "catalog entry" primitive for
// PUBLIC-facing book/project cards (Discover.razor, PublicProfile.razor) --
// deliberately no owner-only behavior (no favorite/edit/delete/shelf
// picker), unlike BookCard/ProjectCard which stay private-library-only.
public class CatalogCardTests : BunitContext
{
    [Fact]
    public void CatalogCard_RendersTitleAndSubtitle()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "The Hobbit")
            .Add(p => p.Subtitle, "J.R.R. Tolkien"));

        Assert.Contains("The Hobbit", cut.Markup);
        Assert.Contains("J.R.R. Tolkien", cut.Markup);
    }

    [Fact]
    public void CatalogCard_NullHref_RendersNonInteractiveAnchor()
    {
        // Matches BookCard's existing Href-fallback convention: an <a> with
        // no href renders as a plain, non-clickable container -- used when
        // the viewer can't actually open the item yet.
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Locked Book")
            .Add(p => p.Href, (string?)null));

        Assert.False(cut.Find("a.catalog-card").HasAttribute("href"));
    }

    [Fact]
    public void CatalogCard_Href_RendersAsLink()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Readable Book")
            .Add(p => p.Href, "library/books/1"));

        Assert.Equal("library/books/1", cut.Find("a.catalog-card").GetAttribute("href"));
    }

    [Fact]
    public void CatalogCard_NoOwnerUsername_HidesOwnerLine()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book"));

        Assert.Empty(cut.FindAll(".catalog-card-owner"));
    }

    [Fact]
    public void CatalogCard_OwnerUsername_RendersClickableOwnerLink_ThatInvokesCallback()
    {
        string? clicked = null;
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book")
            .Add(p => p.OwnerUsername, "alice")
            .Add(p => p.OnOwnerClick, (string username) => clicked = username));

        cut.Find(".catalog-card-owner-link").Click();

        Assert.Equal("alice", clicked);
    }

    // Issue #341 a11y audit -- a plain @onclick-only <span> is invisible to
    // Tab and can't be activated without a mouse. tabindex + role="link" +
    // an Enter-key handler make it a real keyboard-operable control.
    [Fact]
    public void CatalogCard_OwnerLink_IsKeyboardOperable()
    {
        string? clicked = null;
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book")
            .Add(p => p.OwnerUsername, "alice")
            .Add(p => p.OnOwnerClick, (string username) => clicked = username));

        var link = cut.Find(".catalog-card-owner-link");
        Assert.Equal("0", link.GetAttribute("tabindex"));
        Assert.Equal("link", link.GetAttribute("role"));

        link.KeyDown(new Microsoft.AspNetCore.Components.Web.KeyboardEventArgs { Key = "Enter" });
        Assert.Equal("alice", clicked);
    }

    [Fact]
    public void CatalogCard_Book_ShowsRating_WhenRatingCountPositive()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book")
            .Add(p => p.RatingAverage, 4.5)
            .Add(p => p.RatingCount, 2));

        Assert.Contains("4.5", cut.Markup);
        Assert.Contains("· 2", cut.Markup);
    }

    [Fact]
    public void CatalogCard_Book_ShowsNoRatingsMessage_WhenRatingCountZero()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book")
            .Add(p => p.RatingCount, 0));

        Assert.Contains("Noch keine Bewertungen", cut.Markup);
    }

    [Fact]
    public void CatalogCard_ShowRatingFalse_HidesRatingEntirely()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book")
            .Add(p => p.ShowRating, false)
            .Add(p => p.RatingCount, 5));

        Assert.Empty(cut.FindAll(".catalog-card-rating"));
    }

    [Fact]
    public void CatalogCard_Project_ShowsTypeLabel_NotRating()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "project")
            .Add(p => p.Title, "Nyxara")
            .Add(p => p.TypeLabel, "Worldbuilding")
            .Add(p => p.RatingCount, 5));

        Assert.Contains("Worldbuilding", cut.Markup);
        Assert.Empty(cut.FindAll(".catalog-card-rating"));
    }

    [Fact]
    public void CatalogCard_FooterContent_Renders()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book")
            .Add(p => p.FooterContent, (RenderFragment)(builder => builder.AddContent(0, "Anmelden zum Lesen"))));

        Assert.Contains("Anmelden zum Lesen", cut.Markup);
    }

    [Fact]
    public void CatalogCard_NoCoverUrl_RendersPlaceholderIcon_NotEmoji()
    {
        var cut = Render<CatalogCard>(parameters => parameters
            .Add(p => p.Kind, "book")
            .Add(p => p.Title, "Book"));

        Assert.NotEmpty(cut.FindAll(".catalog-card-cover-placeholder svg"));
    }
}
