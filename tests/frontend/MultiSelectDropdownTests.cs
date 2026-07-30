using Bunit;
using LuminaChronica.Client.Components;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class MultiSelectDropdownTests : BunitContext
{
    [Fact]
    public void MultiSelectDropdown_ClosedByDefault_ShowsNoOptions()
    {
        var cut = Render<MultiSelectDropdown>(parameters => parameters
            .Add(p => p.Label, "Tag")
            .Add(p => p.Options, ["Fantasy", "Klassiker"]));

        Assert.Empty(cut.FindAll(".multiselect-pill"));
        Assert.Equal("Tag", cut.Find("button").TextContent.Trim());
    }

    [Fact]
    public void MultiSelectDropdown_TogglingButton_OpensPopoverWithOptions()
    {
        var cut = Render<MultiSelectDropdown>(parameters => parameters
            .Add(p => p.Label, "Tag")
            .Add(p => p.Options, ["Fantasy", "Klassiker"]));

        cut.Find("button").Click();

        Assert.Equal(2, cut.FindAll(".multiselect-pill").Count);
    }

    [Fact]
    public void MultiSelectDropdown_ClickingAnOption_RaisesSelectedValuesChangedWithTheNewSet()
    {
        IReadOnlyList<string>? changedTo = null;
        var cut = Render<MultiSelectDropdown>(parameters => parameters
            .Add(p => p.Label, "Tag")
            .Add(p => p.Options, ["Fantasy", "Klassiker"])
            .Add(p => p.SelectedValues, [])
            .Add(p => p.SelectedValuesChanged, (IReadOnlyList<string> values) => changedTo = values));

        cut.Find("button").Click();
        cut.FindAll(".multiselect-pill").Single(p => p.TextContent.Trim() == "Fantasy").Click();

        Assert.Equal(["Fantasy"], changedTo);
    }

    [Fact]
    public void MultiSelectDropdown_ClickingAnAlreadySelectedOption_RemovesIt()
    {
        IReadOnlyList<string>? changedTo = null;
        var cut = Render<MultiSelectDropdown>(parameters => parameters
            .Add(p => p.Label, "Tag")
            .Add(p => p.Options, ["Fantasy", "Klassiker"])
            .Add(p => p.SelectedValues, ["Fantasy", "Klassiker"])
            .Add(p => p.SelectedValuesChanged, (IReadOnlyList<string> values) => changedTo = values));

        cut.Find("button").Click();
        cut.FindAll(".multiselect-pill").Single(p => p.TextContent.Trim() == "Fantasy").Click();

        Assert.Equal(["Klassiker"], changedTo);
    }
}
