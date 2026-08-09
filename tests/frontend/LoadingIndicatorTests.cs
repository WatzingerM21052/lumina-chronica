using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LoadingIndicatorTests : BunitContext
{
    [Fact]
    public void Default_SectionMode_RendersRing_NoIllustration()
    {
        var cut = Render<LoadingIndicator>(parameters => parameters
            .Add(p => p.Text, "Bibliothek wird geladen..."));

        Assert.NotEmpty(cut.FindAll("svg.loading-progress"));
        Assert.Empty(cut.FindAll("img.loading-illustration"));
    }

    [Fact]
    public void PageMode_LibraryType_RendersArchivistIllustration_NoRing()
    {
        var cut = Render<LoadingIndicator>(parameters => parameters
            .Add(p => p.Mode, LoadingIndicatorMode.Page)
            .Add(p => p.Type, LoadingIndicatorType.Library)
            .Add(p => p.Text, "Bibliothek wird geladen..."));

        var img = cut.Find("img.loading-illustration");
        Assert.Equal("images/mascot/optimized/lumina-archivist.webp", img.GetAttribute("src"));
        Assert.Empty(cut.FindAll("svg.loading-progress"));
    }

    [Fact]
    public void FullscreenMode_LibraryType_RendersArchivistIllustration()
    {
        var cut = Render<LoadingIndicator>(parameters => parameters
            .Add(p => p.Mode, LoadingIndicatorMode.Fullscreen)
            .Add(p => p.Type, LoadingIndicatorType.Library));

        Assert.NotEmpty(cut.FindAll("img.loading-illustration"));
    }

    [Fact]
    public void PageMode_NonLibraryType_HasNoDeliveredAsset_FallsBackToRing()
    {
        var cut = Render<LoadingIndicator>(parameters => parameters
            .Add(p => p.Mode, LoadingIndicatorMode.Page)
            .Add(p => p.Type, LoadingIndicatorType.Search));

        Assert.Empty(cut.FindAll("img.loading-illustration"));
        Assert.NotEmpty(cut.FindAll("svg.loading-progress"));
    }

    [Fact]
    public void PageMode_ReadingType_RendersReaderIllustration_NoRing()
    {
        var cut = Render<LoadingIndicator>(parameters => parameters
            .Add(p => p.Mode, LoadingIndicatorMode.Page)
            .Add(p => p.Type, LoadingIndicatorType.Reading));

        var img = cut.Find("img.loading-illustration");
        Assert.Equal("images/mascot/optimized/lumina-reader.webp", img.GetAttribute("src"));
        Assert.Empty(cut.FindAll("svg.loading-progress"));
    }
}
