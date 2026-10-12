using LuminaChronica.Client.Models;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class LibraryRoomLayoutTests
{
    private static Book B(int id) => new() { Id = id, Title = $"Buch {id}" };

    private static ShelfSection Genre(string label, int from, int count) =>
        new(label, ShelfSectionKind.Genre, Enumerable.Range(from, count).Select(B).ToList());

    [Fact]
    public void EachCompartmentStartsItsOwnCase_AroundTheRing()
    {
        var plan = LibraryRoomLayout.Plan([Genre("Fantasy", 1, 3), Genre("Roman", 10, 2)]);

        Assert.Equal(2, plan.Cases.Count);
        Assert.Equal(1, plan.Tiers);
        Assert.Equal(["Fantasy", "Roman"], plan.Cases.Select(c => c.Label));
        Assert.Equal([0d, 30d], plan.Cases.Select(c => c.AngleDeg));
        Assert.All(plan.Cases, c => Assert.False(c.Continued));
        Assert.Equal([1, 2, 3], plan.Cases[0].Boards[0].Select(b => b.Id));
    }

    [Fact]
    public void ABoardHoldsWhatFitsItsWidth_ThenTheNextBoard()
    {
        // 50 books of at most 44 mm (+3 mm gap) never fit one 1500 mm board.
        var plan = LibraryRoomLayout.Plan([Genre("Fantasy", 1, 50)]);

        var boards = plan.Cases[0].Boards;
        Assert.True(boards.Count >= 2);
        Assert.All(boards, board =>
            Assert.True(board.Sum(b => ShelfLineLayout.SizeFor(b).Width + LibraryRoomLayout.GapMm) <= LibraryRoomLayout.BoardWidthMm + LibraryRoomLayout.GapMm));
        Assert.Equal(50, boards.Sum(b => b.Count));
    }

    [Fact]
    public void ACompartmentTooBigForOneCase_ContinuesInTheNext()
    {
        var plan = LibraryRoomLayout.Plan([Genre("Fantasy", 1, 400)]);

        Assert.True(plan.Cases.Count >= 2);
        Assert.False(plan.Cases[0].Continued);
        Assert.True(plan.Cases[1].Continued);
        Assert.All(plan.Cases, c => Assert.True(c.Boards.Count <= LibraryRoomLayout.Boards));
        Assert.Equal(400, plan.Cases.Sum(c => c.Boards.Sum(b => b.Count)));
    }

    [Fact]
    public void MoreThanTwelveCases_OpenTheGallery()
    {
        var sections = Enumerable.Range(0, 14).Select(i => Genre($"G{i}", i * 10 + 1, 2)).ToList();

        var plan = LibraryRoomLayout.Plan(sections);

        Assert.Equal(2, plan.Tiers);
        Assert.Equal(1, plan.Cases[12].Tier);
        Assert.Equal(0d, plan.Cases[12].AngleDeg);
    }

    [Fact]
    public void RecentlyRead_StandsCoverForward()
    {
        var recent = new ShelfSection("Zuletzt gelesen", ShelfSectionKind.Recent, Enumerable.Range(1, 12).Select(B).ToList());

        var plan = LibraryRoomLayout.Plan([recent]);

        Assert.True(plan.Cases[0].Recent);
        // 150 mm per cover plus the 3 mm gap: nine fit a 1500 mm board.
        Assert.Equal(9, plan.Cases[0].Boards[0].Count);
        Assert.Equal(3, plan.Cases[0].Boards[1].Count);
    }

    [Fact]
    public void EmptyLibrary_HasNoCases()
    {
        var plan = LibraryRoomLayout.Plan([]);

        Assert.Empty(plan.Cases);
        Assert.Equal(1, plan.Tiers);
    }
}
