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
}
