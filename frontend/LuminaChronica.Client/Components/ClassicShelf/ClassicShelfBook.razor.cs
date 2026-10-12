using LuminaChronica.Client.Models;
using Microsoft.AspNetCore.Components;

namespace LuminaChronica.Client.Components;

public partial class ClassicShelfBook
{
    // "Zuletzt gelesen" shows the cover instead of the spine.
    [Parameter]
    public bool CoverForward { get; set; }

    // Width of a cover-forward book at zoom 1 (ClassicShelf picks it).
    [Parameter]
    public int CoverWidth { get; set; } = ShelfLineLayout.CoverWidth;

    // data-spread-key: where BookSpread takes the book from.
    [Parameter]
    public string? SpreadKey { get; set; }

    [Parameter]
    public EventCallback OnOpen { get; set; }

    private string SlotStyle
    {
        get
        {
            if (CoverForward)
            {
                return $"--w: {Px(CoverWidth * Zoom)}; --h: {Px(CoverWidth * 1.44 * Zoom)}; --c: {Colour}";
            }
            var size = ShelfLineLayout.SizeFor(Book);
            return $"--w: {Px(size.Width * Zoom)}; --h: {Px(size.Height * Zoom)}; --c: {Colour}";
        }
    }
}
