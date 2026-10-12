namespace LuminaChronica.Client.Models;

// One bookcase of the 3D library: which compartment it holds, on which tier
// of the rotunda and at which angle, and its books board by board.
public sealed record RoomCase(int Index, int Tier, double AngleDeg, int SectionIndex, string Label, bool Continued, bool Recent, IReadOnlyList<IReadOnlyList<Book>> Boards);

public sealed record RoomPlan(IReadOnlyList<RoomCase> Cases, int Tiers, int SlotsPerTier);

// Spec 2026-10-12 (3D-Bibliothek) §3.2: the rotunda's layout. Book sizes are
// ShelfLineLayout's, read as millimetres; each compartment starts a new case.
public static class LibraryRoomLayout
{
    public const int SlotsPerTier = 12;
    public const int MaxTiers = 3;
    public const int Boards = 5;
    public const int BoardWidthMm = 1500;
    public const int GapMm = 3;
    public const int RecentCoverMm = 150;

    public static RoomPlan Plan(IReadOnlyList<ShelfSection> sections)
    {
        var cases = new List<RoomCase>();
        var max = SlotsPerTier * MaxTiers;
        for (var s = 0; s < sections.Count && cases.Count < max; s++)
        {
            var section = sections[s];
            var recent = section.Kind == ShelfSectionKind.Recent;
            int WidthOf(Book b) => recent ? RecentCoverMm : ShelfLineLayout.SizeFor(b).Width;

            var boards = new List<IReadOnlyList<Book>>();
            var board = new List<Book>();
            var used = 0;
            var continued = false;
            void CloseCase()
            {
                var index = cases.Count;
                cases.Add(new RoomCase(index, index / SlotsPerTier, index % SlotsPerTier * (360.0 / SlotsPerTier), s, section.Label, continued, recent, boards));
                boards = [];
                continued = true;
            }

            foreach (var book in section.Books)
            {
                var w = WidthOf(book);
                if (board.Count > 0 && used + w > BoardWidthMm)
                {
                    boards.Add(board);
                    board = [];
                    used = 0;
                    if (boards.Count == Boards)
                    {
                        CloseCase();
                        if (cases.Count == max) break;
                    }
                }
                board.Add(book);
                used += w + GapMm;
            }
            if (cases.Count == max) break;
            if (board.Count > 0) boards.Add(board);
            if (boards.Count > 0 || !continued) CloseCase();
        }
        var tiers = Math.Max(1, (cases.Count + SlotsPerTier - 1) / SlotsPerTier);
        return new RoomPlan(cases, tiers, SlotsPerTier);
    }
}
