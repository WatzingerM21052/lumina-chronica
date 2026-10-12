using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class RotundaLayoutTests
{
    private static List<Book> Books(int from, int n) => Enumerable.Range(from, n).Select(i => new Book { Id = i, Title = $"B{i}" }).ToList();

    private static double Used(IEnumerable<Book> row) =>
        row.Sum(b => RotundaLayout.SpineSize(b).Width) + RotundaLayout.Gap * (row.Count() - 1);

    [Fact]
    public void SpineSize_StaysInTheBaysScale()
    {
        foreach (var book in Books(1, 200))
        {
            var size = RotundaLayout.SpineSize(book);
            Assert.InRange(size.Width, 16, 30);
            Assert.InRange(size.Height, 100, 138);
        }
    }

    [Fact]
    public void SmallLibrary_StillFillsTheRing_WithEmptyBays()
    {
        var bays = RotundaLayout.Bays([new ShelfSection("Fantasy", ShelfSectionKind.Genre, Books(1, 5))]);

        Assert.Equal(RotundaLayout.MinBays, bays.Count);
        Assert.Equal("Fantasy", bays[0].Label);
        Assert.All(bays.Skip(1), b => { Assert.Null(b.Label); Assert.Empty(b.Rows); });
    }

    [Fact]
    public void ALargeCompartment_ContinuesInTheNextBay_AndRowsFit()
    {
        var bays = RotundaLayout.Bays(
        [
            new ShelfSection("Zuletzt gelesen", ShelfSectionKind.Recent, Books(1, 3), new Dictionary<int, double> { [1] = 50 }),
            new ShelfSection("Fantasy", ShelfSectionKind.Genre, Books(100, 60)),
        ]);

        Assert.Equal("Zuletzt gelesen", bays[0].Label);
        Assert.Equal(50, bays[0].Progress![1]);
        var fantasy = bays.Where(b => b.Label == "Fantasy").ToList();
        Assert.True(fantasy.Count >= 2);
        Assert.False(fantasy[0].Continued);
        Assert.True(fantasy[1].Continued);
        Assert.Equal(60, fantasy.Sum(b => b.Rows.Sum(r => r.Count)));
        Assert.All(fantasy, b => Assert.InRange(b.Rows.Count, 1, RotundaLayout.RowsPerBay));
        Assert.All(fantasy.SelectMany(b => b.Rows), row => Assert.True(Used(row) <= RotundaLayout.RowWidth));
    }

    [Fact]
    public void Radius_GrowsWithTheNumberOfBays()
    {
        Assert.True(RotundaLayout.Radius(20, 280) > RotundaLayout.Radius(10, 280));
        Assert.Equal(10 * 280 / (2 * Math.PI), RotundaLayout.Radius(10, 280), 3);
    }
}
