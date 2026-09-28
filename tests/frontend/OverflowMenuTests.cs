using Bunit;
using LuminaChronica.Client.Components;
using LuminaChronica.Client.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LuminaChronica.Client.Tests;

public class OverflowMenuTests : BunitContext
{
    public OverflowMenuTests() => Services.AddSingleton<II18nService, FakeI18nService>();

    private IRenderedComponent<OverflowMenu> RenderMenu(List<string> clicks) =>
        Render<OverflowMenu>(p => p
            .Add(x => x.Id, "actions")
            .Add(x => x.ChildContent, (RenderFragment)(b =>
            {
                b.OpenElement(0, "button");
                b.AddAttribute(1, "id", "edit");
                b.AddAttribute(2, "class", "overflow-menu-item");
                b.AddAttribute(3, "onclick", EventCallback.Factory.Create<MouseEventArgs>(this, () => clicks.Add("edit")));
                b.AddContent(4, "Bearbeiten");
                b.CloseElement();
            })));

    [Fact]
    public void Closed_PanelIsHidden_AndToggleHasAnAccessibleLabel()
    {
        var cut = RenderMenu([]);

        Assert.Equal("false", cut.Find("#actions").GetAttribute("aria-expanded"));
        Assert.Equal("Weitere Aktionen", cut.Find("#actions").GetAttribute("title"));
        Assert.True(cut.Find("#actions-panel").HasAttribute("hidden"));
    }

    [Fact]
    public void Toggle_OpensThePanel()
    {
        var cut = RenderMenu([]);
        cut.Find("#actions").Click();

        Assert.Equal("true", cut.Find("#actions").GetAttribute("aria-expanded"));
        Assert.False(cut.Find("#actions-panel").HasAttribute("hidden"));
    }

    [Fact]
    public void ClickingAnItem_RunsItsHandler_AndClosesTheMenu()
    {
        var clicks = new List<string>();
        var cut = RenderMenu(clicks);
        cut.Find("#actions").Click();

        cut.Find("#edit").Click();
        cut.Find("#actions-panel").Click();

        Assert.Equal(["edit"], clicks);
        Assert.True(cut.Find("#actions-panel").HasAttribute("hidden"));
    }

    [Fact]
    public void Escape_ClosesTheMenu()
    {
        var cut = RenderMenu([]);
        cut.Find("#actions").Click();

        cut.Find(".overflow-menu").KeyDown(new KeyboardEventArgs { Key = "Escape" });

        Assert.True(cut.Find("#actions-panel").HasAttribute("hidden"));
    }
}
