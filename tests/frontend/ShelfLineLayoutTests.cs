using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class ShelfLineLayoutTests
{
    private static List<Book> Books(int n) => Enumerable.Range(1, n).Select(i => new Book { Id = i, Title = $"B{i}" }).ToList();

    private static double Used(IEnumerable<Book> line, double zoom = 1)
    {
        var list = line.ToList();
        return list.Sum(b => ShelfLineLayout.SizeFor(b).Width * zoom) + ShelfLineLayout.Gap * (list.Count - 1);
    }

    [Fact]
    public void SizeFor_IsStableAndInRange()
    {
        foreach (var book in Books(200))
        {
            var size = ShelfLineLayout.SizeFor(book);
            Assert.InRange(size.Width, 26, 44);
            Assert.InRange(size.Height, 176, 222);
            Assert.Equal(size, ShelfLineLayout.SizeFor(new Book { Id = book.Id }));
        }
    }

    [Fact]
    public void Lines_FillEachLineWithoutExceedingTheWidth()
    {
        var lines = ShelfLineLayout.Lines(Books(60), 600, 1);

        Assert.Equal(60, lines.Sum(l => l.Count));
        Assert.All(lines, line => Assert.True(Used(line) <= 600));
        for (var i = 0; i < lines.Count - 1; i++)
        {
            Assert.True(Used(lines[i].Append(lines[i + 1][0])) > 600);
        }
    }

    [Fact]
    public void Lines_ZoomMakesLinesShorter()
    {
        Assert.True(ShelfLineLayout.Lines(Books(60), 600, 1.5).Count > ShelfLineLayout.Lines(Books(60), 600, 1).Count);
    }

    [Fact]
    public void Lines_UnknownWidth_KeepsOneLine_AndTinyWidth_StillPlacesEveryBook()
    {
        Assert.Single(ShelfLineLayout.Lines(Books(10), 0, 1));
        Assert.Equal(10, ShelfLineLayout.Lines(Books(10), 5, 1).Count);
    }

    [Fact]
    public void Lines_CoverForwardWidths_PutFewerBooksOnALine()
    {
        var lines = ShelfLineLayout.Lines(Books(5), 300, 1, _ => ShelfLineLayout.CoverWidth);

        Assert.Equal([2, 2, 1], lines.Select(l => l.Count));
        Assert.Equal(2 * ShelfLineLayout.CoverWidth + ShelfLineLayout.Gap, ShelfLineLayout.UsedWidth(lines[0], 1, _ => ShelfLineLayout.CoverWidth));
    }

    private static ShelfSection Section(string label, int from, int count, ShelfSectionKind kind = ShelfSectionKind.Genre) =>
        new(label, kind, Enumerable.Range(from, count).Select(i => new Book { Id = i, Title = $"B{i}" }).ToList());

    private static Func<Book, int> Spines(ShelfSection _) => b => ShelfLineLayout.SizeFor(b).Width;

    [Fact]
    public void Pack_SmallCompartmentsShareARow_RecentStandsAlone()
    {
        var sections = new List<ShelfSection>
        {
            Section("Zuletzt gelesen", 1, 2, ShelfSectionKind.Recent),
            Section("Fantasy", 10, 3), Section("Roman", 20, 1), Section("Klassiker", 30, 2),
        };

        var rows = ShelfLineLayout.Pack(sections, 900, 1, Spines, 40);

        Assert.Equal(2, rows.Count);
        Assert.Equal(["Zuletzt gelesen"], rows[0].Select(s => s.Section.Label));
        Assert.Equal(["Fantasy", "Roman", "Klassiker"], rows[1].Select(s => s.Section.Label));
        Assert.All(rows.SelectMany(r => r), s => Assert.True(s.First));
    }

    [Fact]
    public void Pack_ABigCompartment_StartsItsOwnRows_AndTheNextOneFollowsOnItsLastRow()
    {
        var sections = new List<ShelfSection> { Section("Fantasy", 100, 40), Section("Roman", 200, 2) };

        var rows = ShelfLineLayout.Pack(sections, 600, 1, Spines, 40);

        Assert.True(rows.Count >= 3);
        Assert.True(rows[0][0].First);
        Assert.False(rows[1][0].First);
        Assert.Equal(40, rows.SelectMany(r => r).Where(s => s.Section.Label == "Fantasy").Sum(s => s.Books.Count));
        // Roman fits beside the last Fantasy line or on a new row -- never split.
        Assert.Single(rows.SelectMany(r => r), s => s.Section.Label == "Roman");
        Assert.All(rows, row => Assert.True(row.Sum(s => ShelfLineLayout.UsedWidth(s.Books, 1, Spines(s.Section))) + 40 * (row.Count - 1) <= 600));
    }

    [Fact]
    public void Pack_UnknownWidth_GivesEveryCompartmentItsOwnRow()
    {
        var rows = ShelfLineLayout.Pack([Section("A", 1, 2), Section("B", 10, 2)], 0, 1, Spines, 40);

        Assert.Equal(2, rows.Count);
    }
}
