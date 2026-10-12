using LuminaChronica.Client.Models;

namespace LuminaChronica.Client.Components;

public partial class LeatherShelf
{
    // Leather volumes are a little wider than the classic books.
    internal static int WidthOf(Book book) => ShelfLineLayout.SizeFor(book).Width + 4;
}
