using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class CheckboxDropdownTests : BunitContext
{
    private static readonly IReadOnlyList<CheckboxDropdown.Option> Shelves =
        [new(1, "Nebel & Magie"), new(2, "Für den Winter"), new(3, "Klassiker")];

    public CheckboxDropdownTests() => Services.AddSingleton<II18nService, FakeI18nService>();

    private IRenderedComponent<CheckboxDropdown> RenderDropdown(HashSet<int> selected, List<(int, bool)>? toggles = null) =>
        Render<CheckboxDropdown>(p => p
            .Add(x => x.Id, "shelves")
            .Add(x => x.Label, "Regale")
            .Add(x => x.Options, Shelves)
            .Add(x => x.SelectedIds, selected)
            .Add(x => x.OnToggle, t => toggles?.Add(t)));

    [Fact]
    public void Closed_ShowsLabelWithCount_AndNoCheckboxes()
    {
        var cut = RenderDropdown([2]);

        Assert.Equal("Regale (1)", cut.Find("#shelves span").TextContent.Trim());
        Assert.Equal("false", cut.Find("#shelves").GetAttribute("aria-expanded"));
        Assert.Empty(cut.FindAll("input[type=checkbox]"));
    }

    [Fact]
    public void Open_ListsEveryOptionAsACheckbox_WithTheSelectionChecked()
    {
        var cut = RenderDropdown([2]);
        cut.Find("#shelves").Click();

        var boxes = cut.FindAll(".checkbox-dropdown-option");
        Assert.Equal(3, boxes.Count);
        Assert.Equal("true", cut.Find("#shelves").GetAttribute("aria-expanded"));
        Assert.True(boxes[1].QuerySelector("input")!.HasAttribute("checked"));
        Assert.False(boxes[0].QuerySelector("input")!.HasAttribute("checked"));
    }

    [Fact]
    public void TickingABox_ReportsTheOptionAndItsNewState()
    {
        var toggles = new List<(int, bool)>();
        var cut = RenderDropdown([], toggles);
        cut.Find("#shelves").Click();

        cut.FindAll(".checkbox-dropdown-option input")[2].Change(true);

        Assert.Equal([(3, true)], toggles);
    }

    [Fact]
    public void Escape_ClickOutside_AndDone_AllClose()
    {
        var cut = RenderDropdown([]);

        cut.Find("#shelves").Click();
        cut.Find(".checkbox-dropdown").KeyDown(new KeyboardEventArgs { Key = "Escape" });
        Assert.Empty(cut.FindAll(".checkbox-dropdown-panel"));

        cut.Find("#shelves").Click();
        cut.Find(".checkbox-dropdown-backdrop").Click();
        Assert.Empty(cut.FindAll(".checkbox-dropdown-panel"));

        cut.Find("#shelves").Click();
        cut.Find(".checkbox-dropdown-done").Click();
        Assert.Empty(cut.FindAll(".checkbox-dropdown-panel"));
    }
}

public class CharCounterTests : BunitContext
{
    [Fact]
    public void ShowsLengthOverMax_AndFlagsTheLastTenPercent()
    {
        var cut = Render<CharCounter>(p => p.Add(x => x.Value, "äöü📚").Add(x => x.Max, 100));
        // Counted like the browser's maxlength: the emoji is two UTF-16 units.
        Assert.Equal("5 / 100", cut.Find(".char-counter").TextContent.Trim());
        Assert.DoesNotContain("is-near-limit", cut.Find(".char-counter").ClassName);

        cut.Render(p => p.Add(x => x.Value, new string('x', 95)));
        Assert.Contains("is-near-limit", cut.Find(".char-counter").ClassName);
    }
}
