using Bunit;
using LuminaChronica.Client.Models;
using LuminaChronica.Client.Pages;
using LuminaChronica.Client.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class OfflineLibraryPageTests : BunitContext
{
    public OfflineLibraryPageTests()
    {
        Services.AddSingleton<OfflineStorageService>();
    }

    [Fact]
    public void OfflineLibrary_ShowsEmptyState_WhenNothingSaved()
    {
        JSInterop.SetupModule("./js/offlineStorage.js")
            .Setup<List<OfflineBookSummary>>("listBooks", _ => true)
            .SetResult([]);

        var cut = Render<OfflineLibrary>();

        Assert.Contains("Noch keine Bücher offline gespeichert.", cut.Markup);
    }

    [Fact]
    public void OfflineLibrary_ListsSavedBooksWithTotalSize()
    {
        JSInterop.SetupModule("./js/offlineStorage.js")
            .Setup<List<OfflineBookSummary>>("listBooks", _ => true)
            .SetResult(
            [
                new OfflineBookSummary { Id = 1, Title = "Dune", Author = "Frank Herbert", Format = "EPUB", SizeBytes = 1024 * 1024, SavedAt = "2026-08-01T00:00:00Z" },
                new OfflineBookSummary { Id = 2, Title = "Foundation", Author = "Isaac Asimov", Format = "PDF", SizeBytes = 2 * 1024 * 1024, SavedAt = "2026-08-02T00:00:00Z" },
            ]);

        var cut = Render<OfflineLibrary>();

        Assert.Contains("Dune", cut.Markup);
        Assert.Contains("Foundation", cut.Markup);
        Assert.Contains("3.0 MB", cut.Markup);
    }

    [Fact]
    public void OfflineLibrary_RemoveButton_CallsDeleteBook()
    {
        var module = JSInterop.SetupModule("./js/offlineStorage.js");
        module.Setup<List<OfflineBookSummary>>("listBooks", _ => true).SetResult(
        [
            new OfflineBookSummary { Id = 1, Title = "Dune", Author = "Frank Herbert", Format = "EPUB", SizeBytes = 1024, SavedAt = "2026-08-01T00:00:00Z" },
        ]);
        var deleteHandler = module.SetupVoid("deleteBook", _ => true);
        deleteHandler.SetVoidResult();

        var cut = Render<OfflineLibrary>();
        cut.Find("button").Click();

        var invocation = Assert.Single(deleteHandler.Invocations);
        Assert.Equal(1, Convert.ToInt32(invocation.Arguments[0]));
    }
}
